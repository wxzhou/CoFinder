use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

struct SidecarState {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, tokio::sync::oneshot::Sender<Value>>>,
}

const CONTENT_WINDOW_LABEL: &str = "content";

fn sidecar_command() -> Result<(String, Vec<String>), String> {
    if cfg!(debug_assertions) {
        // Dev: spawn `node <project>/dist-electron/main/sidecar/index.js`
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").map_err(|e| e.to_string())?;
        let script = std::path::Path::new(&manifest_dir).join("../dist-electron/main/sidecar/index.js");
        let script = script
            .canonicalize()
            .map_err(|e| format!("sidecar script not built: {e}"))?;
        Ok(("node".to_string(), vec![script.to_string_lossy().into_owned()]))
    } else {
        // Release: bundled sidecar binary sits next to the app executable.
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let dir = exe.parent().ok_or_else(|| "no exe parent".to_string())?;
        let bin = dir.join("cofinder-sidecar");
        Ok((bin.to_string_lossy().into_owned(), vec![]))
    }
}

fn app_data_dir(app: &AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

fn spawn_sidecar(app: &AppHandle, state: &Arc<SidecarState>) -> Result<(), String> {
    let (program, args) = sidecar_command()?;
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    let data_dir = app_data_dir(app)?;
    cmd.env("COFINDER_USER_DATA", &data_dir);
    cmd.env("COFINDER_APP_DATA", &data_dir);
    cmd.env("COFINDER_APP_VERSION", app.package_info().version.to_string());
    cmd.env("COFINDER_PACKAGED", if cfg!(debug_assertions) { "0" } else { "1" });

    let mut child = cmd.spawn().map_err(|e| format!("failed to spawn sidecar {program}: {e}"))?;
    let stdin = child.stdin.take().ok_or_else(|| "no sidecar stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "no sidecar stdout".to_string())?;

    *state.child.lock().unwrap() = Some(child);
    *state.stdin.lock().unwrap() = Some(stdin);

    let handle = app.clone();
    let state_clone = Arc::clone(state);
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            if line.trim().is_empty() {
                continue;
            }
            let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
            handle_sidecar_line(&handle, &state_clone, msg);
        }
    });

    Ok(())
}

fn write_sidecar_line(state: &Arc<SidecarState>, payload: &Value) -> Result<(), String> {
    let mut guard = state.stdin.lock().unwrap();
    let stdin = guard.as_mut().ok_or_else(|| "sidecar stdin closed".to_string())?;
    stdin
        .write_all(format!("{payload}\n").as_bytes())
        .map_err(|e| format!("sidecar write failed: {e}"))?;
    stdin.flush().map_err(|e| format!("sidecar flush failed: {e}"))?;
    Ok(())
}

fn handle_sidecar_line(app: &AppHandle, state: &Arc<SidecarState>, msg: Value) {
    // Response to a pending request
    if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
        let sender = state.pending.lock().unwrap().remove(&id);
        if let Some(sender) = sender {
            let response = msg.get("response").cloned().unwrap_or(Value::Null);
            let _ = sender.send(response);
        }
        return;
    }
    // Event broadcast to the renderer
    if msg.get("type").and_then(|v| v.as_str()) == Some("event") {
        let channel = msg.get("channel").and_then(|v| v.as_str()).unwrap_or("");
        let payload = msg.get("payload").cloned().unwrap_or(Value::Null);
        let event = json!({ "channel": channel, "payload": payload });
        if channel == "content:openRequest" {
            // Route content viewer requests to the content window only.
            if let Some(win) = app.get_webview_window(CONTENT_WINDOW_LABEL) {
                let _ = win.emit("cofinder:event", event);
            }
        } else {
            let _ = app.emit("cofinder:event", event);
        }
        return;
    }
    // System signal: open the content window
    if msg.get("type").and_then(|v| v.as_str()) == Some("sys") {
        if msg.get("action").and_then(|v| v.as_str()) == Some("openContentWindow") {
            open_content_window(app, state);
        }
        return;
    }
}

fn open_content_window(app: &AppHandle, _state: &Arc<SidecarState>) {
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

#[tauri::command]
async fn cofinder_call(
    state: State<'_, Arc<SidecarState>>,
    channel: String,
    request: Option<Value>,
) -> Result<Value, String> {
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.pending.lock().unwrap().insert(id, tx);

    write_sidecar_line(&state, &json!({ "id": id, "channel": channel, "request": request }))?;

    let result = tokio::time::timeout(std::time::Duration::from_secs(300), rx)
        .await
        .map_err(|_| {
            state.pending.lock().unwrap().remove(&id);
            "sidecar request timed out".to_string()
        })?
        .map_err(|_| "sidecar closed the channel".to_string())?;
    Ok(result)
}

/// Called by the content window after its renderer subscribes to
/// `content:onOpenRequest`. Tells the sidecar to flush buffered requests.
#[tauri::command]
async fn content_window_ready(app: AppHandle, state: State<'_, Arc<SidecarState>>) -> Result<(), String> {
    write_sidecar_line(&state, &json!({ "type": "sys", "action": "contentReady" }))?;
    if let Some(win) = app.get_webview_window(CONTENT_WINDOW_LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

/// Manually opens the content window (used if the sidecar sys signal was lost).
#[tauri::command]
async fn open_content_window_command(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Arc<SidecarState>>();
    open_content_window(&app, &state);
    Ok(())
}

pub fn run() {
    let state = Arc::new(SidecarState {
        child: Mutex::new(None),
        stdin: Mutex::new(None),
        next_id: AtomicU64::new(1),
        pending: Mutex::new(HashMap::new()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            cofinder_call,
            content_window_ready,
            open_content_window_command
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<Arc<SidecarState>>();
            spawn_sidecar(&handle, &state)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
