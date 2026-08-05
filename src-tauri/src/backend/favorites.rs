//! Local sidebar favorites — Rust port of `shared/localFavorites.ts` +
//! `main/services/LocalSidebarFavoritesRepository.ts`.

use serde_json::{json, Value};
use std::path::Path;

use crate::backend::error::CoFinderError;

pub const DEFAULT_FAVORITE_IDS: [&str; 4] = ["home", "desktop", "downloads", "documents"];

pub fn is_default_favorite_id(id: &str) -> bool {
    DEFAULT_FAVORITE_IDS.contains(&id)
}

pub fn default_local_sidebar_favorites_path(user_data: &str) -> String {
    Path::new(user_data).join("local-sidebar-favorites.json").to_string_lossy().into_owned()
}

/// Collapse slashes, trim; root stays `/`; strip trailing slash for non-root.
pub fn normalize_local_path(p: &str) -> String {
    let mut x = p.trim().replace("//", "/");
    while x.contains("//") {
        x = x.replace("//", "/");
    }
    if x.is_empty() {
        return "/".to_string();
    }
    if x != "/" && x.ends_with('/') {
        x = x[..x.len() - 1].to_string();
        if x.is_empty() {
            return "/".to_string();
        }
    }
    x
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn label_for_local_path(abs_path: &str) -> String {
    let n = normalize_local_path(abs_path);
    if n == "/" {
        return "Macintosh HD".to_string();
    }
    let parts: Vec<&str> = n.split('/').filter(|s| !s.is_empty()).collect();
    parts.last().map(|s| s.to_string()).unwrap_or(n)
}

fn sanitize_custom_disk_entry(raw: &Value) -> Option<Value> {
    if !raw.is_object() {
        return None;
    }
    let id = raw.get("id").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())?;
    let label = raw.get("label").and_then(|v| v.as_str()).map(|s| s.trim().chars().take(256).collect::<String>()).filter(|s| !s.is_empty())?;
    let p = raw.get("path").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())?;
    if is_default_favorite_id(&id) {
        return None;
    }
    let created_at = raw.get("createdAt").and_then(|v| v.as_f64()).filter(|n| n.is_finite()).unwrap_or_else(now_ms);
    Some(json!({ "id": id, "label": label, "path": p, "createdAt": created_at }))
}

fn parse_favorites_file(raw: &str) -> Result<Value, ()> {
    let parsed: Value = serde_json::from_str(raw).map_err(|_| ())?;
    if !parsed.is_object() {
        return Err(());
    }
    if parsed.get("version").and_then(|v| v.as_i64()) != Some(1) {
        return Err(());
    }
    let custom_arr = parsed.get("custom").and_then(|v| v.as_array()).ok_or(())?;
    let custom: Vec<Value> = custom_arr.iter().filter_map(sanitize_custom_disk_entry).collect();
    let mut hidden: Vec<String> = Vec::new();
    if let Some(Value::Array(hidden_arr)) = parsed.get("hiddenDefaultIds") {
        let mut seen = std::collections::HashSet::new();
        for x in hidden_arr {
            if let Some(s) = x.as_str() {
                let t = s.trim().to_string();
                if is_default_favorite_id(&t) && seen.insert(t.clone()) {
                    hidden.push(t);
                }
            }
        }
    }
    if hidden.is_empty() {
        Ok(json!({ "version": 1, "custom": custom }))
    } else {
        Ok(json!({ "version": 1, "custom": custom, "hiddenDefaultIds": hidden }))
    }
}

fn build_default_favorites(wk: &WellKnownPaths) -> Vec<Value> {
    vec![
        json!({ "id": "home", "label": "Home", "path": normalize_local_path(&wk.home), "isDefault": true }),
        json!({ "id": "desktop", "label": "Desktop", "path": normalize_local_path(&wk.desktop), "isDefault": true }),
        json!({ "id": "downloads", "label": "Downloads", "path": normalize_local_path(&wk.downloads), "isDefault": true }),
        json!({ "id": "documents", "label": "Documents", "path": normalize_local_path(&wk.documents), "isDefault": true }),
    ]
}

