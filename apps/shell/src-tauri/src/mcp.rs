//! Desktop-only bridge between the local MCP server (lucid_ai::mcp) and the web app.
//!
//! Off by default. The listener starts only when the user turns on
//! "Share with AI" in the app and stops with the kill switch. Tool calls are forwarded
//! to the WebView as `ls-mcp-call` events; the app answers with `mcp_reply` after showing
//! suggestions or asking the user to confirm a command.

use lucid_ai::mcp::{self, AuditEntry, KeyInfo, Keys, OsHashStore, Permission, ToolHost};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

/// Tool calls waiting for the WebView's answer, by call id.
type Pending = Arc<Mutex<HashMap<u64, Sender<Result<Value, String>>>>>;

#[derive(Default)]
pub struct McpState {
    inner: Mutex<Option<Running>>,
    keys: Mutex<Option<Arc<Keys>>>,
    pending: Pending,
}

struct Running {
    server: mcp::Server,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn keys(app: &AppHandle, state: &McpState) -> Result<Arc<Keys>, String> {
    let mut k = lock(&state.keys);
    if let Some(k) = k.as_ref() {
        return Ok(k.clone());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("mcp");
    let keys = Arc::new(Keys::open(&dir, Box::new(OsHashStore::new(&dir))));
    *k = Some(keys.clone());
    Ok(keys)
}

struct WebViewHost {
    app: AppHandle,
    pending: Pending,
    next: AtomicU64,
}

impl ToolHost for WebViewHost {
    fn call(
        &self,
        key: &KeyInfo,
        tool: &str,
        args: &Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        let id = self.next.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = channel();
        lock(&self.pending).insert(id, tx);
        let payload = json!({
            "id": id,
            "tool": tool,
            "args": args,
            "key": {"keyId": key.key_id, "docId": key.doc_id, "label": key.label, "permission": key.permission},
        });
        if self.app.emit("ls-mcp-call", payload).is_err() {
            lock(&self.pending).remove(&id);
            return Err("The app is not ready".into());
        }
        let r = rx
            .recv_timeout(timeout)
            .unwrap_or_else(|_| Err("Timed out waiting for the app".into()));
        lock(&self.pending).remove(&id);
        r
    }

    fn activity(&self, key: &KeyInfo, tool: &str) {
        let _ = self
            .app
            .emit("ls-mcp-activity", json!({"label": key.label, "tool": tool}));
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    running: bool,
    port: Option<u16>,
    endpoint: Option<String>,
    keys: Vec<KeyInfo>,
}

fn status_of(app: &AppHandle, state: &McpState) -> Result<McpStatus, String> {
    let port = lock(&state.inner).as_ref().map(|r| r.server.port);
    Ok(McpStatus {
        running: port.is_some(),
        port,
        endpoint: port.map(|p| format!("http://127.0.0.1:{p}/mcp")),
        keys: keys(app, state)?.list(),
    })
}

#[tauri::command]
pub fn mcp_status(app: AppHandle, state: State<'_, McpState>) -> Result<McpStatus, String> {
    status_of(&app, &state)
}

/// Starts or stops the listener. Stopping is the kill switch: open requests fail and
/// the port closes immediately.
#[tauri::command]
pub fn mcp_set_enabled(
    app: AppHandle,
    state: State<'_, McpState>,
    on: bool,
) -> Result<McpStatus, String> {
    let mut inner = lock(&state.inner);
    if on && inner.is_none() {
        let host = Arc::new(WebViewHost {
            app: app.clone(),
            pending: state.pending.clone(),
            next: AtomicU64::new(1),
        });
        let server = mcp::start(keys(&app, &state)?, host).map_err(|e| e.to_string())?;
        // A user-only file tells local MCP clients where to connect.
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = mcp::write_private(
                &dir.join("mcp").join("endpoint.json"),
                json!({"url": format!("http://127.0.0.1:{}/mcp", server.port)})
                    .to_string()
                    .as_bytes(),
            );
        }
        *inner = Some(Running { server });
    } else if !on {
        if let Some(r) = inner.take() {
            r.server.stop();
        }
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = std::fs::remove_file(dir.join("mcp").join("endpoint.json"));
        }
        for (_, tx) in lock(&state.pending).drain() {
            let _ = tx.send(Err("AI access was stopped".into()));
        }
    }
    drop(inner);
    status_of(&app, &state)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewKey {
    key: String,
    info: KeyInfo,
}

#[tauri::command]
pub fn mcp_create_key(
    app: AppHandle,
    state: State<'_, McpState>,
    doc_id: String,
    permission: Permission,
    label: String,
    ttl_secs: Option<u64>,
) -> Result<NewKey, String> {
    if doc_id.is_empty() || doc_id.len() > 64 {
        return Err("Invalid document id".into());
    }
    let (key, info) = keys(&app, &state)?.create(&doc_id, permission, &label, ttl_secs)?;
    Ok(NewKey { key, info })
}

#[tauri::command]
pub fn mcp_revoke(
    app: AppHandle,
    state: State<'_, McpState>,
    key_id: String,
) -> Result<(), String> {
    keys(&app, &state)?.revoke(&key_id);
    Ok(())
}

#[tauri::command]
pub fn mcp_revoke_all(app: AppHandle, state: State<'_, McpState>) -> Result<(), String> {
    keys(&app, &state)?.revoke_all();
    Ok(())
}

#[tauri::command]
pub fn mcp_reply(state: State<'_, McpState>, id: u64, ok: bool, value: Value) {
    if let Some(tx) = lock(&state.pending).remove(&id) {
        let _ = tx.send(if ok {
            Ok(value)
        } else {
            Err(value.as_str().unwrap_or("Failed").to_string())
        });
    }
}

#[tauri::command]
pub fn mcp_audit(state: State<'_, McpState>) -> Vec<AuditEntry> {
    lock(&state.inner)
        .as_ref()
        .map(|r| r.server.audit_log())
        .unwrap_or_default()
}
