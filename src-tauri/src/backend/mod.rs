//! Rust backend for CoFinder.
//!
//! Progressively replaces the Node sidecar. `dispatch` handles a channel
//! natively and returns `Some(response)` when implemented; otherwise `None`
//! tells the caller to fall back to the sidecar. Response shape always matches
//! the shared IPC contract: `{ ok: true, data }` or `{ ok: false, error }`.

pub mod error;
pub mod favorites;
pub mod local_files;
pub mod profiles;
pub mod remote;
pub mod settings;
pub mod system;
pub mod util;

use serde_json::{json, Value};
use std::sync::Mutex;

use error::CoFinderError;

/// Holds Rust-native backend services. Each service is `Send + Sync` so it can
/// be shared behind the Tauri state.
pub struct BackendState {
    pub settings: Mutex<settings::SettingsService>,
    pub local_files: local_files::LocalFileService,
    pub profiles: Mutex<profiles::ProfileRepository>,
    pub credentials: profiles::CredentialService,
    pub favorites: Mutex<favorites::LocalSidebarFavoritesRepository>,
    pub system: system::SystemService,
    pub remote: remote::RemoteService,
}

impl BackendState {
    /// Create the backend with a given user-data directory (the legacy
    /// Electron userData dir is preferred for continuity).
    pub fn new(user_data_dir: &str) -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
        let well_known = favorites::WellKnownPaths {
            home: home.clone(),
            desktop: format!("{home}/Desktop"),
            downloads: format!("{home}/Downloads"),
            documents: format!("{home}/Documents"),
        };
        Self {
            settings: Mutex::new(settings::SettingsService::new(settings::default_settings_path(user_data_dir))),
            local_files: local_files::LocalFileService,
            profiles: Mutex::new(profiles::ProfileRepository::new(profiles::default_profiles_path(user_data_dir))),
            credentials: profiles::CredentialService::new(),
            favorites: Mutex::new(favorites::LocalSidebarFavoritesRepository::new(
                favorites::default_local_sidebar_favorites_path(user_data_dir),
                well_known,
            )),
            system: system::SystemService::new(env!("CARGO_PKG_VERSION").to_string(), user_data_dir.to_string()),
            remote: remote::RemoteService::new(),
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

fn profile_required_string(value: &Value, field: &str) -> Result<String, CoFinderError> {
    match value.get(field) {
        Some(Value::String(s)) => {
            let out = s.trim();
            if out.is_empty() {
                Err(CoFinderError::new("PROFILE_INVALID", format!("{field} is required.")))
            } else {
                Ok(out.to_string())
            }
        }
        _ => Err(CoFinderError::new("PROFILE_INVALID", format!("{field} must be a string."))),
    }
}

#[allow(dead_code)]
fn profile_optional_string(value: &Value, field: &str) -> Option<String> {
    match value.get(field) {
        Some(Value::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}

fn profile_required_id(value: &Value, field: &str) -> Result<String, CoFinderError> {
    profile_required_string(value, field)
}

fn remote_required_string(value: &Value, field: &str) -> Result<String, CoFinderError> {
    match value.get(field) {
        Some(Value::String(s)) => {
            let out = s.trim();
            if out.is_empty() {
                Err(CoFinderError::new("REMOTE_INVALID_INPUT", format!("{field} is required.")))
            } else {
                Ok(out.to_string())
            }
        }
        _ => Err(CoFinderError::new("REMOTE_INVALID_INPUT", format!("{field} must be a string."))),
    }
}

fn remote_required_id(value: &Value, field: &str) -> Result<String, CoFinderError> {
    remote_required_string(value, field)
}

fn remote_required_port(value: &Value) -> Result<u16, CoFinderError> {
    let n = value.get("port").and_then(|v| v.as_i64()).or_else(|| value.get("port").and_then(|v| v.as_f64()).map(|f| f as i64));
    match n {
        Some(n) if n > 0 && n <= 65535 => Ok(n as u16),
        _ => Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Port must be between 1 and 65535.")),
    }
}

fn is_safe_host_or_username(input: &str) -> bool {
    !input.is_empty() && input.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn remote_optional_string(value: &Value, field: &str) -> Option<String> {
    match value.get(field) {
        Some(Value::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}

fn remote_paths_array(value: &Value) -> Result<Vec<String>, CoFinderError> {
    match value.get("paths") {
        Some(Value::Array(arr)) if !arr.is_empty() => arr
            .iter()
            .map(|item| match item.as_str() {
                Some(s) => {
                    let out = s.trim().to_string();
                    if out.is_empty() {
                        Err(CoFinderError::new("REMOTE_INVALID_INPUT", "path is required."))
                    } else {
                        Ok(out)
                    }
                }
                None => Err(CoFinderError::new("REMOTE_INVALID_INPUT", "path must be a string.")),
            })
            .collect::<Result<Vec<String>, _>>(),
        _ => Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Select at least one remote path.")),
    }
}

fn normalize_remote_path(value: &Value, field: &str) -> Result<String, CoFinderError> {
    let source = profile_required_string(value, field)?;
    if source.contains('\u{0}') || source.contains('\n') || source.contains('\r') {
        return Err(CoFinderError::new("PROFILE_INVALID", format!("{field} contains unsupported characters.")));
    }
    let normalized = profiles::normalize_remote_posix_path(&source);
    Ok(normalized)
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
        "profiles:list" => {
            let repo = self.profiles.lock().unwrap();
            let data = profiles::list_profiles_with_credential_flags(&repo, &self.credentials);
            Ok(Some(ok(json!(data))))
        }
        "profiles:save" | "profiles:update" => {
            let repo = self.profiles.lock().unwrap();
            let data = profiles::upsert_profile(&repo, &self.credentials, req)
                .map_err(|e| CoFinderError { code: "PROFILE_SAVE_FAILED".to_string(), message: e.message, detail: e.detail })?;
            Ok(Some(ok(data)))
        }
        "profiles:delete" => {
            let repo = self.profiles.lock().unwrap();
            let id = profile_required_id(req, "id")?;
            repo.delete(&id).map_err(|e| CoFinderError { code: "PROFILE_DELETE_FAILED".to_string(), message: e.message, detail: e.detail })?;
            self.credentials.delete(&id).ok();
            Ok(Some(ok(json!({ "deleted": true }))))
        }
        "profiles:addRemoteFavorite" => {
            let repo = self.profiles.lock().unwrap();
            let profile_id = profile_required_id(req, "profileId")?;
            let remote_path = normalize_remote_path(req, "path")?;
            let data = profiles::add_remote_favorite(&repo, &profile_id, &remote_path)
                .map_err(|e| CoFinderError { code: "PROFILE_SAVE_FAILED".to_string(), message: e.message, detail: e.detail })?;
            Ok(Some(ok(data)))
        }
        "profiles:removeRemoteFavorite" => {
            let repo = self.profiles.lock().unwrap();
            let profile_id = profile_required_id(req, "profileId")?;
            let favorite_id = profile_required_id(req, "favoriteId")?;
            let data = profiles::remove_remote_favorite(&repo, &profile_id, &favorite_id)
                .map_err(|e| CoFinderError { code: "PROFILE_SAVE_FAILED".to_string(), message: e.message, detail: e.detail })?;
            Ok(Some(ok(data)))
        }
        "profiles:renameRemoteFavorite" => {
            let repo = self.profiles.lock().unwrap();
            let profile_id = profile_required_id(req, "profileId")?;
            let favorite_id = profile_required_id(req, "favoriteId")?;
            let label = profile_required_string(req, "label")?;
            let data = profiles::rename_remote_favorite(&repo, &profile_id, &favorite_id, &label)
                .map_err(|e| CoFinderError { code: "PROFILE_SAVE_FAILED".to_string(), message: e.message, detail: e.detail })?;
            Ok(Some(ok(data)))
        }
        "profiles:reorderRemoteFavorite" => {
            let repo = self.profiles.lock().unwrap();
            let profile_id = profile_required_id(req, "profileId")?;
            let favorite_id = profile_required_id(req, "favoriteId")?;
            let direction = match req.get("direction").and_then(|v| v.as_str()) {
                Some("up") => "up",
                Some("down") => "down",
                _ => return Err(CoFinderError::new("PROFILE_INVALID", "Direction must be up or down.")),
            };
            let data = profiles::reorder_remote_favorite(&repo, &profile_id, &favorite_id, direction)
                .map_err(|e| CoFinderError { code: "PROFILE_SAVE_FAILED".to_string(), message: e.message, detail: e.detail })?;
            Ok(Some(ok(data)))
        }
        "credentials:isAvailable" => {
            Ok(Some(ok(json!({ "available": self.credentials.is_storage_available() }))))
        }
        "localFavorites:list" => {
            let repo = self.favorites.lock().unwrap();
            Ok(Some(ok(json!({ "favorites": repo.list() }))))
        }
        "localFavorites:add" => {
            let repo = self.favorites.lock().unwrap();
            let path = required_string(req.get("path").unwrap_or(&Value::Null), "path")?;
            let favorites = repo.add_path(&path).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "favorites": favorites }))))
        }
        "localFavorites:remove" => {
            let repo = self.favorites.lock().unwrap();
            let id = profile_required_id(req, "id")?;
            let favorites = repo.remove_by_id(&id).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "favorites": favorites }))))
        }
        "localFavorites:rename" => {
            let repo = self.favorites.lock().unwrap();
            let id = profile_required_id(req, "id")?;
            let label = profile_required_string(req, "label")?;
            let favorites = repo.rename_by_id(&id, &label).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "favorites": favorites }))))
        }
        "localFavorites:reorder" => {
            let repo = self.favorites.lock().unwrap();
            let id = profile_required_id(req, "id")?;
            let direction = match req.get("direction").and_then(|v| v.as_str()) {
                Some("up") => "up",
                Some("down") => "down",
                _ => return Err(CoFinderError::new("LOCAL_INVALID_INPUT", "Direction must be up or down.")),
            };
            let favorites = repo.reorder_by_id(&id, direction).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "favorites": favorites }))))
        }
        "localFavorites:resetDefaults" => {
            let repo = self.favorites.lock().unwrap();
            let favorites = repo.reset_default_locations().map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "favorites": favorites }))))
        }
        "system:getAppVersion" => {
            Ok(Some(ok(json!({ "version": self.system.version }))))
        }
        "system:copyText" => {
            let text = required_string_field(req, "text")?;
            system::copy_text(&text).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "copied": true }))))
        }
        "system:copyDiagnostics" => {
            let text = self.system.build_clipboard_text();
            let diagnostics = self.system.build_diagnostics_bundle();
            system::copy_text(&text).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "copied": true, "diagnostics": diagnostics }))))
        }
        "system:checkForUpdates" => {
            Ok(Some(ok(json!({
                "available": false,
                "message": "Auto-update install is not enabled in this build. Use the documented release checklist and GitHub Releases artifacts."
            }))))
        }
        "system:openLogFolder" => {
            std::fs::create_dir_all(&self.system.user_data_path).ok();
            system::open_path(&self.system.user_data_path).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "opened": true, "path": self.system.user_data_path }))))
        }
        "system:openLogFile" => {
            std::fs::create_dir_all(&self.system.user_data_path).ok();
            std::fs::OpenOptions::new().append(true).create(true).open(&self.system.log_file_path).ok();
            system::open_path(&self.system.log_file_path).map_err(|e| CoFinderError { code: e.code, message: e.message, detail: e.detail })?;
            Ok(Some(ok(json!({ "opened": true, "path": self.system.log_file_path }))))
        }
        "remote:connect" => {
            let host = remote_required_string(req, "host")?;
            let port = remote_required_port(req)?;
            let username = remote_required_string(req, "username")?;
            if !is_safe_host_or_username(&host) {
                return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Host contains unsupported characters."));
            }
            if !is_safe_host_or_username(&username) {
                return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Username contains unsupported characters."));
            }
            if req.get("authType").and_then(|v| v.as_str()) == Some("privateKey") {
                return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Private key authentication is not supported in this version."));
            }
            let mut password = remote_optional_string(req, "password").unwrap_or_default();
            if password.is_empty() {
                if let Some(profile_id) = remote_optional_string(req, "profileId") {
                    password = self.credentials.get(&profile_id).unwrap_or_default();
                }
            }
            if password.is_empty() {
                return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Password is required."));
            }
            let data = self.remote.connect(&host, port, &username, &password)?;
            Ok(Some(ok(data)))
        }
        "remote:listDirectory" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            let path = remote_optional_string(req, "path").unwrap_or_else(|| "/".to_string());
            let data = self.remote.list_directory(&connection_id, &path)?;
            Ok(Some(ok(data)))
        }
        "remote:getHomeDirectory" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            let home_path = self.remote.get_home_directory(&connection_id)?;
            Ok(Some(ok(json!({ "homePath": home_path }))))
        }
        "remote:disconnect" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            self.remote.disconnect(&connection_id)?;
            Ok(Some(ok(json!({ "disconnected": true }))))
        }
        "remote:rename" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            let path = remote_required_string(req, "path")?;
            let new_name = remote_required_string(req, "newName")?;
            let new_path = self.remote.rename_path(&connection_id, &path, &new_name)?;
            Ok(Some(ok(json!({ "renamed": true, "newPath": new_path }))))
        }
        "remote:delete" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            let paths = remote_paths_array(req)?;
            let deleted = self.remote.delete_paths(&connection_id, &paths)?;
            Ok(Some(ok(json!({ "deleted": deleted }))))
        }
        "remote:mkdir" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            let parent = remote_required_string(req, "parentPath")?;
            let name = remote_required_string(req, "name")?;
            let created = self.remote.make_directory(&connection_id, &parent, &name)?;
            Ok(Some(ok(json!({ "created": true, "path": created }))))
        }
        "remote:readText" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            let path = remote_required_string(req, "path")?;
            let byte_offset = optional_u64(req, "byteOffset")?;
            let max_bytes = optional_u64(req, "maxBytes")?;
            let data = self.remote.read_text_file(&connection_id, &path, byte_offset, max_bytes)?;
            Ok(Some(ok(data)))
        }
        "remote:getInfo" => {
            let connection_id = remote_required_id(req, "connectionId")?;
            let path = remote_required_string(req, "path")?;
            let info = self.remote.get_path_info(&connection_id, &path)?;
            Ok(Some(ok(json!({ "info": info }))))
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
        let res = state.dispatch("transfer:list", None).unwrap();
        assert!(res.is_none());
    }

    #[test]
    fn dispatch_remote_list_without_connection_is_error_not_none() {
        let state = temp_state();
        let req = serde_json::json!({ "connectionId": "missing", "path": "/" });
        let res = state.dispatch("remote:listDirectory", Some(&req)).unwrap_err();
        assert_eq!(res.code, "REMOTE_DISCONNECTED");
    }
}
