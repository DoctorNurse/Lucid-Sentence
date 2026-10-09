//! Lucid Sentence installable preview: a Tauri 2 shell around the web app in
//! `apps/demo`. The shell only hosts the UI; documents are not read or written
//! here yet. When the ONLYOFFICE engine lands, it replaces the bundled web app
//! (see apps/shell/README.md).

use std::path::Path;
use std::sync::Mutex;

#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::{Emitter, Manager};

/// Names of documents the OS asked us to open (file association, "Open With",
/// or a file passed on the command line). Only the file name is kept: the
/// preview never reads the file.
#[derive(Default)]
struct OpenedFiles(Mutex<Vec<String>>);

const DOC_EXTENSIONS: [&str; 3] = ["docx", "dotx", "docm"];

fn document_name(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    if !DOC_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    Some(path.file_name()?.to_string_lossy().into_owned())
}

/// Windows and Linux pass opened files as command-line arguments.
fn names_from_args() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .filter_map(|a| document_name(Path::new(&a)))
        .collect()
}

/// Called by the web app on start and whenever it is told new files arrived.
#[tauri::command]
fn take_opened_files(state: tauri::State<'_, OpenedFiles>) -> Vec<String> {
    let mut files = state.0.lock().unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut *files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(OpenedFiles(Mutex::new(names_from_args())))
        .invoke_handler(tauri::generate_handler![take_opened_files])
        .build(tauri::generate_context!())
        .expect("failed to start Lucid Sentence");

    app.run(|_handle, _event| {
        // macOS delivers "Open With" / double-clicked documents as an event.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &_event {
            let names: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .filter_map(|p| document_name(&p))
                .collect();
            if !names.is_empty() {
                let state = _handle.state::<OpenedFiles>();
                state
                    .0
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .extend(names);
                let _ = _handle.emit("ls-open-files", ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::document_name;
    use std::path::Path;

    #[test]
    fn keeps_only_word_documents() {
        assert_eq!(
            document_name(Path::new("/a/Report.DOCX")).as_deref(),
            Some("Report.DOCX")
        );
        assert!(document_name(Path::new("Plan.dotx")).is_some());
        assert_eq!(document_name(Path::new("/a/notes.txt")), None);
        assert_eq!(document_name(Path::new("/a/old.doc")), None);
    }
}
