//! App settings service — Rust port of `src/main/services/SettingsService.ts`.
//!
//! Behavior must match the TypeScript implementation exactly (defaults,
//! normalization clamps, schemaVersion, atomic private writes) so the renderer
//! sees identical settings.

use serde_json::{json, Value};
use std::path::Path;

use crate::backend::error::CoFinderError;

pub fn default_settings_path(user_data: &str) -> String {
    std::path::Path::new(user_data)
        .join("settings.json")
        .to_string_lossy()
        .into_owned()
}

/// Build the default settings object (mirrors `DEFAULT_APP_SETTINGS`).
pub fn default_app_settings() -> Value {
    json!({
        "schemaVersion": 2,
        "general": {
            "defaultLocalPath": "",
            "restoreLastLocalPathOnLaunch": false,
            "restoreLocalPathOnConnect": false,
            "restoreRemotePathOnConnect": false,
            "confirmBeforeDelete": true,
            "showHiddenFiles": false,
            "firstRunOnboardingDismissed": false,
            "defaultTextEditor": "system"
        },
        "transfer": {
            "defaultConflictPolicy": "prompt",
            "queueAutoHideDelayMs": 10_000,
            "preserveTimestamps": true,
            "deleteSourceAfterGzip": false,
            "compressionConcurrency": 2
        },
        "remote": {
            "autoRefreshEnabled": false,
            "autoRefreshIntervalSeconds": 60,
            "autoReconnectAfterSleep": true
        },
        "appearance": {
            "rowDensity": "comfortable",
            "defaultInspectorVisible": false,
            "defaultPaneRatio": 0.5,
            "sidebarVisible": true,
            "sidebarWidth": 260,
            "showListDisclosureControls": true,
            "defaultLocalViewMode": "list",
            "defaultRemoteViewMode": "list",
            "groupLocalByType": false,
            "groupRemoteByType": false
        }
    })
}

fn is_record(value: &Value) -> bool {
    value.is_object()
}

fn bool_value(value: &Value, fallback: bool) -> bool {
    value.as_bool().unwrap_or(fallback)
}

fn string_value(value: &Value, fallback: &str, max_len: usize) -> String {
    match value.as_str() {
        Some(s) => s.trim().chars().take(max_len).collect(),
        None => fallback.to_string(),
    }
}

fn number_in_range(value: &Value, fallback: f64, min: f64, max: f64) -> f64 {
    let n = match value.as_f64() {
        Some(n) => n,
        None => match value.as_str().and_then(|s| s.parse::<f64>().ok()) {
            Some(n) => n,
            None => fallback,
        },
    };
    if !n.is_finite() {
        return fallback;
    }
    n.clamp(min, max)
}

/// Render an integral value as a JSON integer (so `4` serializes as `4`, not
/// `4.0`), matching the TS output that renderer compares with `===`.
fn json_num(n: f64) -> Value {
    if n.fract() == 0.0 {
        Value::from(n as i64)
    } else {
        Value::from(n)
    }
}

fn view_mode(value: &Value, fallback: &str) -> String {
    match value.as_str() {
        Some(v) if matches!(v, "list" | "icon" | "column" | "gallery") => v.to_string(),
        _ => fallback.to_string(),
    }
}

fn normalize_text_editor(value: &Value, fallback: &str) -> String {
    let text = string_value(value, fallback, 512);
    if text.is_empty() {
        "system".to_string()
    } else {
        text
    }
}

