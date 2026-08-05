//! Remote SFTP service — Rust port of `ConnectionManager.ts` + the core
//! read/write operations of `RemoteFileService.ts` using russh-sftp.
//!
//! Handles connect/list/getHome/rename/delete/mkdir/getInfo/readText. The
//! remaining remote channels (window reads, previews, chmod, duplicate, touch,
//! transfers) still fall back to the sidecar.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use russh::client::Config as SshConfig;
use russh::keys::PublicKey;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;

use crate::backend::error::CoFinderError;

/// A single live SFTP connection, wrapped in `Arc` so it can be cloned out
/// of the shared map for each request (`SftpSession` itself is not `Clone`).
#[derive(Clone)]
struct ManagedSftp {
    sftp: Arc<SftpSession>,
    home_path: String,
}

/// russh client handler: accept any server key (host-key verification parity
/// with the old ssh2-sftp-client behavior).
struct SftpClientHandler;

impl russh::client::Handler for SftpClientHandler {
    type Error = russh::Error;

    async fn check_server_key(&mut self, _server_public_key: &PublicKey) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn data(
        &mut self,
        _channel: russh::ChannelId,
        _data: &[u8],
        _session: &mut russh::client::Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

pub struct RemoteService {
    runtime: tokio::runtime::Runtime,
    connections: Mutex<HashMap<String, ManagedSftp>>,
}

impl RemoteService {
    pub fn new() -> Self {
        let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().expect("tokio runtime");
        Self {
            runtime,
            connections: Mutex::new(HashMap::new()),
        }
    }

    fn block<F, T>(&self, future: F) -> Result<T, CoFinderError>
    where
        F: std::future::Future<Output = Result<T, CoFinderError>>,
    {
        self.runtime.block_on(future)
    }

    fn get(&self, connection_id: &str) -> Result<ManagedSftp, CoFinderError> {
        self.connections
            .lock()
            .unwrap()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected."))
    }

    pub fn connect(&self, host: &str, port: u16, username: &str, password: &str) -> Result<Value, CoFinderError> {
        self.block(async {
            let config = Arc::new(SshConfig::default());
            let addr = format!("{host}:{port}");
            let mut session = russh::client::connect(config, &addr, SftpClientHandler)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Connection failed: {e}")))?;
            let auth = session
                .authenticate_password(username, password)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Authentication failed: {e}")))?;
            if !auth.success() {
                return Err(CoFinderError::new("REMOTE_AUTH_FAILED", "Authentication failed. Check username and password."));
            }
            let channel = session
                .channel_open_session()
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Failed to open channel: {e}")))?;
            channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Failed to open sftp subsystem: {e}")))?;
            let sftp = SftpSession::new(channel.into_stream())
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Failed to initialize sftp: {e}")))?;
            let home_path = sftp.canonicalize(".").await.unwrap_or_else(|_| "/".to_string());
            let id = uuid::Uuid::new_v4().to_string();
            self.connections.lock().unwrap().insert(id.clone(), ManagedSftp { sftp: Arc::new(sftp), home_path: home_path.clone() });
            Ok(json!({ "connectionId": id, "homePath": home_path }))
        })
    }

    pub fn disconnect(&self, connection_id: &str) -> Result<(), CoFinderError> {
        self.connections.lock().unwrap().remove(connection_id);
        Ok(())
    }

    pub fn get_home_directory(&self, connection_id: &str) -> Result<String, CoFinderError> {
        let conn = self.connections.lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
            CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
        })?;
        Ok(conn.home_path)
    }

