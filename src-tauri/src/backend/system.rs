//! System helpers — Rust port of `DiagnosticsService.ts` plus the system
//! channels (copyText via pbcopy, openLogFolder/openLogFile via `open`, tool
//! availability checks, app version, update policy stub).

use serde_json::{json, Value};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use crate::backend::error::CoFinderError;

fn redact_sensitive(text: &str) -> String {
    // Simple redaction of common secret markers, mirroring the TS regex strategy.
    let mut out = text.to_string();
    for token in ["password", "passphrase", "privateKey", "token"] {
        // redact `"token": "value"` style pairs
        let pattern = format!("\"{token}\"\\s*:\\s*\"[^\"]*\"");
        if let Ok(re) = regex::Regex::new(&pattern) {
            out = re.replace_all(&out, format!("\"{token}\": \"[REDACTED]\"")).to_string();
        }
    }
    out
}

fn check_tool_available(command: &str) -> Value {
    // Run `<cmd> --version` with a short timeout.
    let mut child = match Command::new(command).arg("--version").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
        Ok(c) => c,
        Err(_) => return json!({ "available": false, "detail": "command not found" }),
    };
    let mut output = String::new();
    let deadline = std::time::Instant::now();
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            if let Ok(out) = child.wait_with_output() {
                output = String::from_utf8_lossy(&out.stdout).into_owned();
                if output.is_empty() {
                    output = String::from_utf8_lossy(&out.stderr).into_owned();
                }
            }
            let detail = first_line(&output).unwrap_or_else(|| format!("exit {status:?}"));
            let available = status.success();
            return json!({ "available": available, "detail": redact_sensitive(&detail.chars().take(180).collect::<String>()) });
        }
        if deadline.elapsed().as_millis() > 1500 {
            let _ = child.kill();
            return json!({ "available": false, "detail": "version check timed out" });
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

fn first_line(value: &str) -> Option<String> {
    value.lines().map(|l| l.trim().to_string()).find(|l| !l.is_empty())
}

fn file_exists_is_file(path: &str) -> bool {
    Path::new(path).is_file()
}

pub struct SystemService {
    pub version: String,
    pub user_data_path: String,
    pub log_file_path: String,
}

impl SystemService {
    pub fn new(version: String, user_data_path: String) -> Self {
        Self {
            version,
            log_file_path: format!("{user_data_path}/main.log"),
            user_data_path,
        }
    }

    pub fn build_diagnostics_bundle(&self) -> Value {
        let ssh = check_tool_available("ssh");
        let rsync = check_tool_available("rsync");
        let log_file_exists = file_exists_is_file(&self.log_file_path);
        let arch = std::env::consts::ARCH;
        json!({
            "generatedAt": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
            "appVersion": self.version,
            "platform": "darwin",
            "arch": arch,
            "userDataPath": self.user_data_path,
            "logFilePath": self.log_file_path,
            "logFileExists": log_file_exists,
            "tools": { "ssh": ssh, "rsync": rsync },
            "updatePolicy": {
                "mode": "manual-github-release",
                "status": "Auto-update install is not enabled in this build. Check GitHub Releases manually until signing/notarization is configured."
            }
        })
    }

    pub fn build_clipboard_text(&self) -> String {
        let bundle = self.build_diagnostics_bundle();
        let ssh = format_tool(&bundle["tools"]["ssh"]);
        let rsync = format_tool(&bundle["tools"]["rsync"]);
        let text = format!(
            "CoFinder Diagnostics\ngeneratedAt: {}\nappVersion: {}\nplatform: {}\narch: {}\nuserDataPath: {}\nlogFilePath: {}\nlogFileExists: {}\nssh: {}\nrsync: {}\nupdates: {}\n",
            bundle["generatedAt"].as_str().unwrap_or(""),
            bundle["appVersion"].as_str().unwrap_or(""),
            bundle["platform"].as_str().unwrap_or(""),
            bundle["arch"].as_str().unwrap_or(""),
            bundle["userDataPath"].as_str().unwrap_or(""),
            bundle["logFilePath"].as_str().unwrap_or(""),
            if bundle["logFileExists"].as_bool().unwrap_or(false) { "yes" } else { "no" },
            ssh,
            rsync,
            bundle["updatePolicy"]["status"].as_str().unwrap_or("")
        );
        redact_sensitive(&text)
    }
}

fn format_tool(tool: &Value) -> String {
    let available = tool.get("available").and_then(|v| v.as_bool()).unwrap_or(false);
    let base = if available { "available" } else { "missing" };
    match tool.get("detail").and_then(|v| v.as_str()) {
        Some(d) if !d.is_empty() => format!("{base} ({d})"),
        _ => base.to_string(),
    }
}

/// Copy text to the macOS pasteboard via `pbcopy`.
pub fn copy_text(text: &str) -> Result<(), CoFinderError> {
    let mut child = Command::new("pbcopy").stdin(Stdio::piped()).spawn()
        .map_err(|e| CoFinderError::new("SYSTEM_INVALID_INPUT", format!("failed to copy text: {e}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(text.as_bytes());
    }
    let _ = child.wait();
    Ok(())
}

/// Open a path in Finder via `open` (port of `shell.openPath`).
pub fn open_path(target: &str) -> Result<(), CoFinderError> {
    let status = Command::new("open").arg(target).status()
        .map_err(|e| CoFinderError::new("SYSTEM_LOG_OPEN_FAILED", format!("failed to open: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(CoFinderError::new("SYSTEM_LOG_OPEN_FAILED", format!("open failed with exit {status:?}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_line_extracts() {
        assert_eq!(first_line("  \nOpenSSH_9.0\nmore"), Some("OpenSSH_9.0".to_string()));
        assert_eq!(first_line(""), None);
    }

    #[test]
    fn redact_marks_secrets() {
        let out = redact_sensitive(r#"{"password": "hunter2", "host": "x"}"#);
        assert!(!out.contains("hunter2"));
        assert!(out.contains("[REDACTED]"));
    }

    #[test]
    fn tool_availability_runs() {
        let v = check_tool_available("sh");
        assert!(v["available"].as_bool().unwrap_or(false));
        let missing = check_tool_available("definitely-not-a-real-cmd-xyz");
        assert_eq!(missing["available"], false);
    }

    #[test]
    fn diagnostics_bundle_shape() {
        let svc = SystemService::new("1.9.10".into(), std::env::temp_dir().to_string_lossy().into_owned());
        let bundle = svc.build_diagnostics_bundle();
        assert_eq!(bundle["appVersion"], "1.9.10");
        assert_eq!(bundle["platform"], "darwin");
        assert!(bundle["tools"]["ssh"].is_object());
    }
}