fn merged_resolved(wk: &WellKnownPaths, custom: &[Value], hidden_default_ids: &[String]) -> Vec<Value> {
    let hidden: std::collections::HashSet<&str> = hidden_default_ids.iter().map(|s| s.as_str()).collect();
    let mut out: Vec<Value> = build_default_favorites(wk).into_iter().filter(|d| !hidden.contains(d.get("id").and_then(|v| v.as_str()).unwrap_or(""))).collect();
    let mut customs: Vec<Value> = custom
        .iter()
        .map(|c| {
            json!({
                "id": c["id"], "label": c["label"], "path": normalize_local_path(c.get("path").and_then(|v| v.as_str()).unwrap_or("")),
                "isDefault": false, "createdAt": c.get("createdAt").cloned().unwrap_or(json!(0))
            })
        })
        .collect();
    customs.sort_by(|a, b| {
        let ca = a.get("createdAt").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let cb = b.get("createdAt").and_then(|v| v.as_f64()).unwrap_or(0.0);
        ca.partial_cmp(&cb).unwrap_or(std::cmp::Ordering::Equal)
    });
    out.extend(customs);
    out
}

fn is_duplicate_favorite_path(candidate: &str, favorites: &[Value]) -> bool {
    let n = normalize_local_path(candidate);
    favorites.iter().any(|f| normalize_local_path(f.get("path").and_then(|v| v.as_str()).unwrap_or("")) == n)
}

fn disk_for_write(disk: &Value) -> Value {
    let mut out = json!({ "version": 1, "custom": disk.get("custom").cloned().unwrap_or(json!([])) });
    if let Some(hidden) = disk.get("hiddenDefaultIds").and_then(|v| v.as_array()) {
        if !hidden.is_empty() {
            out["hiddenDefaultIds"] = Value::Array(hidden.clone());
        }
    }
    out
}

pub struct WellKnownPaths {
    pub home: String,
    pub desktop: String,
    pub downloads: String,
    pub documents: String,
}

pub struct LocalSidebarFavoritesRepository {
    file_path: String,
    well_known: WellKnownPaths,
}

impl LocalSidebarFavoritesRepository {
    pub fn new(file_path: String, well_known: WellKnownPaths) -> Self {
        Self { file_path, well_known }
    }

    fn load_disk_safe(&self) -> Value {
        match std::fs::read_to_string(&self.file_path) {
            Ok(raw) => match parse_favorites_file(&raw) {
                Ok(parsed) => parsed,
                Err(_) => json!({ "version": 1, "custom": [] }),
            },
            Err(_) => json!({ "version": 1, "custom": [] }),
        }
    }

    fn save_disk(&self, disk: &Value) -> Result<(), CoFinderError> {
        let dir = Path::new(&self.file_path).parent().unwrap_or(Path::new("."));
        std::fs::create_dir_all(dir).map_err(|e| CoFinderError::new("LOCAL_FAVORITES_PERSIST_FAILED", format!("failed to write favorites: {e}")))?;
        let tmp = format!("{}.tmp", self.file_path);
        let serialized = serde_json::to_string_pretty(&disk_for_write(disk)).map(|s| format!("{s}\n"))
            .map_err(|e| CoFinderError::new("LOCAL_FAVORITES_PERSIST_FAILED", format!("failed to serialize favorites: {e}")))?;
        std::fs::write(&tmp, &serialized).map_err(|e| CoFinderError::new("LOCAL_FAVORITES_PERSIST_FAILED", format!("failed to write favorites: {e}")))?;
        std::fs::rename(&tmp, &self.file_path).map_err(|e| CoFinderError::new("LOCAL_FAVORITES_PERSIST_FAILED", format!("failed to write favorites: {e}")))?;
        Ok(())
    }

    fn annotate_exists(&self, rows: Vec<Value>) -> Vec<Value> {
        rows.into_iter()
            .map(|mut r| {
                let p = r.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let exists = Path::new(p).exists();
                r["pathExists"] = json!(exists);
                r
            })
            .collect()
    }

    fn list_rows(&self) -> Vec<Value> {
        let disk = self.load_disk_safe();
        let custom = disk.get("custom").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let hidden: Vec<String> = disk.get("hiddenDefaultIds").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        self.annotate_exists(merged_resolved(&self.well_known, &custom, &hidden))
    }

    pub fn list(&self) -> Vec<Value> {
        self.list_rows()
    }

