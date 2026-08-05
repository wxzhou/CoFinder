//! Native application menu, mirroring the Electron-era `installApplicationMenu`.
//!
//! Menu items that drive the renderer emit `cofinder:event` payloads with the
//! same channel strings the renderer bridge subscribes to:
//!   system:openPreferences, system:setPaneViewMode, system:togglePaneGroupByType

use serde_json::json;
use tauri::menu::{Menu, MenuEvent, MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

const ID_PREFERENCES: &str = "preferences";
const ID_LOCAL_VIEW: &str = "view.local";
const ID_REMOTE_VIEW: &str = "view.remote";
const ID_LOCAL_GROUP: &str = "group.local";
const ID_REMOTE_GROUP: &str = "group.remote";
const ID_RELOAD: &str = "view.reload";
const ID_FORCE_RELOAD: &str = "view.forceReload";
const ID_DEVTOOLS: &str = "view.devtools";
const ID_RESET_ZOOM: &str = "view.resetZoom";
const ID_ZOOM_IN: &str = "view.zoomIn";
const ID_ZOOM_OUT: &str = "view.zoomOut";
const ID_FULLSCREEN: &str = "view.fullscreen";

fn view_mode_submenu(app: &AppHandle, id_prefix: &str, label: &str) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    SubmenuBuilder::new(app, label)
        .text(format!("{id_prefix}:list"), "List")
        .text(format!("{id_prefix}:icon"), "Icon")
        .text(format!("{id_prefix}:column"), "Column")
        .text(format!("{id_prefix}:gallery"), "Gallery")
        .separator()
        .text(format!("{id_prefix}:group"), "Group by Type")
        .build()
}

pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let local_view = view_mode_submenu(app, ID_LOCAL_VIEW, "Local View")?;
    let remote_view = view_mode_submenu(app, ID_REMOTE_VIEW, "Remote View")?;

    let app_menu = SubmenuBuilder::new(app, "CoFinder")
        .about(None)
        .separator()
        .text(ID_PREFERENCES, "Preferences…")
        .separator()
        .hide()
        .hide_others()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&local_view)
        .item(&remote_view)
        .separator()
        .text(ID_RELOAD, "Reload")
        .text(ID_FORCE_RELOAD, "Force Reload")
        .text(ID_DEVTOOLS, "Toggle Developer Tools")
        .separator()
        .text(ID_RESET_ZOOM, "Actual Size")
        .text(ID_ZOOM_IN, "Zoom In")
        .text(ID_ZOOM_OUT, "Zoom Out")
        .separator()
        .text(ID_FULLSCREEN, "Toggle Full Screen")
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .close_window()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()
}

pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref();
    match id {
        ID_PREFERENCES => {
            let _ = app.emit("cofinder:event", json!({ "channel": "system:openPreferences", "payload": {} }));
        }
        ID_LOCAL_GROUP => {
            let _ = app.emit(
                "cofinder:event",
                json!({ "channel": "system:togglePaneGroupByType", "payload": { "pane": "local" } }),
            );
        }
        ID_REMOTE_GROUP => {
            let _ = app.emit(
                "cofinder:event",
                json!({ "channel": "system:togglePaneGroupByType", "payload": { "pane": "remote" } }),
            );
        }
        ID_RELOAD => {
            let _ = app.get_webview_window("main").map(|w| w.eval("window.location.reload()"));
        }
        ID_FORCE_RELOAD => {
            let _ = app.get_webview_window("main").map(|w| w.eval("window.location.reload()"));
        }
        ID_DEVTOOLS => {
            let _ = app.get_webview_window("main").map(|w| w.open_devtools());
        }
        ID_RESET_ZOOM => {
            let _ = app.get_webview_window("main").map(|w| w.set_zoom(1.0));
        }
        ID_ZOOM_IN => {
            let _ = app.get_webview_window("main").map(|w| {
                let current = w.scale_factor().unwrap_or(1.0);
                let _ = w.set_zoom(current + 0.1);
            });
        }
        ID_ZOOM_OUT => {
            let _ = app.get_webview_window("main").map(|w| {
                let current = w.scale_factor().unwrap_or(1.0);
                let _ = w.set_zoom((current - 0.1).max(0.5));
            });
        }
        ID_FULLSCREEN => {
            let _ = app
                .get_webview_window("main")
                .map(|w| w.set_fullscreen(!w.is_fullscreen().unwrap_or(false)));
        }
        _ => {
            // View-mode items carry ids like "view.local:list".
            if let Some(rest) = id.strip_prefix("view.local:") {
                let _ = app.emit(
                    "cofinder:event",
                    json!({ "channel": "system:setPaneViewMode", "payload": { "pane": "local", "viewMode": rest } }),
                );
            } else if let Some(rest) = id.strip_prefix("view.remote:") {
                let _ = app.emit(
                    "cofinder:event",
                    json!({ "channel": "system:setPaneViewMode", "payload": { "pane": "remote", "viewMode": rest } }),
                );
            }
        }
    }
}