    pub fn list_directory(&self, connection_id: &str, input_path: &str) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(input_path);
        let entries = self.block(async {
            let conn = self.connections.lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let dir = conn.sftp.read_dir(&normalized).await.map_err(map_sftp_list_error)?;
            let mut out = Vec::new();
            for entry in dir {
                let name = entry.file_name();
                let meta = entry.metadata();
                let ft = entry.file_type();
                let etype = if ft.is_dir() { "directory" } else if ft.is_file() { "file" } else if ft.is_symlink() { "symlink" } else { "unknown" };
                let full_path = if normalized == "/" { format!("/{name}") } else { format!("{normalized}/{name}") };
                let mtime_ms = meta.mtime.unwrap_or(0) as i64 * 1000;
                let mtime = iso_from_ms(mtime_ms);
                out.push(json!({
                    "name": name,
                    "fullPath": full_path,
                    "type": etype,
                    "size": meta.size.unwrap_or(0),
                    "mtime": mtime,
                    "permissions": meta.permissions.map(util_mode_to_rwx).unwrap_or_default(),
                    "owner": meta.uid.map(|u| u.to_string()),
                    "group": meta.gid.map(|g| g.to_string()),
                    "isHidden": name.starts_with('.')
                }));
            }
            Ok(out)
        })?;
        Ok(json!({ "path": normalized, "entries": entries }))
    }

    pub fn rename_path(&self, connection_id: &str, target_path: &str, new_name: &str) -> Result<String, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        let trimmed = new_name.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
            return Err(CoFinderError::new("REMOTE_RENAME_FAILED", "New name is invalid."));
        }
        if trimmed.contains('/') || trimmed.contains('\\') {
            return Err(CoFinderError::new("REMOTE_RENAME_FAILED", "New name cannot contain path separators."));
        }
        let parent = parent_dir(&normalized);
        let destination = format!("{parent}/{trimmed}");
        self.block(async {
            let conn = self.connections.lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            conn.sftp.rename(&normalized, &destination).await.map_err(|e| {
                CoFinderError::new("REMOTE_RENAME_FAILED", format!("Failed to rename path: {e}"))
            })
        })?;
        Ok(destination)
    }

    pub fn delete_paths(&self, connection_id: &str, paths: &[String]) -> Result<u64, CoFinderError> {
        if paths.is_empty() {
            return Err(CoFinderError::new("REMOTE_DELETE_FAILED", "Select at least one remote path to delete."));
        }
        let mut deleted = 0u64;
        for raw in paths {
            let normalized = normalize_remote_path(raw);
            let result = self.block(async {
                let conn = self.connections.lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                    CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
                })?;
                let meta = conn.sftp.symlink_metadata(&normalized).await;
                match meta {
                    Ok(m) if m.file_type().is_dir() => conn.sftp.remove_dir(&normalized).await.map_err(|e| {
                        CoFinderError::new("REMOTE_DELETE_FAILED", format!("Failed to delete path: {e}"))
                    }),
                    _ => conn.sftp.remove_file(&normalized).await.map_err(|e| {
                        CoFinderError::new("REMOTE_DELETE_FAILED", format!("Failed to delete path: {e}"))
                    }),
                }
            });
            match result {
                Ok(()) => deleted += 1,
                Err(e) => return Err(CoFinderError::new("REMOTE_DELETE_FAILED", format!("Failed to delete path: {e}"))),
            }
        }
        Ok(deleted)
    }

    pub fn make_directory(&self, connection_id: &str, parent_path: &str, name: &str) -> Result<String, CoFinderError> {
        let parent = normalize_remote_path(parent_path);
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') {
            return Err(CoFinderError::new("REMOTE_MKDIR_FAILED", "Name is invalid."));
        }
        let target = if parent == "/" { format!("/{trimmed}") } else { format!("{parent}/{trimmed}") };
        self.block(async {
            let conn = self.connections.lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            conn.sftp.create_dir(&target).await.map_err(|e| {
                CoFinderError::new("REMOTE_MKDIR_FAILED", format!("Failed to create directory: {e}"))
            })
        })?;
        Ok(target)
    }

    pub fn read_text_file(&self, connection_id: &str, target_path: &str, byte_offset: Option<u64>, max_bytes: Option<u64>) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        let byte_offset = byte_offset.unwrap_or(0);
        let max_bytes = max_bytes.unwrap_or(256 * 1024).min(256 * 1024);
        self.block(async {
            let conn = self.connections.lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let meta = conn.sftp.metadata(&normalized).await.map_err(|e| {
                CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote file: {e}"))
            })?;
            if !meta.file_type().is_file() {
                return Err(CoFinderError::new("REMOTE_CONTENT_FAILED", "View Text supports files only."));
            }
            let size = meta.size.unwrap_or(0);
            let mut file = conn.sftp.open_with_flags(&normalized, OpenFlags::READ).await.map_err(|e| {
                CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote file: {e}"))
            })?;
            use tokio::io::AsyncReadExt;
            use tokio::io::AsyncSeekExt;
            if byte_offset > 0 {
                file.seek(std::io::SeekFrom::Start(byte_offset)).await.map_err(|e| {
                    CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote file: {e}"))
                })?;
            }
            let mut buf = vec![0u8; max_bytes as usize];
            let n = file.read(&mut buf).await.map_err(|e| {
                CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote file: {e}"))
            })?;
            buf.truncate(n);
            let _ = file.close().await;
            let next_byte_offset = byte_offset + n as u64;
            Ok(json!({
                "path": normalized,
                "content": String::from_utf8_lossy(&buf),
                "byteOffset": byte_offset,
                "nextByteOffset": next_byte_offset,
                "size": size,
                "truncated": next_byte_offset < size
            }))
        })
    }

    pub fn get_path_info(&self, connection_id: &str, target_path: &str) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        self.block(async {
            let conn = self.connections.lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let meta = conn.sftp.symlink_metadata(&normalized).await.map_err(|e| {
                CoFinderError::new("REMOTE_INFO_FAILED", format!("Failed to get remote path info: {e}"))
            })?;
            let etype = if meta.file_type().is_dir() { "directory" } else if meta.file_type().is_file() { "file" } else if meta.file_type().is_symlink() { "symlink" } else { "unknown" };
            let name = normalized.rsplit('/').find(|s| !s.is_empty()).unwrap_or(&normalized).to_string();
            Ok(json!({
                "name": name,
                "fullPath": normalized,
                "type": etype,
                "size": meta.size.unwrap_or(0),
                "mtime": iso_from_ms(meta.mtime.unwrap_or(0) as i64 * 1000),
                "permissions": meta.permissions.map(util_mode_to_rwx).unwrap_or_default(),
                "owner": meta.uid.map(|u| u.to_string()),
                "group": meta.gid.map(|g| g.to_string())
            }))
        })
    }
}

