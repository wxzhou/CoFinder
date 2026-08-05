//! Server profiles + credentials — Rust port of `ProfileRepository.ts`,
//! `CredentialService.ts`, and the credential provider backed by the macOS
//! Keychain (via the `security` CLI, same strategy as the old safeStorage shim).

use serde_json::{json, Value};
use std::path::Path;
use std::process::Command;

use crate::backend::error::CoFinderError;

pub fn default_profiles_path(user_data: &str) -> String {
    Path::new(user_data).join("profiles.json").to_string_lossy().into_owned()
}

pub fn default_credentials_path(user_data: &str) -> String {
    Path::new(user_data).join("credentials.enc.json").to_string_lossy().into_owned()
}

fn is_record(value: &Value) -> bool {
    value.is_object()
}

fn parse_port(value: &Value) -> Option<i64> {
    let n = value.as_i64().or_else(|| value.as_f64().map(|f| f as i64));
    let n = n?;
    if n <= 0 || n > 65535 {
        None
    } else {
        Some(n)
    }
}

fn sanitize_remote_favorite(raw: &Value) -> Option<Value> {
    if !is_record(raw) {
        return None;
    }
    let id = raw.get("id").and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty())?;
    let label = raw.get("label").and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty())?;
    let remote_path = raw.get("path").and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty())?;
    let created_at = raw.get("createdAt").and_then(|v| v.as_f64()).filter(|n| n.is_finite()).unwrap_or(now_ms());
    Some(json!({ "id": id, "label": label.chars().take(256).collect::<String>(), "path": remote_path, "createdAt": created_at }))
}

fn sanitize_profile(raw: &Value) -> Option<Value> {
    if !is_record(raw) {
        return None;
    }
    let id = raw.get("id").and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty())?;
    let host = raw.get("host").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).unwrap_or_default();
    let username = raw.get("username").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).unwrap_or_default();
    let alias = raw.get("alias").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).unwrap_or_default();
    let port = parse_port(raw.get("port").unwrap_or(&Value::Null))?;
    if host.is_empty() || username.is_empty() {
        return None;
    }
    let auth_type = if raw.get("authType").and_then(|v| v.as_str()) == Some("privateKey") { "privateKey" } else { "password" };
    let default_remote_path = raw.get("defaultRemotePath").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let private_key_path = raw.get("privateKeyPath").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let remote_favorites = raw.get("remoteFavorites").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(sanitize_remote_favorite).collect::<Vec<_>>()
    });
    let created_at = raw.get("createdAt").and_then(|v| v.as_f64()).filter(|n| n.is_finite()).unwrap_or_else(now_ms);
    let updated_at = raw.get("updatedAt").and_then(|v| v.as_f64()).filter(|n| n.is_finite()).unwrap_or(created_at);
    let mut out = json!({
        "id": id, "alias": alias, "host": host, "port": port, "username": username,
        "authType": auth_type, "createdAt": created_at, "updatedAt": updated_at
    });
    if let Some(p) = default_remote_path { out["defaultRemotePath"] = Value::String(p); }
    if let Some(p) = private_key_path { out["privateKeyPath"] = Value::String(p); }
    if let Some(favs) = remote_favorites { out["remoteFavorites"] = Value::Array(favs); }
    Some(out)
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn strip_for_disk(profile: &Value) -> Value {
    let mut out = profile.clone();
    if let Value::Object(ref mut map) = out {
        map.remove("hasSavedPassword");
        map.remove("password");
    }
    out
}

