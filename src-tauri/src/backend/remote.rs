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
    session: Arc<russh::client::Handle<SftpClientHandler>>,
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

/// A global tokio runtime used for SFTP operations.
///
/// `RemoteService` runs inside the Tauri async context (`cofinder_call` is an
/// async command). Creating a `tokio::runtime::Runtime` lazily inside an async
/// context panics ("Cannot start a runtime from within a runtime"), and holding
/// one that is dropped there is also forbidden. A process-wide runtime that is
/// initialized up front (see `RemoteService::new`, called during app setup on
/// a non-async thread) avoids both problems.
static RUNTIME: std::sync::OnceLock<tokio::runtime::Runtime> = std::sync::OnceLock::new();

pub fn runtime() -> &'static tokio::runtime::Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread().enable_all().build().expect("tokio runtime")
    })
}

/// Global connection registry shared by all `RemoteService` instances, so the
/// transfer queue (which holds its own `RemoteService`) sees connections made
/// by the remote pane.
static CONNECTIONS: std::sync::OnceLock<Mutex<HashMap<String, ManagedSftp>>> = std::sync::OnceLock::new();

fn global_connections() -> &'static Mutex<HashMap<String, ManagedSftp>> {
    CONNECTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub struct RemoteService {
    // Connections live in the global CONNECTIONS registry so every instance
    // (remote pane + transfer queue) shares the same live SFTP sessions.
}

static SIZE_ABORTS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, Arc<std::sync::atomic::AtomicBool>>>> =
    std::sync::OnceLock::new();

fn size_aborts() -> &'static std::sync::Mutex<std::collections::HashMap<String, Arc<std::sync::atomic::AtomicBool>>> {
    SIZE_ABORTS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

impl RemoteService {
    pub fn new() -> Self {
        let _ = runtime();
        Self {}
    }

    fn block<F, T>(&self, future: F) -> Result<T, CoFinderError>
    where
        F: std::future::Future<Output = Result<T, CoFinderError>>,
    {
        runtime().block_on(future)
    }