/// Mirrors `normalizeSettingsPatch(raw, base)`.
pub fn normalize_settings_patch(raw: &Value, base: &Value) -> Value {
    let root = if is_record(raw) { raw } else { &Value::Null };
    let general = root.get("general").filter(|v| is_record(v)).unwrap_or(&Value::Null);
    let transfer = root.get("transfer").filter(|v| is_record(v)).unwrap_or(&Value::Null);
    let remote = root.get("remote").filter(|v| is_record(v)).unwrap_or(&Value::Null);
    let appearance = root.get("appearance").filter(|v| is_record(v)).unwrap_or(&Value::Null);

    let base_general = base.get("general").unwrap_or(&Value::Null);
    let base_transfer = base.get("transfer").unwrap_or(&Value::Null);
    let base_remote = base.get("remote").unwrap_or(&Value::Null);
    let base_appearance = base.get("appearance").unwrap_or(&Value::Null);

    let legacy_restore = general
        .get("restoreLastSession")
        .and_then(|v| v.as_bool());

    let restore_launch_fallback = legacy_restore
        .or_else(|| base_general.get("restoreLastLocalPathOnLaunch").and_then(|v| v.as_bool()))
        .unwrap_or(false);
    let restore_connect_fallback = legacy_restore
        .or_else(|| base_general.get("restoreLocalPathOnConnect").and_then(|v| v.as_bool()))
        .unwrap_or(false);
    let restore_remote_fallback = legacy_restore
        .or_else(|| base_general.get("restoreRemotePathOnConnect").and_then(|v| v.as_bool()))
        .unwrap_or(false);

    let conflict = transfer.get("defaultConflictPolicy").and_then(|v| v.as_str());
    let conflict_fallback = base_transfer
        .get("defaultConflictPolicy")
        .and_then(|v| v.as_str())
        .unwrap_or("prompt");

    let row_density = appearance.get("rowDensity").and_then(|v| v.as_str());
    let row_density_fallback = base_appearance
        .get("rowDensity")
        .and_then(|v| v.as_str())
        .unwrap_or("comfortable");

    json!({
        "schemaVersion": 2,
        "general": {
            "defaultLocalPath": string_value(general.get("defaultLocalPath").unwrap_or(&Value::Null), base_general.get("defaultLocalPath").and_then(|v| v.as_str()).unwrap_or(""), 2048),
            "restoreLastLocalPathOnLaunch": bool_value(general.get("restoreLastLocalPathOnLaunch").unwrap_or(&Value::Null), restore_launch_fallback),
            "restoreLocalPathOnConnect": bool_value(general.get("restoreLocalPathOnConnect").unwrap_or(&Value::Null), restore_connect_fallback),
            "restoreRemotePathOnConnect": bool_value(general.get("restoreRemotePathOnConnect").unwrap_or(&Value::Null), restore_remote_fallback),
            "confirmBeforeDelete": bool_value(general.get("confirmBeforeDelete").unwrap_or(&Value::Null), base_general.get("confirmBeforeDelete").and_then(|v| v.as_bool()).unwrap_or(true)),
            "showHiddenFiles": bool_value(general.get("showHiddenFiles").unwrap_or(&Value::Null), base_general.get("showHiddenFiles").and_then(|v| v.as_bool()).unwrap_or(false)),
            "firstRunOnboardingDismissed": bool_value(general.get("firstRunOnboardingDismissed").unwrap_or(&Value::Null), base_general.get("firstRunOnboardingDismissed").and_then(|v| v.as_bool()).unwrap_or(false)),
            "defaultTextEditor": normalize_text_editor(general.get("defaultTextEditor").unwrap_or(&Value::Null), base_general.get("defaultTextEditor").and_then(|v| v.as_str()).unwrap_or("system"))
        },
        "transfer": {
            "defaultConflictPolicy": if matches!(conflict, Some("prompt" | "overwrite" | "skip" | "rename")) { conflict.unwrap() } else { conflict_fallback },
            "queueAutoHideDelayMs": json_num(number_in_range(transfer.get("queueAutoHideDelayMs").unwrap_or(&Value::Null), base_transfer.get("queueAutoHideDelayMs").and_then(|v| v.as_f64()).unwrap_or(10_000.0), 0.0, 60_000.0)),
            "preserveTimestamps": bool_value(transfer.get("preserveTimestamps").unwrap_or(&Value::Null), base_transfer.get("preserveTimestamps").and_then(|v| v.as_bool()).unwrap_or(true)),
            "deleteSourceAfterGzip": bool_value(transfer.get("deleteSourceAfterGzip").unwrap_or(&Value::Null), base_transfer.get("deleteSourceAfterGzip").and_then(|v| v.as_bool()).unwrap_or(false)),
            "compressionConcurrency": json_num(number_in_range(transfer.get("compressionConcurrency").unwrap_or(&Value::Null), base_transfer.get("compressionConcurrency").and_then(|v| v.as_f64()).unwrap_or(2.0), 1.0, 4.0).round())
        },
        "remote": {
            "autoRefreshEnabled": bool_value(remote.get("autoRefreshEnabled").unwrap_or(&Value::Null), base_remote.get("autoRefreshEnabled").and_then(|v| v.as_bool()).unwrap_or(false)),
            "autoRefreshIntervalSeconds": json_num(number_in_range(remote.get("autoRefreshIntervalSeconds").unwrap_or(&Value::Null), base_remote.get("autoRefreshIntervalSeconds").and_then(|v| v.as_f64()).unwrap_or(60.0), 5.0, 3600.0).round()),
            "autoReconnectAfterSleep": bool_value(remote.get("autoReconnectAfterSleep").unwrap_or(&Value::Null), base_remote.get("autoReconnectAfterSleep").and_then(|v| v.as_bool()).unwrap_or(true))
        },
        "appearance": {
            "rowDensity": if matches!(row_density, Some("compact" | "comfortable")) { row_density.unwrap() } else { row_density_fallback },
            "defaultInspectorVisible": bool_value(appearance.get("defaultInspectorVisible").unwrap_or(&Value::Null), base_appearance.get("defaultInspectorVisible").and_then(|v| v.as_bool()).unwrap_or(false)),
            "defaultPaneRatio": number_in_range(appearance.get("defaultPaneRatio").unwrap_or(&Value::Null), base_appearance.get("defaultPaneRatio").and_then(|v| v.as_f64()).unwrap_or(0.5), 0.25, 0.75),
            "sidebarVisible": bool_value(appearance.get("sidebarVisible").unwrap_or(&Value::Null), base_appearance.get("sidebarVisible").and_then(|v| v.as_bool()).unwrap_or(true)),
            "sidebarWidth": json_num(number_in_range(appearance.get("sidebarWidth").unwrap_or(&Value::Null), base_appearance.get("sidebarWidth").and_then(|v| v.as_f64()).unwrap_or(260.0), 180.0, 420.0)),
            "showListDisclosureControls": bool_value(appearance.get("showListDisclosureControls").unwrap_or(&Value::Null), base_appearance.get("showListDisclosureControls").and_then(|v| v.as_bool()).unwrap_or(true)),
            "defaultLocalViewMode": view_mode(appearance.get("defaultLocalViewMode").unwrap_or(&Value::Null), base_appearance.get("defaultLocalViewMode").and_then(|v| v.as_str()).unwrap_or("list")),
            "defaultRemoteViewMode": view_mode(appearance.get("defaultRemoteViewMode").unwrap_or(&Value::Null), base_appearance.get("defaultRemoteViewMode").and_then(|v| v.as_str()).unwrap_or("list")),
            "groupLocalByType": bool_value(appearance.get("groupLocalByType").unwrap_or(&Value::Null), base_appearance.get("groupLocalByType").and_then(|v| v.as_bool()).unwrap_or(false)),
            "groupRemoteByType": bool_value(appearance.get("groupRemoteByType").unwrap_or(&Value::Null), base_appearance.get("groupRemoteByType").and_then(|v| v.as_bool()).unwrap_or(false))
        }
    })
}