fn write_private_utf8_file(target_path: &str, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    let dir = Path::new(target_path).parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(dir)?;
    let tmp = format!("{target_path}.tmp");
    {
        let mut f = std::fs::File::create(&tmp)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            f.set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        f.write_all(contents.as_bytes())?;
    }
    std::fs::rename(&tmp, target_path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(target_path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub struct ProfileRepository {
    file_path: String,
}

impl ProfileRepository {
    pub fn new(file_path: String) -> Self {
        Self { file_path }
    }

    pub fn load_all(&self) -> Vec<Value> {
        match std::fs::read_to_string(&self.file_path) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(parsed) => {
                    if parsed.get("version").and_then(|v| v.as_i64()) != Some(1) {
                        return Vec::new();
                    }
                    match parsed.get("profiles").and_then(|v| v.as_array()) {
                        Some(arr) => {
                            let mut out: Vec<Value> = arr.iter().filter_map(sanitize_profile).collect();
                            out.sort_by(|a, b| {
                                let au = a.get("updatedAt").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                let bu = b.get("updatedAt").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                bu.partial_cmp(&au).unwrap_or(std::cmp::Ordering::Equal)
                            });
                            out
                        }
                        None => Vec::new(),
                    }
                }
                Err(_) => Vec::new(),
            },
            Err(_) => Vec::new(),
        }
    }

    fn save_all(&self, profiles: &[Value]) -> Result<(), CoFinderError> {
        let disk = json!({ "version": 1, "profiles": profiles.iter().map(strip_for_disk).collect::<Vec<_>>() });
        let serialized = serde_json::to_string_pretty(&disk).map(|s| format!("{s}\n"))
            .map_err(|e| CoFinderError::new("PROFILE_SAVE_FAILED", format!("failed to serialize profiles: {e}")))?;
        write_private_utf8_file(&self.file_path, &serialized)
            .map_err(|e| CoFinderError::new("PROFILE_SAVE_FAILED", format!("failed to write profiles: {e}")))
    }

    pub fn upsert(&self, profile: &Value) -> Result<(), CoFinderError> {
        let mut all = self.load_all();
        let id = profile.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if let Some(existing) = all.iter_mut().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id)) {
            *existing = strip_for_disk(profile);
        } else {
            all.push(strip_for_disk(profile));
        }
        self.save_all(&all)
    }

    pub fn delete(&self, id: &str) -> Result<bool, CoFinderError> {
        let all = self.load_all();
        let next: Vec<Value> = all.iter().filter(|p| p.get("id").and_then(|v| v.as_str()) != Some(id)).cloned().collect();
        if next.len() == all.len() {
            return Ok(false);
        }
        self.save_all(&next)?;
        Ok(true)
    }

    pub fn find(&self, id: &str) -> Option<Value> {
        self.load_all().into_iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
    }

    pub fn update_remote_favorites(&self, profile_id: &str, favorites: &[Value]) -> Result<Value, CoFinderError> {
        let mut all = self.load_all();
        let idx = all.iter().position(|p| p.get("id").and_then(|v| v.as_str()) == Some(profile_id))
            .ok_or_else(|| CoFinderError::new("PROFILE_INVALID", "Profile not found."))?;
        let mut next = all[idx].clone();
        next["remoteFavorites"] = Value::Array(favorites.iter().map(strip_for_disk).collect());
        next["updatedAt"] = json!(now_ms());
        all[idx] = next.clone();
        self.save_all(&all)?;
        Ok(next)
    }
}

/// Remote-favorite helpers shared by the profile handlers.
pub fn remote_favorite_label(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rsplit('/').find(|s| !s.is_empty()) {
        Some(name) => name.to_string(),
        None => path.to_string(),
    }
}

pub fn add_remote_favorite(repo: &ProfileRepository, profile_id: &str, remote_path: &str) -> Result<Value, CoFinderError> {
    let profile = repo.find(profile_id).ok_or_else(|| CoFinderError::new("PROFILE_INVALID", "Profile not found."))?;
    let current = profile.get("remoteFavorites").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if current.iter().any(|f| f.get("path").and_then(|v| v.as_str()) == Some(remote_path)) {
        return Ok(profile);
    }
    let mut next = current;
    next.push(json!({ "id": new_uuid(), "label": remote_favorite_label(remote_path), "path": remote_path, "createdAt": now_ms() }));
    repo.update_remote_favorites(profile_id, &next)
}