fn normalize_remote_path(input: &str) -> String {
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

fn parent_dir(path: &str) -> String {
    match path.rfind('/') {
        Some(0) => "/".to_string(),
        Some(idx) => path[..idx].to_string(),
        None => "/".to_string(),
    }
}

fn util_mode_to_rwx(mode: u32) -> String {
    let perm = mode & 0o777;
    let chunks = [(perm >> 6) & 0b111, (perm >> 3) & 0b111, perm & 0b111];
    chunks
        .iter()
        .map(|chunk| {
            let mut s = String::with_capacity(3);
            s.push(if chunk & 0b100 != 0 { 'r' } else { '-' });
            s.push(if chunk & 0b010 != 0 { 'w' } else { '-' });
            s.push(if chunk & 0b001 != 0 { 'x' } else { '-' });
            s
        })
        .collect()
}

fn iso_from_ms(ms: i64) -> String {
    match chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms) {
        Some(dt) => dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        None => "1970-01-01T00:00:00.000Z".to_string(),
    }
}

fn map_sftp_list_error(e: russh_sftp::client::error::Error) -> CoFinderError {
    let msg = format!("{e}");
    CoFinderError::new("REMOTE_LIST_FAILED", format!("Failed to list directory: {msg}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_remote_path_variants() {
        assert_eq!(normalize_remote_path(""), "/");
        assert_eq!(normalize_remote_path("."), "/");
        assert_eq!(normalize_remote_path("data/x"), "/data/x");
        assert_eq!(normalize_remote_path("/data/x"), "/data/x");
    }

    #[test]
    fn parent_dir_handles_root() {
        assert_eq!(parent_dir("/"), "/");
        assert_eq!(parent_dir("/a/b"), "/a");
        assert_eq!(parent_dir("/a"), "/");
    }

    #[test]
    fn mode_to_rwx_matches_ts() {
        assert_eq!(util_mode_to_rwx(0o644), "rw-r--r--");
        assert_eq!(util_mode_to_rwx(0o755), "rwxr-xr-x");
    }
}