fn merge_settings(base: &Value, patch: &Value) -> Value {
    let p = if is_record(patch) { patch } else { &Value::Null };
    let merged = json!({
        "schemaVersion": 2,
        "general": merge_section(base.get("general"), p.get("general")),
        "transfer": merge_section(base.get("transfer"), p.get("transfer")),
        "remote": merge_section(base.get("remote"), p.get("remote")),
        "appearance": merge_section(base.get("appearance"), p.get("appearance"))
    });
    normalize_settings_patch(&merged, base)
}

fn merge_section(base: Option<&Value>, patch: Option<&Value>) -> Value {
    let base_obj = base.and_then(|v| v.as_object()).cloned().unwrap_or_default();
    let mut out = base_obj;
    if let Some(p) = patch.and_then(|v| v.as_object()) {
        for (k, v) in p {
            out.insert(k.clone(), v.clone());
        }
    }
    Value::Object(out)
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

/// Rust port of `SettingsService`.
pub struct SettingsService {
    file_path: String,
}

impl SettingsService {
    pub fn new(file_path: String) -> Self {
        Self { file_path }
    }

    pub fn get(&self) -> Result<Value, CoFinderError> {
        match std::fs::read_to_string(&self.file_path) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(parsed) => Ok(normalize_settings_patch(&parsed, &default_app_settings())),
                Err(_) => Ok(default_app_settings()),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(default_app_settings()),
            Err(_) => Ok(default_app_settings()),
        }
    }

    pub fn set(&self, patch: &Value) -> Result<Value, CoFinderError> {
        let current = self.get()?;
        let next = merge_settings(&current, patch);
        let serialized = serde_json::to_string_pretty(&next)
            .map(|s| format!("{s}\n"))
            .map_err(|e| CoFinderError::new("SETTINGS_SAVE_FAILED", format!("failed to serialize settings: {e}")))?;
        write_private_utf8_file(&self.file_path, &serialized)
            .map_err(|e| CoFinderError::new("SETTINGS_SAVE_FAILED", format!("failed to write settings: {e}")))?;
        Ok(next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_match_ts_defaults() {
        let d = default_app_settings();
        assert_eq!(d["schemaVersion"], 2);
        assert_eq!(d["general"]["confirmBeforeDelete"], true);
        assert_eq!(d["transfer"]["compressionConcurrency"], 2);
        assert_eq!(d["appearance"]["defaultPaneRatio"], 0.5);
    }

    #[test]
    fn normalize_with_empty_input_returns_defaults() {
        let out = normalize_settings_patch(&json!({}), &default_app_settings());
        assert_eq!(out, default_app_settings());
    }

    #[test]
    fn normalize_applies_patch_fields() {
        let out = normalize_settings_patch(
            &json!({
                "general": { "showHiddenFiles": true, "confirmBeforeDelete": false },
                "transfer": { "compressionConcurrency": 4 }
            }),
            &default_app_settings(),
        );
        assert_eq!(out["general"]["showHiddenFiles"], true);
        assert_eq!(out["general"]["confirmBeforeDelete"], false);
        assert_eq!(out["transfer"]["compressionConcurrency"], 4);
        // untouched fields keep defaults
        assert_eq!(out["appearance"]["defaultPaneRatio"], 0.5);
    }

    #[test]
    fn normalize_clamps_values() {
        let out = normalize_settings_patch(
            &json!({
                "transfer": { "compressionConcurrency": 99, "queueAutoHideDelayMs": -5 },
                "appearance": { "sidebarWidth": 9999, "defaultPaneRatio": 2.0 }
            }),
            &default_app_settings(),
        );
        assert_eq!(out["transfer"]["compressionConcurrency"], 4);
        assert_eq!(out["transfer"]["queueAutoHideDelayMs"], 0);
        assert_eq!(out["appearance"]["sidebarWidth"], 420);
        assert_eq!(out["appearance"]["defaultPaneRatio"], 0.75);
    }

    #[test]
    fn normalize_rejects_bad_enums() {
        let out = normalize_settings_patch(
            &json!({
                "transfer": { "defaultConflictPolicy": "bogus" },
                "appearance": { "rowDensity": "bogus", "defaultLocalViewMode": "bogus" }
            }),
            &default_app_settings(),
        );
        assert_eq!(out["transfer"]["defaultConflictPolicy"], "prompt");
        assert_eq!(out["appearance"]["rowDensity"], "comfortable");
        assert_eq!(out["appearance"]["defaultLocalViewMode"], "list");
    }

    #[test]
    fn legacy_restore_last_session_backfills_restore_flags() {
        let out = normalize_settings_patch(
            &json!({ "general": { "restoreLastSession": true } }),
            &default_app_settings(),
        );
        assert_eq!(out["general"]["restoreLastLocalPathOnLaunch"], true);
        assert_eq!(out["general"]["restoreLocalPathOnConnect"], true);
        assert_eq!(out["general"]["restoreRemotePathOnConnect"], true);
    }

    #[test]
    fn get_missing_file_returns_defaults() {
        let dir = std::env::temp_dir().join(format!("cf-rs-settings-{}", std::process::id()));
        let path = dir.join("settings.json").to_string_lossy().into_owned();
        let svc = SettingsService::new(path.clone());
        let out = svc.get().unwrap();
        assert_eq!(out, default_app_settings());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_merges_and_persists() {
        let dir = std::env::temp_dir().join(format!("cf-rs-settings-write-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("settings.json").to_string_lossy().into_owned();
        let svc = SettingsService::new(path.clone());
        let out = svc.set(&json!({ "general": { "showHiddenFiles": true } })).unwrap();
        assert_eq!(out["general"]["showHiddenFiles"], true);
        assert_eq!(out["appearance"]["defaultPaneRatio"], 0.5); // base preserved
        // Reload from disk
        let svc2 = SettingsService::new(path.clone());
        let reloaded = svc2.get().unwrap();
        assert_eq!(reloaded["general"]["showHiddenFiles"], true);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
