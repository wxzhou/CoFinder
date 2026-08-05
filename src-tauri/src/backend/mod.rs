//! Rust backend for CoFinder.
//!
//! Progressively replaces the Node sidecar. `dispatch` handles a channel
//! natively and returns `Some(response)` when implemented; otherwise `None`
//! tells the caller to fall back to the sidecar. Response shape always matches
//! the shared IPC contract: `{ ok: true, data }` or `{ ok: false, error }`.

pub mod error;
pub mod local_files;
pub mod settings;
pub mod util;

use serde_json::{json, Value};
use std::sync::Mutex;

use error::CoFinderError;

/// Holds Rust-native backend services. Each service is `Send + Sync` so it can
/// be shared behind the Tauri state.
pub struct BackendState {
    pub settings: Mutex<settings::SettingsService>,
    pub local_files: local_files::LocalFileService,
}

impl BackendState {
    /// Create the backend with a given user-data directory (the legacy
    /// Electron userData dir is preferred for continuity).
    pub fn new(user_data_dir: &str) -> Self {
        Self {
            settings: Mutex::new(settings::SettingsService::new(settings::default_settings_path(user_data_dir))),
            local_files: local_files::LocalFileService,
        }
    }
}

/// Map a local-service error code to the `LOCAL_*` prefix used by the renderer
/// (mirrors `mapErrorCode` in `ipcUtils.ts`).
fn map_local_error_code(code: &str) -> String {
    match code {
        "NOT_FOUND" => "LOCAL_NOT_FOUND".to_string(),
        "PERMISSION_DENIED" => "LOCAL_PERMISSION_DENIED".to_string(),
        "NOT_DIRECTORY" => "LOCAL_NOT_DIRECTORY".to_string(),
        "OPEN_FAILED" => "LOCAL_OPEN_FAILED".to_string(),
        "RENAME_FAILED" => "LOCAL_RENAME_FAILED".to_string(),
        "DELETE_FAILED" => "LOCAL_DELETE_FAILED".to_string(),
        "INFO_FAILED" => "LOCAL_INFO_FAILED".to_string(),
        "PREVIEW_FAILED" => "SYSTEM_PREVIEW_FAILED".to_string(),
        "UNKNOWN" => "LOCAL_UNKNOWN_ERROR".to_string(),
        other => other.to_string(),
    }
}

fn local_error(err: &CoFinderError) -> CoFinderError {
    CoFinderError {
        code: map_local_error_code(&err.code),
        message: err.message.clone(),
        detail: err.detail.clone(),
    }
}

/// Parse a required string request field, trimming like `requiredString`.
fn required_string(value: &Value, field: &str) -> Result<String, CoFinderError> {
    match value.as_str() {
        Some(s) => {
            let out = s.trim();
            if out.is_empty() {
                Err(CoFinderError::new("LOCAL_INVALID_INPUT", format!("{field} is required.")))
            } else {
                Ok(out.to_string())
            }
        }
        None => Err(CoFinderError::new("LOCAL_INVALID_INPUT", format!("{field} must be a string."))),
    }
}

/// Validate a local path request field (port of `validateLocalPathInput`).
fn validate_local_path(value: &Value) -> Result<String, CoFinderError> {
    let raw = required_string(value, "Path")?;
    if raw.contains('\u{0}') || raw.contains('\n') || raw.contains('\r') {
        return Err(CoFinderError::new("LOCAL_INVALID_INPUT", "Path contains unsupported characters."));
    }
    Ok(util::normalize_local_path(&raw))
}

fn optional_u64(value: &Value, field: &str) -> Result<Option<u64>, CoFinderError> {
    match value.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v
            .as_u64()
            .map(Some)
            .ok_or_else(|| CoFinderError::new("LOCAL_INVALID_INPUT", format!("{field} must be a number."))),
    }
}

fn optional_i64(value: &Value, field: &str) -> Result<Option<i64>, CoFinderError> {
    match value.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v
            .as_i64()
            .map(Some)
            .ok_or_else(|| CoFinderError::new("LOCAL_INVALID_INPUT", format!("{field} must be a number."))),
    }
}