pub fn remove_remote_favorite(repo: &ProfileRepository, profile_id: &str, favorite_id: &str) -> Result<Value, CoFinderError> {
    let profile = repo.find(profile_id).ok_or_else(|| CoFinderError::new("PROFILE_INVALID", "Profile not found."))?;
    let next: Vec<Value> = profile
        .get("remoteFavorites")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter(|f| f.get("id").and_then(|v| v.as_str()) != Some(favorite_id)).cloned().collect())
        .unwrap_or_default();
    repo.update_remote_favorites(profile_id, &next)
}

pub fn rename_remote_favorite(repo: &ProfileRepository, profile_id: &str, favorite_id: &str, label: &str) -> Result<Value, CoFinderError> {
    let profile = repo.find(profile_id).ok_or_else(|| CoFinderError::new("PROFILE_INVALID", "Profile not found."))?;
    let trimmed = label.trim();
    let next: Vec<Value> = profile
        .get("remoteFavorites")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|f| {
                    if f.get("id").and_then(|v| v.as_str()) == Some(favorite_id) {
                        let mut copy = f.clone();
                        copy["label"] = json!(trimmed);
                        copy
                    } else {
                        f.clone()
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    repo.update_remote_favorites(profile_id, &next)
}

pub fn reorder_remote_favorite(repo: &ProfileRepository, profile_id: &str, favorite_id: &str, direction: &str) -> Result<Value, CoFinderError> {
    let profile = repo.find(profile_id).ok_or_else(|| CoFinderError::new("PROFILE_INVALID", "Profile not found."))?;
    let mut next: Vec<Value> = profile.get("remoteFavorites").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let index = next.iter().position(|f| f.get("id").and_then(|v| v.as_str()) == Some(favorite_id));
    let Some(index) = index else { return Ok(profile) };
    let next_index = if direction == "up" { index as isize - 1 } else { index as isize + 1 };
    if next_index < 0 || next_index >= next.len() as isize {
        return Ok(profile);
    }
    let item = next.remove(index);
    next.insert(next_index as usize, item);
    repo.update_remote_favorites(profile_id, &next)
}

/// Credential provider backed by the macOS login Keychain via the `security` CLI.
pub struct CredentialService {
    keychain_service: String,
}

impl CredentialService {
    pub fn new() -> Self {
        Self { keychain_service: "com.wxzhou.cofinder".to_string() }
    }

    pub fn is_storage_available(&self) -> bool {
        // `security` CLI presence is a good availability signal on macOS.
        Command::new("security").arg("--help").output().map(|o| o.status.success()).unwrap_or(false)
    }

    fn account(profile_id: &str) -> String {
        format!("cofinder-password:{profile_id}")
    }

    pub fn has(&self, profile_id: &str) -> bool {
        self.get(profile_id).is_some()
    }

    pub fn get(&self, profile_id: &str) -> Option<String> {
        let out = Command::new("security")
            .args(["find-generic-password", "-s", &self.keychain_service, "-a", &Self::account(profile_id), "-w"])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    }

    pub fn set(&self, profile_id: &str, password: &str) -> Result<(), CoFinderError> {
        let out = Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                &self.keychain_service,
                "-a",
                &Self::account(profile_id),
                "-w",
                password,
            ])
            .output()
            .map_err(|e| CoFinderError::new("CREDENTIAL_SAVE_FAILED", format!("keychain write failed: {e}")))?;
        if !out.status.success() {
            return Err(CoFinderError::new("CREDENTIAL_SAVE_FAILED", "keychain write failed"));
        }
        Ok(())
    }

    pub fn delete(&self, profile_id: &str) -> Result<(), CoFinderError> {
        let _ = Command::new("security")
            .args(["delete-generic-password", "-s", &self.keychain_service, "-a", &Self::account(profile_id)])
            .output();
        Ok(())
    }
}

