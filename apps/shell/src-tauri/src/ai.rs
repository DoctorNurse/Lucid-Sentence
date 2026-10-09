//! On-device AI commands for the web app (see packages/ai and docs/AI.md).
//!
//! Models are downloaded natively into the app-data `models/` folder, verified against
//! the pinned SHA-256, and run with llama.cpp in this process (never in the WebView).
//! The only network access is a model download the user starts, and only from
//! huggingface.co. There is no telemetry.

use lucid_ai::download::{self, DownloadSpec, Outcome};
use lucid_ai::engine::{Engine, GenerateRequest, GenerateStats, LoadOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct AiState {
    engine: Mutex<Option<(String, Arc<Engine>)>>,
    cancels: Mutex<HashMap<u64, Arc<AtomicBool>>>,
    downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Accepts only a bare `*.gguf` file name, so the WebView can't point at other paths.
pub fn safe_file_name(name: &str) -> Result<&str, String> {
    let ok = !name.is_empty()
        && name.len() <= 128
        && name.ends_with(".gguf")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        && !name.starts_with('.');
    if ok {
        Ok(name)
    } else {
        Err("Invalid model file name".into())
    }
}

/// Model downloads may only come from Hugging Face over HTTPS (the pinned manifest).
pub fn allowed_url(url: &str) -> bool {
    url.starts_with("https://huggingface.co/")
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn model_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(safe_file_name(file_name)?))
}

#[tauri::command]
pub fn ai_device_info() -> lucid_ai::device::DeviceInfo {
    lucid_ai::device::info()
}

#[derive(Serialize)]
pub struct ModelStatus {
    state: &'static str,
    bytes: u64,
}

#[tauri::command]
pub fn ai_model_status(
    app: AppHandle,
    file_name: String,
    size: u64,
) -> Result<ModelStatus, String> {
    let path = model_path(&app, &file_name)?;
    if let Ok(m) = std::fs::metadata(&path) {
        if m.len() == size {
            return Ok(ModelStatus {
                state: "ready",
                bytes: size,
            });
        }
    }
    let partial = download::resume_offset(&path);
    Ok(ModelStatus {
        state: if partial > 0 { "partial" } else { "none" },
        bytes: partial,
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    file_name: String,
    phase: &'static str,
    done: u64,
    total: u64,
}

#[tauri::command]
pub async fn ai_download(
    app: AppHandle,
    state: State<'_, AiState>,
    url: String,
    file_name: String,
    size: u64,
    sha256: String,
) -> Result<&'static str, String> {
    if !allowed_url(&url) {
        return Err("Downloads are only allowed from huggingface.co".into());
    }
    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid checksum".into());
    }
    let dest = model_path(&app, &file_name)?;
    let cancel = Arc::new(AtomicBool::new(false));
    lock(&state.downloads).insert(file_name.clone(), cancel.clone());
    let spec = DownloadSpec {
        url,
        sha256,
        size,
        dest,
    };
    let app2 = app.clone();
    let name = file_name.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut progress = |done: u64, total: u64| {
            let phase = if done >= total {
                "verifying"
            } else {
                "downloading"
            };
            let _ = app2.emit(
                "ai-download-progress",
                DownloadProgress {
                    file_name: name.clone(),
                    phase,
                    done,
                    total,
                },
            );
        };
        download::download(&spec, &cancel, &mut progress)
    })
    .await
    .map_err(|e| e.to_string())?;
    lock(&state.downloads).remove(&file_name);
    match result {
        Ok(Outcome::Done) => Ok("done"),
        Ok(Outcome::Cancelled) => Ok("paused"),
        Err(e) if e.0 == "cancelled" => Ok("paused"),
        Err(e) => Err(e.0),
    }
}

#[tauri::command]
pub fn ai_download_cancel(state: State<'_, AiState>, file_name: String) {
    if let Some(c) = lock(&state.downloads).get(&file_name) {
        c.store(true, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn ai_delete(
    app: AppHandle,
    state: State<'_, AiState>,
    file_name: String,
) -> Result<(), String> {
    let path = model_path(&app, &file_name)?;
    {
        let mut engine = lock(&state.engine);
        if engine.as_ref().is_some_and(|(n, _)| *n == file_name) {
            *engine = None;
        }
    }
    download::delete(&path).map_err(|e| e.0)
}

#[tauri::command]
pub async fn ai_load(
    app: AppHandle,
    state: State<'_, AiState>,
    file_name: String,
    n_ctx: Option<u32>,
) -> Result<(), String> {
    if lock(&state.engine)
        .as_ref()
        .is_some_and(|(n, _)| *n == file_name)
    {
        return Ok(());
    }
    *lock(&state.engine) = None;
    let path = model_path(&app, &file_name)?;
    if !path.exists() {
        return Err("The model is not downloaded".into());
    }
    let opts = LoadOptions {
        n_ctx: n_ctx.unwrap_or(4096).clamp(512, 8192),
        ..Default::default()
    };
    let engine = tauri::async_runtime::spawn_blocking(move || Engine::load(&path, opts))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.0)?;
    *lock(&state.engine) = Some((file_name, Arc::new(engine)));
    Ok(())
}

#[tauri::command]
pub fn ai_unload(state: State<'_, AiState>) {
    *lock(&state.engine) = None;
}

#[derive(Clone, Serialize)]
struct TokenEvent {
    id: u64,
    piece: String,
}

#[derive(Serialize)]
pub struct GenerateResponse {
    text: String,
    stats: GenerateStats,
}

#[tauri::command]
pub async fn ai_generate(
    app: AppHandle,
    state: State<'_, AiState>,
    id: u64,
    request: GenerateRequest,
) -> Result<GenerateResponse, String> {
    let engine = lock(&state.engine)
        .as_ref()
        .map(|(_, e)| e.clone())
        .ok_or("No model loaded")?;
    let cancel = Arc::new(AtomicBool::new(false));
    lock(&state.cancels).insert(id, cancel.clone());
    let app2 = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        engine.generate(&request, |piece| {
            let _ = app2.emit(
                "ai-token",
                TokenEvent {
                    id,
                    piece: piece.to_string(),
                },
            );
            !cancel.load(Ordering::SeqCst)
        })
    })
    .await
    .map_err(|e| e.to_string())?;
    lock(&state.cancels).remove(&id);
    let (text, stats) = result.map_err(|e| e.0)?;
    Ok(GenerateResponse { text, stats })
}

#[tauri::command]
pub fn ai_cancel(state: State<'_, AiState>, id: u64) {
    if let Some(c) = lock(&state.cancels).get(&id) {
        c.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_are_confined() {
        assert!(safe_file_name("Qwen3.5-2B-Q4_K_M.gguf").is_ok());
        assert!(safe_file_name("../secrets.gguf").is_err());
        assert!(safe_file_name("a/b.gguf").is_err());
        assert!(safe_file_name("model.bin").is_err());
        assert!(safe_file_name(".hidden.gguf").is_err());
        assert!(safe_file_name("").is_err());
    }

    #[test]
    fn downloads_only_from_hugging_face() {
        assert!(allowed_url(
            "https://huggingface.co/unsloth/x/resolve/abc/m.gguf"
        ));
        assert!(!allowed_url("http://huggingface.co/x"));
        assert!(!allowed_url("https://huggingface.co.evil.example/x"));
        assert!(!allowed_url("https://example.com/m.gguf"));
    }
}