fn optional_string(value: &Value, field: &str) -> Option<String> {
    match value.get(field) {
        Some(Value::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}

fn required_string_field(value: &Value, field: &str) -> Result<String, CoFinderError> {
    match value.get(field) {
        Some(Value::String(s)) => {
            let out = s.trim();
            if out.is_empty() {
                Err(CoFinderError::new("LOCAL_INVALID_INPUT", format!("{field} is required.")))
            } else {
                Ok(out.to_string())
            }
        }
        _ => Err(CoFinderError::new("LOCAL_INVALID_INPUT", format!("{field} must be a string."))),
    }
}

fn local_paths_array(value: &Value) -> Result<Vec<String>, CoFinderError> {
    match value.get("paths") {
        Some(Value::Array(arr)) if !arr.is_empty() => arr
            .iter()
            .map(|item| validate_local_path(item))
            .collect::<Result<Vec<String>, _>>(),
        _ => Err(CoFinderError::new("LOCAL_INVALID_INPUT", "Select at least one local path.")),
    }
}

impl BackendState {
    /// Try to handle a channel in Rust. Returns `Ok(Some(response))` when
    /// handled, `Ok(None)` when the channel is not implemented in Rust yet
    /// (caller should fall back to the sidecar), and `Err` for a native error
    /// that should be serialized as an IPC failure.
    pub fn dispatch(&self, channel: &str, request: Option<&Value>) -> Result<Option<Value>, CoFinderError> {
        let req = request.unwrap_or(&Value::Null);
        match channel {
        "settings:get" => {
            let svc = self.settings.lock().unwrap();
            let data = svc.get()?;
            Ok(Some(ok(data)))
        }
        "settings:set" => {
            let svc = self.settings.lock().unwrap();
            let data = svc.set(req)?;
            Ok(Some(ok(data)))
        }
        "local:getHomePath" => {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
            Ok(Some(ok(json!({ "homePath": home }))))
        }
        "local:listDirectory" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
            let data = self.local_files.list_directory(&path, &home).map_err(|e| local_error(&e))?;
            Ok(Some(ok(data)))
        }
        "local:getInfo" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let include_dir_size = req
                .get("includeDirectorySize")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let data = self.local_files.get_path_info(&path, include_dir_size).map_err(|e| local_error(&e))?;
            Ok(Some(ok(json!({ "info": data }))))
        }
        "local:readText" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let byte_offset = optional_u64(req, "byteOffset")?;
            let max_bytes = optional_u64(req, "maxBytes")?;
            let data = self.local_files.read_text_file(&path, byte_offset, max_bytes).map_err(|e| local_error(&e))?;
            Ok(Some(ok(data)))
        }
        "local:readTextWindow" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let target_line = match optional_i64(req, "targetLine")? {
                Some(n) => n as u64,
                None => 1,
            };
            let context_before = optional_u64(req, "contextBefore")?;
            let context_after = optional_u64(req, "contextAfter")?;
            let data = self
                .local_files
                .read_text_window(&path, target_line, context_before, context_after)
                .map_err(|e| local_error(&e))?;
            Ok(Some(ok(data)))
        }
        "local:readPreview" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let max_text = optional_u64(req, "maxTextBytes")?;
            let max_image = optional_u64(req, "maxImageBytes")?;
            let data = self.local_files.read_preview_file(&path, max_text, max_image).map_err(|e| local_error(&e))?;
            Ok(Some(ok(data)))
        }
        "local:touch" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let timestamp = match req.get("timestamp") {
                Some(Value::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
                _ => None,
            };
            self.local_files.touch_path(&path, timestamp.as_deref()).map_err(|e| local_error(&e))?;
            Ok(Some(ok(json!({ "touched": true }))))
        }
        "local:rename" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let new_name = required_string_field(req, "newName")?;
            let new_path = self.local_files.rename_path(&path, &new_name).map_err(|e| local_error(&e))?;
            Ok(Some(ok(json!({ "renamed": true, "newPath": new_path }))))
        }
        "local:delete" => {
            let paths = local_paths_array(req)?;
            let deleted = self.local_files.delete_paths(&paths).map_err(|e| local_error(&e))?;
            Ok(Some(ok(json!({ "deleted": deleted }))))
        }
        "local:mkdir" => {
            let parent = validate_local_path(req.get("parentPath").unwrap_or(&Value::Null))?;
            let name = required_string_field(req, "name")?;
            let created_path = self.local_files.make_directory(&parent, &name).map_err(|e| local_error(&e))?;
            Ok(Some(ok(json!({ "created": true, "path": created_path }))))
        }
        "local:createTextFile" => {
            let parent = validate_local_path(req.get("parentPath").unwrap_or(&Value::Null))?;
            let name = optional_string(req, "name");
            let created_path = self.local_files.create_text_file(&parent, name.as_deref()).map_err(|e| local_error(&e))?;
            Ok(Some(ok(json!({ "created": true, "path": created_path }))))
        }
        "local:searchText" => {
            let path = validate_local_path(req.get("path").unwrap_or(&Value::Null))?;
            let query = required_string_field(req, "query")?;
            let max_matches = optional_u64(req, "maxMatches")?;
            let data = self.local_files.search_text(&path, &query, max_matches).map_err(|e| local_error(&e))?;
            Ok(Some(ok(data)))
        }
        _ => Ok(None),
    }
}
}

/// Build a success response `{ ok: true, data }`.
pub fn ok(data: Value) -> Value {
    serde_json::json!({ "ok": true, "data": data })
}

/// Build a failure response `{ ok: false, error }`.
pub fn fail(error: &CoFinderError) -> Value {
    serde_json::json!({ "ok": false, "error": error.to_json() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_state() -> BackendState {
        let dir = std::env::temp_dir().join(format!("cf-rs-backend-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        BackendState::new(dir.to_str().unwrap())
    }

    #[test]
    fn dispatch_settings_get_returns_defaults() {
        let state = temp_state();
        let res = state.dispatch("settings:get", None).unwrap().unwrap();
        assert_eq!(res["ok"], true);
        assert_eq!(res["data"]["schemaVersion"], 2);
    }

    #[test]
    fn dispatch_settings_set_merges() {
        let state = temp_state();
        let req = serde_json::json!({ "general": { "showHiddenFiles": true } });
        let res = state.dispatch("settings:set", Some(&req)).unwrap().unwrap();
        assert_eq!(res["ok"], true);
        assert_eq!(res["data"]["general"]["showHiddenFiles"], true);
    }

    #[test]
    fn dispatch_unknown_channel_returns_none() {
        let state = temp_state();
        let res = state.dispatch("remote:listDirectory", None).unwrap();
        assert!(res.is_none());
    }
}