    pub fn connect(&self, host: &str, port: u16, username: &str, password: &str, auth_type: &str, private_key_path: Option<&str>) -> Result<Value, CoFinderError> {
        eprintln!("[cofinder-rs] connect start host={host} port={port} user={username} auth={auth_type}");
        let result = self.block(async {
            let config = Arc::new(SshConfig::default());
            let addr = format!("{host}:{port}");
            let mut session = match russh::client::connect(config, &addr, SftpClientHandler).await {
                Ok(s) => {
                    eprintln!("[cofinder-rs] connect: tcp+ssh ok");
                    s
                }
                Err(e) => {
                    eprintln!("[cofinder-rs] connect: tcp+ssh FAIL {e}");
                    return Err(CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Connection failed: {e}")));
                }
            };
            let auth_success = if auth_type == "privateKey" {
                let key_path = private_key_path
                    .filter(|p| !p.is_empty())
                    .ok_or_else(|| CoFinderError::new("REMOTE_INVALID_INPUT", "Private key path is required."))?;
                let key = russh::keys::load_secret_key(key_path, None)
                    .map_err(|e| CoFinderError::new("REMOTE_AUTH_FAILED", format!("Failed to load private key: {e}")))?;
                let pk = russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), None);
                session
                    .authenticate_publickey(username, pk)
                    .await
                    .map_err(|e| CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Authentication failed: {e}")))?
                    .success()
            } else {
                session
                    .authenticate_password(username, password)
                    .await
                    .map_err(|e| CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Authentication failed: {e}")))?
                    .success()
            };
            eprintln!("[cofinder-rs] connect: auth_success={auth_success}");
            if !auth_success {
                return Err(CoFinderError::new("REMOTE_AUTH_FAILED", "Authentication failed. Check username and password."));
            }
            let channel = match session.channel_open_session().await {
                Ok(c) => {
                    eprintln!("[cofinder-rs] connect: channel ok");
                    c
                }
                Err(e) => {
                    eprintln!("[cofinder-rs] connect: channel FAIL {e}");
                    return Err(CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Failed to open channel: {e}")));
                }
            };
            if let Err(e) = channel.request_subsystem(true, "sftp").await {
                eprintln!("[cofinder-rs] connect: subsystem FAIL {e}");
                return Err(CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Failed to open sftp subsystem: {e}")));
            }
            eprintln!("[cofinder-rs] connect: subsystem ok");
            let sftp = match SftpSession::new(channel.into_stream()).await {
                Ok(s) => {
                    eprintln!("[cofinder-rs] connect: sftp session ok");
                    s
                }
                Err(e) => {
                    eprintln!("[cofinder-rs] connect: sftp init FAIL {e}");
                    return Err(CoFinderError::new("REMOTE_CONNECTION_FAILED", format!("Failed to initialize sftp: {e}")));
                }
            };
            let home_path = sftp.canonicalize(".").await.unwrap_or_else(|_| "/".to_string());
            let id = uuid::Uuid::new_v4().to_string();
            global_connections().lock().unwrap().insert(id.clone(), ManagedSftp {
                session: Arc::new(session), sftp: Arc::new(sftp), home_path: home_path.clone()
            });
            Ok(json!({ "connectionId": id, "homePath": home_path }))
        });
        eprintln!("[cofinder-rs] connect done: {:?}", result.as_ref().map(|v| v.get("connectionId")).ok());
        result
    }

    pub fn disconnect(&self, connection_id: &str) -> Result<(), CoFinderError> {
        global_connections().lock().unwrap().remove(connection_id);
        Ok(())
    }

    pub fn get_home_directory(&self, connection_id: &str) -> Result<String, CoFinderError> {
        let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
            CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
        })?;
        Ok(conn.home_path)
    }

    pub fn list_directory(&self, connection_id: &str, input_path: &str) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(input_path);
        let entries = self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
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
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
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
                let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
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
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
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
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
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

    /// Preview a remote file (text or image) — port of `readPreviewFile`.
    pub fn read_preview(&self, connection_id: &str, target_path: &str) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        let max_text_bytes = 256 * 1024;
        let max_image_bytes = 50 * 1024 * 1024;
        let sniff_bytes = 8192usize;
        let (size, etype) = self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let meta = conn.sftp.metadata(&normalized).await.map_err(|e| {
                CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to preview remote file: {e}"))
            })?;
            if !meta.file_type().is_file() {
                return Err(CoFinderError::new("REMOTE_CONTENT_FAILED", "Preview supports files only."));
            }
            Ok((meta.size.unwrap_or(0), "file".to_string()))
        })?;
        let _ = etype;
        let initial_bytes = (sniff_bytes as u64).max(max_text_bytes as u64).min(size.max(0));
        let chunk = self.read_remote_bytes(connection_id, &normalized, 0, initial_bytes)?;
        let sample = &chunk[..chunk.len().min(sniff_bytes)];
        let kind = crate::backend::remote_edit::sniff_preview_kind_pub(sample);
        match kind {
            Some("text") => {
                let content_bytes = chunk[..chunk.len().min(max_text_bytes)].to_vec();
                let content = String::from_utf8_lossy(&content_bytes).into_owned();
                Ok(json!({
                    "path": normalized, "kind": "text", "size": size,
                    "content": content, "truncated": (max_text_bytes as u64) < size
                }))
            }
            Some("image") => {
                if size > max_image_bytes {
                    return Err(CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Image preview supports files up to {} MB.", max_image_bytes / (1024 * 1024))));
                }
                let full = self.read_remote_bytes(connection_id, &normalized, 0, size)?;
                let mime = crate::backend::remote_edit::sniff_image_mime_type_pub(&full[..full.len().min(8192)]).unwrap_or("application/octet-stream").to_string();
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&full);
                Ok(json!({
                    "path": normalized, "kind": "image", "size": size, "mimeType": mime,
                    "imageDataUrl": format!("data:{mime};base64,{b64}"), "truncated": false
                }))
            }
            _ => Err(CoFinderError::new("REMOTE_CONTENT_FAILED", "Selected remote file does not look like previewable text or image.")),
        }
    }

    fn read_remote_bytes(&self, connection_id: &str, path: &str, offset: u64, len: u64) -> Result<Vec<u8>, CoFinderError> {
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let mut file = conn.sftp.open_with_flags(path, OpenFlags::READ).await.map_err(|e| {
                CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote file: {e}"))
            })?;
            use tokio::io::AsyncReadExt;
            use tokio::io::AsyncSeekExt;
            if offset > 0 {
                file.seek(std::io::SeekFrom::Start(offset)).await.map_err(|e| {
                    CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote file: {e}"))
                })?;
            }
            let mut buf = vec![0u8; len as usize];
            let n = file.read(&mut buf).await.map_err(|e| {
                CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote file: {e}"))
            })?;
            buf.truncate(n);
            let _ = file.close().await;
            Ok(buf)
        })
    }

    /// Run a remote shell command over the SSH session and capture stdout.
    /// Used by touch/gzip/search/window-read operations (parity with the TS
    /// `client.exec` path).
    pub fn exec_command(&self, connection_id: &str, command: &str) -> Result<String, CoFinderError> {
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let mut channel = conn
                .session
                .channel_open_session()
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to open channel: {e}")))?;
            channel
                .exec(true, command)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to exec command: {e}")))?;
            let mut output = String::new();
            loop {
                match channel.wait().await {
                    Some(russh::ChannelMsg::Data { data }) => output.push_str(&String::from_utf8_lossy(&data)),
                    Some(russh::ChannelMsg::ExtendedData { data, .. }) => output.push_str(&String::from_utf8_lossy(&data)),
                    Some(russh::ChannelMsg::Eof) | None => break,
                    _ => {}
                }
            }
            let _ = channel.close().await;
            Ok(output)
        })
    }

    /// Change remote file permissions (port of `chmodPath`).
    pub fn chmod_path(&self, connection_id: &str, target_path: &str, mode: u32) -> Result<(), CoFinderError> {
        if mode > 0o777 {
            return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Permissions must be an octal mode from 000 to 777."));
        }
        let normalized = normalize_remote_path(target_path);
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let mut attrs = russh_sftp::protocol::FileAttributes::empty();
            attrs.permissions = Some(mode);
            let file = conn
                .sftp
                .open_with_flags(&normalized, OpenFlags::READ)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CHMOD_FAILED", format!("Failed to chmod path: {e}")))?;
            file.set_metadata(attrs).await.map_err(|e| CoFinderError::new("REMOTE_CHMOD_FAILED", format!("Failed to chmod path: {e}")))?;
            let _ = file.close().await;
            Ok(())
        })
    }

    /// Touch a remote file (port of `touchPath`) via remote `touch` command.
    pub fn touch_path(&self, connection_id: &str, target_path: &str, timestamp: Option<&str>) -> Result<(), CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        let command = match timestamp {
            Some(ts) => {
                let stamp = timestamp_to_touch_stamp(ts)
                    .ok_or_else(|| CoFinderError::new("REMOTE_TOUCH_FAILED", "Timestamp must use YYYY-MM-DDTHH:mm:ss."))?;
                format!("touch -t {stamp} {}", shell_single_quote(&normalized))
            }
            None => format!("touch {}", shell_single_quote(&normalized)),
        };
        self.exec_command(connection_id, &command)
            .map_err(|e| CoFinderError::new("REMOTE_TOUCH_FAILED", e.message))?;
        Ok(())
    }

    /// Create an empty remote text file (port of `createTextFile`).
    pub fn create_text_file(&self, connection_id: &str, parent_path: &str, name: Option<&str>) -> Result<String, CoFinderError> {
        let parent = normalize_remote_path(parent_path);
        let target = match name {
            Some(n) if !n.trim().is_empty() => {
                let child = validate_remote_child_name(n)?;
                if parent == "/" {
                    format!("/{child}")
                } else {
                    format!("{parent}/{child}")
                }
            }
            _ => {
                let mut found = None;
                for i in 1..=999u32 {
                    let candidate_name = if i == 1 { "Untitled.txt".to_string() } else { format!("Untitled {i}.txt") };
                    let candidate = if parent == "/" {
                        format!("/{candidate_name}")
                    } else {
                        format!("{parent}/{candidate_name}")
                    };
                    if !self.path_exists(connection_id, &candidate)? {
                        found = Some(candidate);
                        break;
                    }
                }
                found.ok_or_else(|| CoFinderError::new("REMOTE_CREATE_FILE_FAILED", "Could not find an available text file name."))?
            }
        };
        // create_new semantics: fail if exists. We check existence first.
        if self.path_exists(connection_id, &target)? {
            return Err(CoFinderError::new("REMOTE_CREATE_FILE_FAILED", "A file with the same name already exists."));
        }
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let file = conn
                .sftp
                .open_with_flags(&target, OpenFlags::CREATE | OpenFlags::WRITE)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_CREATE_FILE_FAILED", format!("Failed to create text file: {e}")))?;
            let _ = file.close().await;
            Ok(())
        })?;
        Ok(target)
    }

    /// Duplicate a remote file (<=50MB) by download+upload (port of `duplicateFile`).
    pub fn duplicate_file(&self, connection_id: &str, target_path: &str) -> Result<String, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        let size = self.remote_file_size(connection_id, &normalized)?;
        if size > 50 * 1024 * 1024 {
            return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Remote duplicate is limited to files up to 50 MB."));
        }
        let destination = self.next_duplicate_path(connection_id, &normalized)?;
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            // read source
            let mut src = conn
                .sftp
                .open_with_flags(&normalized, OpenFlags::READ)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_DUPLICATE_FAILED", format!("Failed to duplicate file: {e}")))?;
            use tokio::io::AsyncReadExt;
            let mut data = Vec::new();
            src.read_to_end(&mut data).await.map_err(|e| CoFinderError::new("REMOTE_DUPLICATE_FAILED", format!("Failed to duplicate file: {e}")))?;
            let _ = src.close().await;
            // write destination
            let mut dst = conn
                .sftp
                .open_with_flags(&destination, OpenFlags::CREATE | OpenFlags::WRITE)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_DUPLICATE_FAILED", format!("Failed to duplicate file: {e}")))?;
            use tokio::io::AsyncWriteExt;
            dst.write_all(&data).await.map_err(|e| CoFinderError::new("REMOTE_DUPLICATE_FAILED", format!("Failed to duplicate file: {e}")))?;
            let _ = dst.close().await;
            Ok(())
        })?;
        Ok(destination)
    }

    fn path_exists(&self, connection_id: &str, path: &str) -> Result<bool, CoFinderError> {
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            match conn.sftp.symlink_metadata(path).await {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        })
    }

    fn remote_file_size(&self, connection_id: &str, path: &str) -> Result<u64, CoFinderError> {
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let meta = conn
                .sftp
                .symlink_metadata(path)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_DUPLICATE_FAILED", format!("Failed to stat file: {e}")))?;
            if !meta.file_type().is_file() {
                return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Only remote files can be duplicated in this version."));
            }
            Ok(meta.size.unwrap_or(0))
        })
    }

    fn next_duplicate_path(&self, connection_id: &str, path: &str) -> Result<String, CoFinderError> {
        for i in 1..1000u32 {
            let candidate = if i == 1 {
                format!("{path}.copy")
            } else {
                format!("{path}.copy-{i}")
            };
            if !self.path_exists(connection_id, &candidate)? {
                return Ok(candidate);
            }
        }
        Err(CoFinderError::new("REMOTE_DUPLICATE_FAILED", "Could not find an available duplicate name."))
    }

    /// Search remote text via `rg`/`grep` over exec (port of `searchText`).
    pub fn search_text(&self, connection_id: &str, target_path: &str, query: &str, max_matches: Option<u64>) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        let trimmed = query.trim();
        let max_matches = max_matches.unwrap_or(200).min(200);
        if trimmed.is_empty() {
            return Err(CoFinderError::new("REMOTE_CONTENT_FAILED", "Search query is required."));
        }
        let line_limit = max_matches + 1;
        let marker = shell_single_quote("__COFINDER_SEARCH_TOOL__:");
        let needle = shell_single_quote(trimmed);
        let root = shell_single_quote(&normalized);
        let command = format!(
            "set +e\nif command -v rg >/dev/null 2>&1; then\n  printf '%srg\\n' {marker}\n  rg --line-number --with-filename --fixed-strings --no-heading --color never -- {needle} {root} | head -n {line_limit}\n  exit 0\nfi\nif command -v grep >/dev/null 2>&1; then\n  printf '%sgrep\\n' {marker}\n  if [ -d {root} ]; then grep -R -n -H -F -- {needle} {root}; else grep -n -H -F -- {needle} {root}; fi | head -n {line_limit}\n  exit 0\nfi\nprintf '%s\\n' 'Neither rg nor grep is available on the remote server.' >&2\nexit 127"
        );
        let output = self
            .exec_command(connection_id, &command)
            .map_err(|e| CoFinderError::new("REMOTE_CONTENT_FAILED", e.message))?;
        let tool = if output.starts_with("__COFINDER_SEARCH_TOOL__:rg") { "rg" } else { "grep" };
        let body = output.lines().filter(|l| !l.starts_with("__COFINDER_SEARCH_TOOL__:")).collect::<Vec<_>>();
        let mut matches: Vec<Value> = Vec::new();
        for line in &body {
            if let Some(m) = parse_search_line(line) {
                matches.push(m);
                if matches.len() as u64 >= max_matches {
                    break;
                }
            }
        }
        Ok(json!({
            "query": trimmed,
            "rootPath": normalized,
            "matches": matches,
            "truncated": body.len() > matches.len(),
            "tool": tool
        }))
    }

    /// Read a remote text line window via awk over exec (port of `readTextWindow`).
    pub fn read_text_window(&self, connection_id: &str, target_path: &str, target_line: u64, context_before: Option<u64>, context_after: Option<u64>) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        let target_line = if target_line == 0 { 1 } else { target_line };
        let context_before = context_before.unwrap_or(80).min(500);
        let context_after = context_after.unwrap_or(80).min(500);
        let start_line = target_line.saturating_sub(context_before).max(1);
        let end_line = target_line + context_after;
        let target = shell_single_quote(&normalized);
        let marker = shell_single_quote("__COFINDER_TEXT_WINDOW_MORE_AFTER__");
        let command = format!(
            "LC_ALL=C awk -v start={start_line} -v end={end_line} -v marker={marker} ' NR >= start && NR <= end {{ print }} NR > end {{ print marker; exit }} ' {target}"
        );
        let output = self
            .exec_command(connection_id, &command)
            .map_err(|e| CoFinderError::new("REMOTE_CONTENT_FAILED", e.message))?;
        let mut lines: Vec<String> = output.replace("\r\n", "\n").split('\n').map(|s| s.to_string()).collect();
        if lines.last().map(|s| s.is_empty()).unwrap_or(false) {
            lines.pop();
        }
        let truncated_after = lines.last().map(|l| l == "__COFINDER_TEXT_WINDOW_MORE_AFTER__").unwrap_or(false);
        if truncated_after {
            lines.pop();
        }
        Ok(json!({
            "path": normalized,
            "content": lines.join("\n"),
            "startLine": start_line,
            "targetLine": target_line,
            "truncatedBefore": start_line > 1,
            "truncatedAfter": truncated_after
        }))
    }

    pub fn get_path_info(&self, connection_id: &str, target_path: &str) -> Result<Value, CoFinderError> {
        let normalized = normalize_remote_path(target_path);
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
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

    /// Recursively upload a local file/dir to a remote path over SFTP.
    pub fn upload_path_to_remote(&self, connection_id: &str, local_path: &str, remote_path: &str) -> Result<(), CoFinderError> {
        let local = std::path::PathBuf::from(local_path);
        let meta = std::fs::symlink_metadata(&local)
            .map_err(|e| CoFinderError::new("REMOTE_UPLOAD_FAILED", format!("Failed to access local path: {e}")))?;
        if meta.is_dir() {
            self.upload_dir_to_remote(connection_id, &local, remote_path)
        } else {
            self.upload_file_to_remote(connection_id, &local, remote_path)
        }
    }

    fn upload_dir_to_remote(&self, connection_id: &str, local_dir: &std::path::Path, remote_dir: &str) -> Result<(), CoFinderError> {
        let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
            CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
        })?;
        // Ensure the destination directory exists (create if missing).
        let _ = self.block(async {
            let conn2 = global_connections().lock().unwrap().get(connection_id).cloned().unwrap();
            if conn2.sftp.symlink_metadata(remote_dir).await.is_err() {
                let _ = conn2.sftp.create_dir(remote_dir).await;
            }
            Ok::<_, CoFinderError>(())
        });
        let _ = &conn;
        for entry in std::fs::read_dir(local_dir).map_err(|e| CoFinderError::new("REMOTE_UPLOAD_FAILED", format!("Failed to read local directory: {e}")))? {
            let entry = entry.map_err(|e| CoFinderError::new("REMOTE_UPLOAD_FAILED", format!("Failed to read local directory: {e}")))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let remote_child = if remote_dir == "/" { format!("/{name}") } else { format!("{remote_dir}/{name}") };
            let entry_meta = entry.metadata().map_err(|e| CoFinderError::new("REMOTE_UPLOAD_FAILED", format!("Failed to stat local file: {e}")))?;
            if entry_meta.is_dir() {
                self.upload_dir_to_remote(connection_id, &entry.path(), &remote_child)?;
            } else {
                self.upload_file_to_remote(connection_id, &entry.path(), &remote_child)?;
            }
        }
        Ok(())
    }

    fn upload_file_to_remote(&self, connection_id: &str, local_file: &std::path::Path, remote_path: &str) -> Result<(), CoFinderError> {
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let data = std::fs::read(local_file)
                .map_err(|e| CoFinderError::new("REMOTE_UPLOAD_FAILED", format!("Failed to read local file: {e}")))?;
            let mut file = conn
                .sftp
                .open_with_flags(remote_path, OpenFlags::CREATE | OpenFlags::WRITE | OpenFlags::TRUNCATE)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_UPLOAD_FAILED", format!("Failed to open remote file: {e}")))?;
            use tokio::io::AsyncWriteExt;
            file.write_all(&data).await.map_err(|e| CoFinderError::new("REMOTE_UPLOAD_FAILED", format!("Failed to write remote file: {e}")))?;
            let _ = file.close().await;
            Ok(())
        })
    }

    /// Recursively download a remote file/dir to a local path over SFTP.
    pub fn download_path_to_local(&self, connection_id: &str, remote_path: &str, local_path: &str) -> Result<(), CoFinderError> {
        let remote_type = self.remote_path_type(connection_id, remote_path)?;
        if remote_type == "directory" {
            self.download_dir_to_local(connection_id, remote_path, local_path)
        } else {
            self.download_file_to_local(connection_id, remote_path, local_path)
        }
    }

    fn remote_path_type(&self, connection_id: &str, remote_path: &str) -> Result<String, CoFinderError> {
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let meta = conn.sftp.symlink_metadata(remote_path).await.map_err(|e| {
                CoFinderError::new("REMOTE_DOWNLOAD_FAILED", format!("Failed to stat remote path: {e}"))
            })?;
            Ok(if meta.file_type().is_dir() { "directory" } else { "file" }.to_string())
        })
    }

    fn download_dir_to_local(&self, connection_id: &str, remote_dir: &str, local_dir: &str) -> Result<(), CoFinderError> {
        std::fs::create_dir_all(local_dir)
            .map_err(|e| CoFinderError::new("REMOTE_DOWNLOAD_FAILED", format!("Failed to create local directory: {e}")))?;
        let entries = self.remote_list_names(connection_id, remote_dir)?;
        for name in entries {
            let remote_child = if remote_dir == "/" { format!("/{name}") } else { format!("{remote_dir}/{name}") };
            let local_child = std::path::Path::new(local_dir).join(&name).to_string_lossy().into_owned();
            let child_type = self.remote_path_type(connection_id, &remote_child)?;
            if child_type == "directory" {
                self.download_dir_to_local(connection_id, &remote_child, &local_child)?;
            } else {
                self.download_file_to_local(connection_id, &remote_child, &local_child)?;
            }
        }
        Ok(())
    }

    fn remote_list_names(&self, connection_id: &str, remote_dir: &str) -> Result<Vec<String>, CoFinderError> {
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let dir = conn.sftp.read_dir(remote_dir).await.map_err(|e| {
                CoFinderError::new("REMOTE_DOWNLOAD_FAILED", format!("Failed to read remote directory: {e}"))
            })?;
            Ok(dir.map(|e| e.file_name()).collect())
        })
    }

    /// Recursively compute remote directory size + file count (port of
    /// `RemoteFileService.calculateDirectorySize`). Returns (size_bytes, file_count).
    pub fn calculate_directory_size(&self, connection_id: &str, path: &str, abort: &std::sync::atomic::AtomicBool) -> Result<(u64, u64), CoFinderError> {
        fn walk(service: &RemoteService, connection_id: &str, dir: &str, abort: &std::sync::atomic::AtomicBool) -> Result<(u64, u64), CoFinderError> {
            if abort.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(CoFinderError::new("REMOTE_SIZE_CANCELED", "Directory size calculation was canceled."));
            }
            let mut total = 0u64;
            let mut files = 0u64;
            let entries = service.block(async {
                let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                    CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
                })?;
                let dir = conn.sftp.read_dir(dir).await.map_err(|e| {
                    CoFinderError::new("REMOTE_CONTENT_FAILED", format!("Failed to read remote directory: {e}"))
                })?;
                let mut out = Vec::new();
                for f in dir {
                    let m = f.metadata();
                    out.push((f.file_name(), f.file_type().is_dir(), m.size.unwrap_or(0)));
                }
                Ok(out)
            })?;
            for (name, is_dir, size) in entries {
                if is_dir {
                    let child = if dir == "/" { format!("/{name}") } else { format!("{dir}/{name}") };
                    let (s, f) = walk(service, connection_id, &child, abort)?;
                    total += s;
                    files += f;
                } else {
                    total += size;
                    files += 1;
                }
            }
            Ok((total, files))
        }
        walk(self, connection_id, path, abort)
    }

    fn download_file_to_local(&self, connection_id: &str, remote_path: &str, local_path: &str) -> Result<(), CoFinderError> {
        if let Some(parent) = std::path::Path::new(local_path).parent() {
            std::fs::create_dir_all(parent).ok();
        }
        self.block(async {
            let conn = global_connections().lock().unwrap().get(connection_id).cloned().ok_or_else(|| {
                CoFinderError::new("REMOTE_DISCONNECTED", "Remote connection has been disconnected.")
            })?;
            let mut src = conn
                .sftp
                .open_with_flags(remote_path, OpenFlags::READ)
                .await
                .map_err(|e| CoFinderError::new("REMOTE_DOWNLOAD_FAILED", format!("Failed to open remote file: {e}")))?;
            use tokio::io::AsyncReadExt;
            let mut data = Vec::new();
            src.read_to_end(&mut data).await.map_err(|e| CoFinderError::new("REMOTE_DOWNLOAD_FAILED", format!("Failed to read remote file: {e}")))?;
            let _ = src.close().await;
            std::fs::write(local_path, &data)
                .map_err(|e| CoFinderError::new("REMOTE_DOWNLOAD_FAILED", format!("Failed to write local file: {e}")))?;
            Ok(())
        })
    }

    /// Generate a remote MD5 via `md5sum`.
    pub fn remote_md5(&self, connection_id: &str, path: &str) -> Result<String, CoFinderError> {
        let normalized = normalize_remote_path(path);
        let cmd = format!("md5sum {} 2>/dev/null | awk '{{print $1}}'", shell_single_quote(&normalized));
        let out = self.exec_command(connection_id, &cmd).map_err(|e| CoFinderError::new("REMOTE_MD5_FAILED", e.message))?;
        Ok(out.trim().to_string())
    }

    /// Decompress a remote .tar.gz/.tgz/.gz archive.
    pub fn remote_decompress(&self, connection_id: &str, path: &str) -> Result<String, CoFinderError> {
        let normalized = normalize_remote_path(path);
        let dest = if let Some(stripped) = normalized.strip_suffix(".tar.gz") {
            format!("{stripped}.untar.gz_dir")
        } else if let Some(stripped) = normalized.strip_suffix(".tgz") {
            format!("{stripped}.untar.gz_dir")
        } else if let Some(stripped) = normalized.strip_suffix(".gz") {
            stripped.to_string()
        } else {
            return Err(CoFinderError::new("REMOTE_DECOMPRESS_FAILED", "Selected item is not a supported compressed file."));
        };
        let cmd = if normalized.ends_with(".gz") && !normalized.ends_with(".tar.gz") && !normalized.ends_with(".tgz") {
            format!("gunzip -k {} 2>/dev/null", shell_single_quote(&normalized))
        } else {
            let outdir = format!("{dest}.cofinder");
            format!("mkdir -p {} && tar -xzf {} -C {} 2>/dev/null", shell_single_quote(&outdir), shell_single_quote(&normalized), shell_single_quote(&outdir))
        };
        let _ = self.exec_command(connection_id, &cmd).map_err(|e| CoFinderError::new("REMOTE_DECOMPRESS_FAILED", e.message))?;
        Ok(dest)
    }

    /// Compress a remote file (.gz) or directory (.tar.gz) via gzip/tar.
    pub fn remote_gzip(&self, connection_id: &str, path: &str, delete_source: bool) -> Result<String, CoFinderError> {
        let normalized = normalize_remote_path(path);
        let dest = format!("{normalized}.gz");
        let cmd = if normalized.ends_with(".tar.gz") {
            format!("tar -czf {} -C {} . 2>/dev/null", shell_single_quote(&dest), shell_single_quote(&normalized))
        } else {
            format!("gzip -c {} > {} 2>/dev/null", shell_single_quote(&normalized), shell_single_quote(&dest))
        };
        self.exec_command(connection_id, &cmd).map_err(|e| CoFinderError::new("REMOTE_GZIP_FAILED", e.message))?;
        if delete_source {
            let _ = self.exec_command(connection_id, &format!("rm -rf {}", shell_single_quote(&normalized)));
        }
        Ok(dest)
    }

    /// Remote copy/move with conflict policy.
    pub fn remote_copy(&self, connection_id: &str, source: &str, destination: &str, conflict_policy: &str, force_dir: bool) -> Result<String, CoFinderError> {
        let src = normalize_remote_path(source);
        let dest_input = normalize_remote_path(destination);
        let (dest_path, base) = if force_dir {
            let base = src.rsplit('/').next().unwrap_or(&src).to_string();
            let p = if dest_input == "/" { base.clone() } else { format!("{dest_input}/{base}") };
            (p.clone(), base)
        } else {
            (dest_input.clone(), src.rsplit('/').next().unwrap_or(&src).to_string())
        };
        let _ = base;
        if conflict_policy == "rename" {
            let final_path = self.next_copy_path(connection_id, &dest_path)?;
            let cmd = format!("cp -r {} {}", shell_single_quote(&src), shell_single_quote(&final_path));
            self.exec_command(connection_id, &cmd).map_err(|e| CoFinderError::new("REMOTE_COPY_FAILED", e.message))?;
            Ok(final_path)
        } else {
            // fail on existing
            if self.path_exists(connection_id, &dest_path)? {
                return Err(CoFinderError::new("REMOTE_COPY_FAILED", "Destination already exists."));
            }
            let cmd = format!("cp -r {} {}", shell_single_quote(&src), shell_single_quote(&dest_path));
            self.exec_command(connection_id, &cmd).map_err(|e| CoFinderError::new("REMOTE_COPY_FAILED", e.message))?;
            Ok(dest_path)
        }
    }

    pub fn remote_move(&self, connection_id: &str, source: &str, destination: &str, conflict_policy: &str, force_dir: bool) -> Result<String, CoFinderError> {
        let src = normalize_remote_path(source);
        let dest_input = normalize_remote_path(destination);
        let (dest_path, base) = if force_dir {
            let base = src.rsplit('/').next().unwrap_or(&src).to_string();
            let p = if dest_input == "/" { base.clone() } else { format!("{dest_input}/{base}") };
            (p.clone(), base)
        } else {
            (dest_input.clone(), src.rsplit('/').next().unwrap_or(&src).to_string())
        };
        let _ = base;
        if conflict_policy == "rename" {
            let final_path = self.next_copy_path(connection_id, &dest_path)?;
            let cmd = format!("mv {} {}", shell_single_quote(&src), shell_single_quote(&final_path));
            self.exec_command(connection_id, &cmd).map_err(|e| CoFinderError::new("REMOTE_MOVE_FAILED", e.message))?;
            Ok(final_path)
        } else {
            if self.path_exists(connection_id, &dest_path)? {
                return Err(CoFinderError::new("REMOTE_MOVE_FAILED", "Destination already exists."));
            }
            let cmd = format!("mv {} {}", shell_single_quote(&src), shell_single_quote(&dest_path));
            self.exec_command(connection_id, &cmd).map_err(|e| CoFinderError::new("REMOTE_MOVE_FAILED", e.message))?;
            Ok(dest_path)
        }
    }

    fn next_copy_path(&self, connection_id: &str, path: &str) -> Result<String, CoFinderError> {
        for i in 1..1000u32 {
            let candidate = if i == 1 {
                format!("{path}.copy")
            } else {
                format!("{path}.copy-{i}")
            };
            if !self.path_exists(connection_id, &candidate)? {
                return Ok(candidate);
            }
        }
        Err(CoFinderError::new("REMOTE_COPY_FAILED", "Could not find an available name."))
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

fn validate_remote_child_name(name: &str) -> Result<String, CoFinderError> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.chars().any(|c| matches!(c, '\u{0}' | '\r' | '\n'))
    {
        return Err(CoFinderError::new("REMOTE_INVALID_INPUT", "Name is invalid."));
    }
    Ok(trimmed.to_string())
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// `YYYY-MM-DDTHH:mm:ss` -> `YYYYMMDDHHmm.SS` touch stamp.
fn timestamp_to_touch_stamp(value: &str) -> Option<String> {
    let parts: Vec<&str> = value.split(['-', 'T', ':']).collect();
    if parts.len() != 6 {
        return None;
    }
    let y = parts[0].parse::<u32>().ok()?;
    let mo = parts[1].parse::<u32>().ok()?;
    let d = parts[2].parse::<u32>().ok()?;
    let h = parts[3].parse::<u32>().ok()?;
    let mi = parts[4].parse::<u32>().ok()?;
    let s = parts[5].parse::<u32>().ok()?;
    // Validate calendar date via chrono
    let date = chrono::NaiveDate::from_ymd_opt(y as i32, mo, d)?;
    let _ = date.and_hms_opt(h, mi, s)?;
    Some(format!("{y:04}{mo:02}{d:02}{h:02}{mi:02}.{s:02}"))
}

/// Parse a `path:line:preview` search result line.
fn parse_search_line(line: &str) -> Option<Value> {
    let (path, rest) = line.rsplit_once(':')?;
    let (path2, line_no) = path.rsplit_once(':')?;
    let line_num: u64 = line_no.parse().ok()?;
    Some(json!({ "path": path2, "line": line_num, "preview": rest }))
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

    /// Live SFTP test against EP9 via public-key auth (read-only).
    /// Run with: cargo test --lib -- remote_live -- --ignored --nocapture
    #[test]
    #[ignore = "requires live server and credentials"]
    fn remote_live_ep9_publickey_read() {
        let host = std::env::var("CF_TEST_HOST").unwrap_or("10.0.42.9".into());
        let user = std::env::var("CF_TEST_USER").unwrap_or("cygnus".into());
        let key = std::env::var("CF_TEST_KEY").unwrap_or("/Users/zwx/.ssh/codex_ep9_20260702_ed25519".into());
        let dir = std::env::var("CF_TEST_DIR").unwrap_or("/data/01.project".into());
        let svc = RemoteService::new();
        let res = svc.connect(&host, 22, &user, "", "privateKey", Some(&key)).expect("connect");
        let id = res["connectionId"].as_str().unwrap().to_string();
        assert_eq!(res["homePath"].as_str().unwrap(), "/home/cygnus");
        let listing = svc.list_directory(&id, &dir).expect("list");
        assert!(!listing["entries"].as_array().unwrap().is_empty());
        let info = svc.get_path_info(&id, &dir).expect("info");
        assert_eq!(info["type"], "directory");
        svc.disconnect(&id).unwrap();
    }

    /// Reproduce the pre-spawn_blocking hang: call block_on (as dispatch used
    /// to) from inside a tokio async context, and assert it does not deadlock.
    /// Run: cargo test --lib -- --ignored async_block_on_sftp_not_stuck --nocapture
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "requires live server and credentials"]
    async fn async_block_on_sftp_not_stuck() {
        let host = std::env::var("CF_TEST_HOST").unwrap_or("10.0.32.10".into());
        let user = std::env::var("CF_TEST_USER").unwrap_or("zhouwenxiong".into());
        let key = std::env::var("CF_TEST_KEY").unwrap_or("/Users/zwx/.ssh/id_ed25519".into());
        let started = std::time::Instant::now();
        let outcome = tokio::time::timeout(std::time::Duration::from_secs(30), async {
            // Building RemoteService initializes the global runtime. Calling
            // connect() uses block_on on it from inside this async context,
            // exactly as the old cofinder_call did before spawn_blocking.
            let svc = RemoteService::new();
            let res = svc.connect(&host, 22, &user, "", "privateKey", Some(&key));
            eprintln!("connect elapsed={:?} result_ok={}", started.elapsed(), res.is_ok());
            res.is_ok()
        })
        .await;
        assert!(outcome.is_ok(), "block_on SFTP inside async context deadlocked after {:?}", started.elapsed());
        assert!(outcome.unwrap_or(false), "SFTP connect failed");
    }

    /// Verify remote exec_command over a live connection (read-only `echo`).
    /// Run: cargo test --lib -- --ignored remote_live_exec_echo --nocapture
    #[test]
    #[ignore = "requires live server and credentials"]
    fn remote_live_exec_echo() {
        let host = std::env::var("CF_TEST_HOST").unwrap_or("10.0.32.10".into());
        let user = std::env::var("CF_TEST_USER").unwrap_or("zhouwenxiong".into());
        let key = std::env::var("CF_TEST_KEY").unwrap_or("/Users/zwx/.ssh/id_ed25519".into());
        let svc = RemoteService::new();
        let res = svc.connect(&host, 22, &user, "", "privateKey", Some(&key)).expect("connect");
        let id = res["connectionId"].as_str().unwrap().to_string();
        let out = svc.exec_command(&id, "echo hello-rust").expect("exec");
        assert!(out.contains("hello-rust"), "exec output was: {out}");
        svc.disconnect(&id).unwrap();
    }

    /// Verify remote searchText over a live connection (read-only).
    /// Run: cargo test --lib -- --ignored remote_live_search --nocapture
    #[test]
    #[ignore = "requires live server and credentials"]
    fn remote_live_search_and_window() {
        let host = std::env::var("CF_TEST_HOST").unwrap_or("10.0.32.10".into());
        let user = std::env::var("CF_TEST_USER").unwrap_or("zhouwenxiong".into());
        let key = std::env::var("CF_TEST_KEY").unwrap_or("/Users/zwx/.ssh/id_ed25519".into());
        let svc = RemoteService::new();
        let res = svc.connect(&host, 22, &user, "", "privateKey", Some(&key)).expect("connect");
        let id = res["connectionId"].as_str().unwrap().to_string();
        // Search a file we know exists
        let target = std::env::var("CF_TEST_SEARCH_FILE").unwrap_or("/home/zhouwenxiong/.bashrc".into());
        let search = svc.search_text(&id, &target, "bash", Some(50)).expect("search");
        assert!(search["query"] == "bash");
        assert!(!search["matches"].as_array().unwrap().is_empty(), "expected matches in {target}");
        // Read a line window from the same file
        let win = svc.read_text_window(&id, &target, 1, Some(2), Some(2)).expect("window");
        assert_eq!(win["targetLine"], 1);
        assert!(!win["content"].as_str().unwrap().is_empty());
        svc.disconnect(&id).unwrap();
    }
}

impl RemoteService {
    pub fn size_aborts_register(&self, job_id: &str, abort: Arc<std::sync::atomic::AtomicBool>) {
        size_aborts().lock().unwrap().insert(job_id.to_string(), abort);
    }

    pub fn size_aborts_remove(&self, job_id: &str) {
        size_aborts().lock().unwrap().remove(job_id);
    }

    pub fn size_aborts_cancel(&self, job_id: &str) {
        if let Some(flag) = size_aborts().lock().unwrap().get(job_id) {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }
}
