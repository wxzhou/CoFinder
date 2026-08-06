use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

mod backend;
mod menu;

const CONTENT_WINDOW_LABEL: &str = "content";

/// Resolves the app data directory.
///
/// Prefers the legacy Electron userData directory
/// (`~/Library/Application Support/cofinder`) so existing profiles, settings,
/// and sidebar favorites carry over; falls back to the Tauri default
/// (`~/Library/Application Support/com.wxzhou.cofinder`) on fresh installs.
/// Saved passwords are NOT migrated (Electron `safeStorage` uses a different
/// key); they must be re-entered once.
fn app_data_dir(app: &AppHandle) -> Result<String, String> {
    let legacy = home_dir_legacy_user_data();
    if std::path::Path::new(&legacy).exists() {
        return Ok(legacy);
    }
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

fn home_dir_legacy_user_data() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    std::path::Path::new(&home)
        .join("Library/Application Support/cofinder")
        .to_string_lossy()
        .into_owned()
}

fn open_content_window(app: &AppHandle) {
    let existing = app.get_webview_window(CONTENT_WINDOW_LABEL);
    if let Some(win) = existing {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, CONTENT_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("CoFinder Content")
        .inner_size(980.0, 720.0)
        .min_inner_size(640.0, 420.0)
        .initialization_script("window.__COFINDER_CONTENT__ = true;")
        .build();
}

/// Single IPC entry point: every channel is handled by the Rust backend.
#[tauri::command]
async fn cofinder_call(
    app: AppHandle,
    backend: State<'_, Arc<backend::BackendState>>,
    channel: String,
    request: Option<Value>,
) -> Result<Value, String> {
    // Debug tracing: record every IPC call to a log file so remote-connect
    // hangs can be diagnosed from the packaged app.
    let log_path = std::path::Path::new("/tmp/cofinder-rs-calls.log");
    let line = format!("call {channel} req={}\n", request.clone().unwrap_or(Value::Null));
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log_path) {
        use std::io::Write;
        let _ = f.write_all(line.as_bytes());
    }

    // `content:openWindow` needs the AppHandle to open/show the content window
    // and to forward the request to it — handled here, outside dispatch.
    if channel == "content:openWindow" {
        return handle_content_open(&app, request.as_ref());
    }

    // `dispatch` may block (e.g. RemoteService calls block_on on its own tokio
    // runtime for SFTP). Running it on a blocking thread avoids deadlocking
    // Tauri's async worker pool, which would make remote connects hang forever.
    let backend_clone = backend.inner().clone();
    let channel2 = channel.clone();
    let request2 = request.clone();
    let handled = tauri::async_runtime::spawn_blocking(move || {
        backend_clone.dispatch(&channel2, request2.as_ref())
    })
    .await
    .map_err(|e| format!("backend task join failed: {e}"))?;

    match handled {
        Ok(Some(response)) => Ok(response),
        Ok(None) => Err(format!("unhandled channel: {channel}")),
        Err(err) => Ok(backend::fail(&err)),
    }
}

/// Open the content viewer window and forward the request to it. Port of the
/// the legacy `openContentWindow` + `content:openRequest` flow.
fn handle_content_open(app: &AppHandle, request: Option<&Value>) -> Result<Value, String> {
    let req = request.ok_or_else(|| "content:openWindow requires a request".to_string())?;
    // Validate kind/pane/path minimally (renderer re-validates on read).
    let kind = req.get("kind").and_then(|v| v.as_str());
    let pane = req.get("pane").and_then(|v| v.as_str());
    let path = req.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let connection_id = req.get("connectionId").and_then(|v| v.as_str()).map(|s| s.to_string());
    let title = req.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
    if kind.is_none() || pane.is_none() || path.is_empty() {
        return Err("Invalid content:openWindow request.".to_string());
    }
    // The renderer consumes the same openRequest shape it did before.
    let open_request = json!({
        "kind": kind.unwrap(),
        "pane": pane.unwrap(),
        "path": path,
        "connectionId": connection_id,
        "title": title,
    });
    open_content_window(app);
    let event = json!({ "channel": "content:openRequest", "payload": open_request });
    if let Some(win) = app.get_webview_window(CONTENT_WINDOW_LABEL) {
        let _ = win.emit("cofinder:event", event);
    }
    Ok(serde_json::json!({ "ok": true, "data": { "opened": true } }))
}

/// Called by the content window after its renderer subscribes to
/// `content:onOpenRequest`.
#[tauri::command]
async fn content_window_ready(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(CONTENT_WINDOW_LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

/// Manually opens the content window.
#[tauri::command]
async fn open_content_window_command(app: AppHandle) -> Result<(), String> {
    open_content_window(&app);
    Ok(())
}

/// Native message dialog (replaces the WKWebView's unsupported `window.alert`).
#[tauri::command]
async fn native_alert(app: AppHandle, message: String, title: Option<String>) -> Result<(), String> {
    tauri_plugin_dialog::DialogExt::dialog(&app)
        .message(message)
        .title(title.unwrap_or_else(|| "CoFinder".to_string()))
        .blocking_show();
    Ok(())
}

/// Native yes/no dialog (replaces the WKWebView's unsupported `window.confirm`).
#[tauri::command]
async fn native_confirm(app: AppHandle, message: String, title: Option<String>) -> Result<bool, String> {
    let confirmed = tauri_plugin_dialog::DialogExt::dialog(&app)
        .message(message)
        .title(title.unwrap_or_else(|| "CoFinder".to_string()))
        .buttons(tauri_plugin_dialog::MessageDialogButtons::YesNo)
        .blocking_show();
    Ok(confirmed)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cofinder_call,
            content_window_ready,
            open_content_window_command,
            native_alert,
            native_confirm
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Rust-native backend lives in the same user-data directory.
            let data_dir = app_data_dir(&handle)?;
            let backend = Arc::new(backend::BackendState::new(&data_dir));
            {
                // Push transfer:onUpdate events to the renderer.
                let emitter = handle.clone();
                backend.transfer.set_on_update(Box::new(move |tasks| {
                    let event = json!({ "channel": "transfer:onUpdate", "payload": { "tasks": tasks } });
                    let _ = emitter.emit("cofinder:event", event);
                }));
            }
            {
                // Push remote:editUpdate sessions to the renderer.
                let emitter = handle.clone();
                backend.remote_edit.set_on_session_change(Box::new(move |session| {
                    let event = json!({ "channel": "remote:editUpdate", "payload": session });
                    let _ = emitter.emit("cofinder:event", event);
                }));
            }
            {
                // Generic push channel (directory-size updates, etc).
                let emitter = handle.clone();
                *backend.emit_event.lock().unwrap() = Some(Box::new(move |channel: &str, payload: Value| {
                    let event = json!({ "channel": channel, "payload": payload });
                    let _ = emitter.emit("cofinder:event", event);
                }));
            }
            app.manage(backend);

            let built = menu::build_menu(&handle)?;
            app.set_menu(built)?;
            let handle_clone = handle.clone();
            app.on_menu_event(move |app_handle, event| {
                let _ = &handle_clone;
                menu::handle_menu_event(app_handle, event);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
