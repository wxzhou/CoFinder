//! Rust backend for CoFinder.
//!
//! Progressively replaces the Node sidecar. `dispatch` handles a channel
//! natively and returns `Some(response)` when implemented; otherwise `None`
//! tells the caller to fall back to the sidecar. Response shape always matches
//! the shared IPC contract: `{ ok: true, data }` or `{ ok: false, error }`.

pub mod error;
pub mod settings;

use serde_json::Value;
use std::sync::Mutex;

use error::CoFinderError;

/// Holds Rust-native backend services. Each service is `Send + Sync` so it can
/// be shared behind the Tauri state.
pub struct BackendState {
    pub settings: Mutex<settings::SettingsService>,
}

impl BackendState {
    /// Create the backend with a given user-data directory (the legacy
    /// Electron userData dir is preferred for continuity).
    pub fn new(user_data_dir: &str) -> Self {
        Self {
            settings: Mutex::new(settings::SettingsService::new(settings::default_settings_path(user_data_dir))),
        }
    }

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
