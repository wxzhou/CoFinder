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

/// Launch macOS Quick Look on a local file (port of `QuickLookService`).
pub fn quick_look(target: &str) -> Result<(), CoFinderError> {
    let normalized = crate::backend::util::normalize_local_path(target);
    let meta = std::fs::symlink_metadata(&normalized)
        .map_err(|e| CoFinderError::new("SYSTEM_PREVIEW_FAILED", format!("Failed to inspect path for Quick Look: {e}")))?;
    if !meta.is_file() {
        return Err(CoFinderError::new("SYSTEM_PREVIEW_FAILED", "Quick Look currently supports local files only."));
    }
    let _ = Command::new("qlmanage").args(["-p", &normalized]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
    Ok(())
}

/// Open a path in Terminal.app (port of `open -a Terminal <path>`).
pub fn open_terminal(target: &str) -> Result<(), CoFinderError> {
    let normalized = crate::backend::util::normalize_local_path(target);
    let status = Command::new("open")
        .args(["-a", "Terminal", &normalized])
        .status()
        .map_err(|e| CoFinderError::new("SYSTEM_INVALID_INPUT", format!("Failed to open Terminal: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(CoFinderError::new("SYSTEM_INVALID_INPUT", format!("Failed to open Terminal (exit {status:?}).")))
    }
}

/// Build an ssh command like `buildSshTerminalCommand` in the TS service.
pub fn build_ssh_terminal_command(username: &str, host: &str, port: u16, remote_path: Option<&str>) -> String {
    let base = format!("ssh -p {port} {username}@{host}");
    let Some(remote_path) = remote_path else { return base };
    let quoted_path = shell_single_quote(remote_path);
    let remote_command = format!("cd -- {quoted_path} && exec \"${{SHELL:-/bin/bash}}\" -i");
    format!("{base} -t {}", shell_single_quote(&remote_command))
}

pub fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// Open an SSH terminal via osascript (port of `runDetached("osascript", ...)`).
pub fn open_ssh_terminal(username: &str, host: &str, port: u16, remote_path: Option<&str>) -> Result<(), CoFinderError> {
    let command = build_ssh_terminal_command(username, host, port, remote_path);
    let script = format!("tell application \"Terminal\" to do script {}", serde_json::json!(command));
    let status = Command::new("osascript")
        .args(["-e", &script])
        .status()
        .map_err(|e| CoFinderError::new("SYSTEM_INVALID_INPUT", format!("Failed to open SSH terminal: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(CoFinderError::new("SYSTEM_INVALID_INPUT", format!("Failed to open SSH terminal (exit {status:?}).")))
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

    #[test]
    fn ssh_terminal_command_basic() {
        assert_eq!(build_ssh_terminal_command("user", "host", 22, None), "ssh -p 22 user@host");
        let with_path = build_ssh_terminal_command("user", "host", 2222, Some("/data/x"));
        assert!(with_path.starts_with("ssh -p 2222 user@host -t "));
        assert!(with_path.contains("cd --"));
    }

    #[test]
    fn shell_quote_escapes() {
        assert_eq!(shell_single_quote("plain"), "'plain'");
        assert_eq!(shell_single_quote("a'b"), "'a'\\''b'");
    }
}