/// Build the profile object from an upsert payload (port of `upsertProfile`).
pub fn upsert_profile(repo: &ProfileRepository, creds: &CredentialService, body: &Value) -> Result<Value, CoFinderError> {
    let now = now_ms();
    let id = body.get("id").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(new_uuid);
    let existing = repo.find(&id);
    let alias = body.get("alias").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).unwrap_or_default();
    let host = body.get("host").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).unwrap_or_default();
    let username = body.get("username").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).unwrap_or_default();
    let port = parse_port(body.get("port").unwrap_or(&Value::Null))
        .ok_or_else(|| CoFinderError::new("PROFILE_INVALID", "Port must be between 1 and 65535."))?;
    if host.is_empty() || username.is_empty() {
        return Err(CoFinderError::new("PROFILE_INVALID", "Host and username are required."));
    }
    if !is_safe_host_or_username(&host) {
        return Err(CoFinderError::new("PROFILE_INVALID", "Host contains unsupported characters."));
    }
    if !is_safe_host_or_username(&username) {
        return Err(CoFinderError::new("PROFILE_INVALID", "Username contains unsupported characters."));
    }
    let auth_type = if body.get("authType").and_then(|v| v.as_str()) == Some("privateKey") { "privateKey" } else { "password" };
    let default_remote_path = body.get("defaultRemotePath").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let private_key_path = body.get("privateKeyPath").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let remote_favorites = existing.as_ref().and_then(|p| p.get("remoteFavorites").cloned());
    let created_at = existing.as_ref().and_then(|p| p.get("createdAt").and_then(|v| v.as_f64())).unwrap_or(now);

    let save_password = body.get("savePassword").and_then(|v| v.as_bool()).unwrap_or(false);
    if save_password && !creds.is_storage_available() {
        return Err(CoFinderError::new("CREDENTIAL_UNAVAILABLE", "Password saving requires system encryption, which is not available."));
    }

    let mut profile = json!({
        "id": id, "alias": alias, "host": host, "port": port, "username": username,
        "authType": auth_type, "createdAt": created_at, "updatedAt": now
    });
    if let Some(p) = default_remote_path { profile["defaultRemotePath"] = Value::String(p); }
    if let Some(p) = private_key_path { profile["privateKeyPath"] = Value::String(p); }
    if let Some(favs) = remote_favorites { profile["remoteFavorites"] = favs; }

    repo.upsert(&profile)?;

    if !save_password {
        creds.delete(&id).map_err(|e| CoFinderError::new("CREDENTIAL_SAVE_FAILED", e.message))?;
    } else if let Some(pwd) = body.get("password").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        creds.set(&id, &pwd).map_err(|_| CoFinderError::new("CREDENTIAL_SAVE_FAILED", "Failed to save credentials."))?;
    }
    Ok(profile)
}

/// Enrich profiles with `hasSavedPassword` for `profiles:list`.
pub fn list_profiles_with_credential_flags(repo: &ProfileRepository, creds: &CredentialService) -> Vec<Value> {
    repo.load_all()
        .into_iter()
        .map(|mut p| {
            let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let has = creds.is_storage_available() && creds.has(&id);
            p["hasSavedPassword"] = json!(has);
            p
        })
        .collect()
}