    pub fn add_path(&self, abs_path: &str) -> Result<Vec<Value>, CoFinderError> {
        let normalized = normalize_local_path(abs_path);
        let disk = self.load_disk_safe();
        let custom = disk.get("custom").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let hidden: Vec<String> = disk.get("hiddenDefaultIds").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        let merged = merged_resolved(&self.well_known, &custom, &hidden);
        if is_duplicate_favorite_path(&normalized, &merged) {
            return Err(CoFinderError::new("LOCAL_FAVORITES_DUPLICATE", "Duplicate"));
        }
        let row = json!({ "id": new_uuid(), "label": label_for_local_path(&normalized), "path": normalized, "createdAt": now_ms() });
        let mut next_custom = custom;
        next_custom.push(row);
        let next = if hidden.is_empty() {
            json!({ "version": 1, "custom": next_custom })
        } else {
            json!({ "version": 1, "custom": next_custom, "hiddenDefaultIds": hidden })
        };
        self.save_disk(&next)?;
        Ok(self.list_rows())
    }

    pub fn remove_by_id(&self, id: &str) -> Result<Vec<Value>, CoFinderError> {
        let disk = self.load_disk_safe();
        let custom = disk.get("custom").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let hidden: Vec<String> = disk.get("hiddenDefaultIds").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        if is_default_favorite_id(id) {
            let mut next_hidden = hidden;
            if !next_hidden.iter().any(|h| h == id) {
                next_hidden.push(id.to_string());
            }
            let next = json!({ "version": 1, "custom": custom, "hiddenDefaultIds": next_hidden });
            self.save_disk(&next)?;
            return Ok(self.list_rows());
        }
        let next_custom: Vec<Value> = custom.iter().filter(|c| c.get("id").and_then(|v| v.as_str()) != Some(id)).cloned().collect();
        if next_custom.len() == custom.len() {
            return Err(CoFinderError::new("LOCAL_FAVORITES_NOT_FOUND", "Not found"));
        }
        let next = if hidden.is_empty() {
            json!({ "version": 1, "custom": next_custom })
        } else {
            json!({ "version": 1, "custom": next_custom, "hiddenDefaultIds": hidden })
        };
        self.save_disk(&next)?;
        Ok(self.list_rows())
    }

    pub fn rename_by_id(&self, id: &str, label: &str) -> Result<Vec<Value>, CoFinderError> {
        let trimmed: String = label.trim().chars().take(256).collect();
        if trimmed.is_empty() {
            return Err(CoFinderError::new("LOCAL_INVALID_INPUT", "Label is required."));
        }
        if is_default_favorite_id(id) {
            return Err(CoFinderError::new("LOCAL_INVALID_INPUT", "Built-in favorites cannot be renamed."));
        }
        let disk = self.load_disk_safe();
        let custom = disk.get("custom").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let hidden: Vec<String> = disk.get("hiddenDefaultIds").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        let index = custom.iter().position(|c| c.get("id").and_then(|v| v.as_str()) == Some(id));
        let Some(index) = index else {
            return Err(CoFinderError::new("LOCAL_FAVORITES_NOT_FOUND", "Not found"));
        };
        let mut next_custom = custom;
        next_custom[index]["label"] = json!(trimmed);
        let next = if hidden.is_empty() {
            json!({ "version": 1, "custom": next_custom })
        } else {
            json!({ "version": 1, "custom": next_custom, "hiddenDefaultIds": hidden })
        };
        self.save_disk(&next)?;
        Ok(self.list_rows())
    }

