//! Lucid Sentence: a Tauri 2 shell around the web app in `apps/demo`, which
//! edits .docx files with the ONLYOFFICE engine (engine/). The shell provides
//! native file dialogs and file access (tauri-plugin-dialog, tauri-plugin-fs),
//! hands the web app the documents the OS asks it to open, and hosts the
//! optional on-device AI (`ai`, and the desktop-only local MCP server in `mcp`).

mod ai;
#[cfg(desktop)]
mod mcp;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri_plugin_fs::FsExt;

#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::{Emitter, Manager};

/// Documents the OS asked us to open (file association, "Open With", or a file
/// passed on the command line), as absolute paths. Each one is added to the
/// file-system scope so the web app can read and save exactly that file.
#[derive(Default)]
struct OpenedFiles(Mutex<Vec<PathBuf>>);

const DOC_EXTENSIONS: [&str; 3] = ["docx", "dotx", "docm"];

fn is_document(path: &Path) -> bool {
    path.extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .is_some_and(|e| DOC_EXTENSIONS.contains(&e.as_str()))
}

/// Windows and Linux pass opened files as command-line arguments.
fn paths_from_args() -> Vec<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| is_document(p))
        .map(|p| std::path::absolute(&p).unwrap_or(p))
        .collect()
}

/// Called by the web app on start and whenever it is told new files arrived.
/// Returns the paths and lets the web app read and write those files only.
#[tauri::command]
fn take_opened_files(app: tauri::AppHandle, state: tauri::State<'_, OpenedFiles>) -> Vec<String> {
    let files = {
        let mut files = state.0.lock().unwrap_or_else(|e| e.into_inner());
        std::mem::take(&mut *files)
    };
    let scope = app.fs_scope();
    files
        .into_iter()
        .filter(|p| scope.allow_file(p).is_ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// The CPU architecture this build is for ("aarch64", "arm", "x86_64", "x86"). The
/// Android app uses it to download the update APK built for this device.
#[tauri::command]
fn app_arch() -> &'static str {
    std::env::consts::ARCH
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());
    // Desktop: signed auto-updates (the web app asks; see apps/demo/src/updates.ts).
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    let builder = builder
        .manage(OpenedFiles(Mutex::new(paths_from_args())))
        .manage(ai::AiState::default());
    // The local MCP server is desktop only (plan §9.7) and off until the user enables it.
    #[cfg(desktop)]
    let builder =
        builder
            .manage(mcp::McpState::default())
            .invoke_handler(tauri::generate_handler![
                take_opened_files,
                app_arch,
                ai::ai_device_info,
                ai::ai_model_status,
                ai::ai_download,
                ai::ai_download_cancel,
                ai::ai_delete,
                ai::ai_load,
                ai::ai_unload,
                ai::ai_generate,
                ai::ai_cancel,
                mcp::mcp_status,
                mcp::mcp_set_enabled,
                mcp::mcp_create_key,
                mcp::mcp_revoke,
                mcp::mcp_revoke_all,
                mcp::mcp_reply,
                mcp::mcp_audit,
            ]);
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        take_opened_files,
        app_arch,
        ai::ai_device_info,
        ai::ai_model_status,
        ai::ai_download,
        ai::ai_download_cancel,
        ai::ai_delete,
        ai::ai_load,
        ai::ai_unload,
        ai::ai_generate,
        ai::ai_cancel,
    ]);
    let app = builder
        .build(tauri::generate_context!())
        .expect("failed to start Lucid Sentence");

    app.run(|_handle, _event| {
        // macOS delivers "Open With" / double-clicked documents as an event.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &_event {
            let paths: Vec<PathBuf> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .filter(|p| is_document(p))
                .collect();
            if !paths.is_empty() {
                let state = _handle.state::<OpenedFiles>();
                state
                    .0
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .extend(paths);
                let _ = _handle.emit("ls-open-files", ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::is_document;
    use std::path::Path;

    #[test]
    fn keeps_only_word_documents() {
        assert!(is_document(Path::new("/a/Report.DOCX")));
        assert!(is_document(Path::new("Plan.dotx")));
        assert!(!is_document(Path::new("/a/notes.txt")));
        assert!(!is_document(Path::new("/a/old.doc")));
        assert!(!is_document(Path::new("/a/no-extension")));
    }
}