/// Validate host/username chars like `requiredHost`/`requiredUsername`.
pub fn is_safe_host_or_username(input: &str) -> bool {
    !input.is_empty() && input.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

pub fn normalize_remote_posix_path(input: &str) -> String {
    let value = input.trim();
    if value.is_empty() || value == "." {
        return "/".to_string();
    }
    if value.starts_with('/') {
        value.to_string()
    } else {
        format!("/{value}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> String {
        let dir = std::env::temp_dir().join(format!("cf-rs-profiles-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("profiles.json").to_string_lossy().into_owned()
    }

    fn sample_profile(id: &str) -> Value {
        json!({
            "id": id, "alias": "test", "host": "example.com", "port": 22,
            "username": "user", "authType": "password", "createdAt": 1000, "updatedAt": 2000
        })
    }

    #[test]
    fn load_all_missing_returns_empty() {
        let repo = ProfileRepository::new(temp_file("missing"));
        assert!(repo.load_all().is_empty());
    }

    #[test]
    fn upsert_and_load_roundtrip() {
        let path = temp_file("roundtrip");
        let repo = ProfileRepository::new(path.clone());
        repo.upsert(&sample_profile("id1")).unwrap();
        let all = repo.load_all();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["host"], "example.com");
        assert_eq!(all[0]["port"], 22);
    }

    #[test]
    fn upsert_updates_existing() {
        let path = temp_file("update");
        let repo = ProfileRepository::new(path);
        repo.upsert(&sample_profile("id1")).unwrap();
        let mut updated = sample_profile("id1");
        updated["alias"] = json!("renamed");
        updated["updatedAt"] = json!(3000.0);
        repo.upsert(&updated).unwrap();
        let all = repo.load_all();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["alias"], "renamed");
    }

    #[test]
    fn delete_removes() {
        let path = temp_file("delete");
        let repo = ProfileRepository::new(path);
        repo.upsert(&sample_profile("id1")).unwrap();
        repo.upsert(&sample_profile("id2")).unwrap();
        assert!(repo.delete("id1").unwrap());
        let all = repo.load_all();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["id"], "id2");
    }

    #[test]
    fn sanitize_rejects_bad_profiles() {
        let path = temp_file("sanitize");
        std::fs::write(&path, json!({ "version": 1, "profiles": [ { "host": "no-port" }, { "id": "x", "host": "h", "username": "u", "port": 22 } ] }).to_string()).unwrap();
        let repo = ProfileRepository::new(path);
        let all = repo.load_all();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["id"], "x");
    }

    #[test]
    fn remote_favorite_helpers() {
        let path = temp_file("favs");
        let repo = ProfileRepository::new(path.clone());
        repo.upsert(&sample_profile("id1")).unwrap();
        let updated = add_remote_favorite(&repo, "id1", "/data/project").unwrap();
        assert_eq!(updated["remoteFavorites"].as_array().unwrap().len(), 1);
        assert_eq!(updated["remoteFavorites"][0]["label"], "project");
        // duplicate is a no-op
        let again = add_remote_favorite(&repo, "id1", "/data/project").unwrap();
        assert_eq!(again["remoteFavorites"].as_array().unwrap().len(), 1);
        // rename
        let fav_id = again["remoteFavorites"][0]["id"].as_str().unwrap().to_string();
        let renamed = rename_remote_favorite(&repo, "id1", &fav_id, "Project X").unwrap();
        assert_eq!(renamed["remoteFavorites"][0]["label"], "Project X");
        // remove
        let removed = remove_remote_favorite(&repo, "id1", &fav_id).unwrap();
        assert_eq!(removed["remoteFavorites"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn reorder_remote_favorite_moves() {
        let path = temp_file("reorder");
        let repo = ProfileRepository::new(path.clone());
        let mut p = sample_profile("id1");
        p["remoteFavorites"] = json!([
            { "id": "f1", "label": "a", "path": "/a", "createdAt": 1 },
            { "id": "f2", "label": "b", "path": "/b", "createdAt": 2 }
        ]);
        repo.upsert(&p).unwrap();
        let moved = reorder_remote_favorite(&repo, "id1", "f2", "up").unwrap();
        let favs = moved["remoteFavorites"].as_array().unwrap();
        assert_eq!(favs[0]["id"], "f2");
        assert_eq!(favs[1]["id"], "f1");
    }

    #[test]
    fn upsert_profile_builds_and_handles_credentials_flag() {
        let path = temp_file("upsert-body");
        let repo = ProfileRepository::new(path.clone());
        let creds = CredentialService::new();
        let body = json!({
            "alias": "Server", "host": "10.0.0.5", "port": 22, "username": "root",
            "authType": "password", "savePassword": false
        });
        let profile = upsert_profile(&repo, &creds, &body).unwrap();
        assert_eq!(profile["host"], "10.0.0.5");
        assert_eq!(profile["username"], "root");
        let all = repo.load_all();
        assert_eq!(all.len(), 1);
        // id generated
        assert!(!all[0]["id"].as_str().unwrap().is_empty());
    }
}