    pub fn reorder_by_id(&self, id: &str, direction: &str) -> Result<Vec<Value>, CoFinderError> {
        if is_default_favorite_id(id) {
            return Err(CoFinderError::new("LOCAL_INVALID_INPUT", "Built-in favorites cannot be reordered."));
        }
        let disk = self.load_disk_safe();
        let custom = disk.get("custom").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let hidden: Vec<String> = disk.get("hiddenDefaultIds").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
        let index = custom.iter().position(|c| c.get("id").and_then(|v| v.as_str()) == Some(id));
        let Some(index) = index else {
            return Err(CoFinderError::new("LOCAL_FAVORITES_NOT_FOUND", "Not found"));
        };
        let next_index = if direction == "up" { index as isize - 1 } else { index as isize + 1 };
        if next_index < 0 || next_index >= custom.len() as isize {
            return Ok(self.list_rows());
        }
        let mut next_custom = custom;
        let item = next_custom.remove(index);
        next_custom.insert(next_index as usize, item);
        // Re-stamp createdAt to preserve order (TS uses now + i).
        let base = now_ms();
        for (i, row) in next_custom.iter_mut().enumerate() {
            row["createdAt"] = json!(base + i as f64);
        }
        let next = if hidden.is_empty() {
            json!({ "version": 1, "custom": next_custom })
        } else {
            json!({ "version": 1, "custom": next_custom, "hiddenDefaultIds": hidden })
        };
        self.save_disk(&next)?;
        Ok(self.list_rows())
    }

    pub fn reset_default_locations(&self) -> Result<Vec<Value>, CoFinderError> {
        let disk = self.load_disk_safe();
        let custom = disk.get("custom").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let next = json!({ "version": 1, "custom": custom });
        self.save_disk(&next)?;
        Ok(self.list_rows())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> String {
        let dir = std::env::temp_dir().join(format!("cf-rs-favs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("favorites.json").to_string_lossy().into_owned()
    }

    fn wk() -> WellKnownPaths {
        WellKnownPaths { home: "/Users/test".into(), desktop: "/Users/test/Desktop".into(), downloads: "/Users/test/Downloads".into(), documents: "/Users/test/Documents".into() }
    }

    #[test]
    fn default_favorites_listed() {
        let repo = LocalSidebarFavoritesRepository::new(temp_path("defaults"), wk());
        let rows = repo.list();
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0]["id"], "home");
        assert!(rows[0]["isDefault"] == json!(true));
    }

    #[test]
    fn add_remove_rename_reorder() {
        let repo = LocalSidebarFavoritesRepository::new(temp_path("crud"), wk());
        let after_add = repo.add_path("/data/project").unwrap();
        assert_eq!(after_add.len(), 5);
        let id = after_add[4]["id"].as_str().unwrap().to_string();
        assert_eq!(after_add[4]["path"], "/data/project");
        // duplicate rejected
        let err = repo.add_path("/data/project").unwrap_err();
        assert_eq!(err.code, "LOCAL_FAVORITES_DUPLICATE");
        // rename
        let renamed = repo.rename_by_id(&id, "My Project").unwrap();
        assert_eq!(renamed[4]["label"], "My Project");
        // add a second custom favorite, then reorder the first one down
        let after_second = repo.add_path("/data/other").unwrap();
        let id2 = after_second[5]["id"].as_str().unwrap().to_string();
        let reordered = repo.reorder_by_id(&id, "down").unwrap();
        // id should now be after id2 within custom rows (indexes 4 and 5)
        let pos1 = reordered.iter().position(|r| r["id"] == json!(id.as_str())).unwrap();
        let pos2 = reordered.iter().position(|r| r["id"] == json!(id2.as_str())).unwrap();
        assert_eq!(pos1, 5);
        assert_eq!(pos2, 4);
        // remove
        let removed = repo.remove_by_id(&id).unwrap();
        assert_eq!(removed.len(), 5);
    }

    #[test]
    fn hide_default_then_reset() {
        let repo = LocalSidebarFavoritesRepository::new(temp_path("hidden"), wk());
        let after_hide = repo.remove_by_id("desktop").unwrap();
        assert_eq!(after_hide.len(), 3);
        assert!(!after_hide.iter().any(|r| r["id"] == "desktop"));
        let reset = repo.reset_default_locations().unwrap();
        assert_eq!(reset.len(), 4);
    }

    #[test]
    fn rename_default_rejected() {
        let repo = LocalSidebarFavoritesRepository::new(temp_path("renamedef"), wk());
        let err = repo.rename_by_id("home", "x").unwrap_err();
        assert_eq!(err.code, "LOCAL_INVALID_INPUT");
    }

    #[test]
    fn normalize_slashes() {
        assert_eq!(normalize_local_path("/data//proj/"), "/data/proj");
        assert_eq!(normalize_local_path("///"), "/");
        assert_eq!(normalize_local_path(""), "/");
    }
}
