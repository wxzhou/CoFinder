//! Remote edit sessions — Rust port of `RemoteEditService.ts`.
//!
//! Downloads a remote file to a local cache copy, watches the local copy for
//! changes (polling stat, macOS-safe), syncs uploads back, detects remote
//! conflicts against a baseline, and pushes `remote:editUpdate` events.
//!
//! Unlike the TS original (fs.watch + debounce), we poll local stat every
//! `POLL_MS` and debounce by tracking last-local-mtime: only act when size or
//! mtime changed since the last sync point.

use crate::backend::error::CoFinderError;
use crate::backend::remote::RemoteService;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const TEXT_SNIFF_BYTES: usize = 8192;
const TEXT_OPEN_CONFIRM_BYTES: u64 = 5 * 1024 * 1024;
const DEFAULT_OPEN_CONFIRM_BYTES: u64 = 100 * 1024 * 1024;
const POLL_MS: u64 = 1200;

type SessionCallback = Box<dyn Fn(Value) + Send + Sync>;

#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub tab_id: String,
    pub connection_id: String,
    pub remote_path: String,
    pub local_path: String,
    pub baseline_size: u64,
    pub baseline_mtime: u64,
    pub last_local_size: u64,
    pub last_local_mtime_ms: u64,
    pub state: String, // clean | dirty | uploading | uploaded | failed | conflict
    pub error: String,
    pub updated_at: f64,
    pub conflict_remote_copy_path: Option<String>,
    pub last_uploaded_at: Option<f64>,
}

impl Session {
    fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "tabId": self.tab_id,
            "connectionId": self.connection_id,
            "remotePath": self.remote_path,
            "localPath": self.local_path,
            "baseline": { "size": self.baseline_size, "modifyTime": self.baseline_mtime },
            "lastLocalSize": self.last_local_size,
            "lastLocalMtimeMs": self.last_local_mtime_ms,
            "lastUploadedAt": self.last_uploaded_at,
            "conflictRemoteCopyPath": self.conflict_remote_copy_path,
            "state": self.state,
            "error": self.error,
            "updatedAt": self.updated_at
        })
    }
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

fn sha256_hex(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    let digest = h.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if matches!(c, '/' | '\\' | ':' | '\u{0}' | '\r' | '\n') { '_' } else { c }).collect();
    let mut out = cleaned;
    if out.len() > 160 {
        out = out[..160].to_string();
    }
    if out.is_empty() {
        out = "remote-file".to_string();
    }
    out
}

fn is_likely_text(sample: &[u8]) -> bool {
    if sample.is_empty() {
        return true;
    }
    let mut suspicious = 0usize;
    let mut high_bit = 0usize;
    for &byte in sample {
        if byte == 0 {
            return false;
        }
        if byte >= 0x80 {
            high_bit += 1;
        }
        let control = byte < 0x20 && byte != 0x09 && byte != 0x0a && byte != 0x0d && byte != 0x0c;
        if control {
            suspicious += 1;
        }
    }
    if suspicious as f64 / sample.len() as f64 >= 0.02 {
        return false;
    }
    if std::str::from_utf8(sample).is_ok() {
        return true;
    }
    high_bit == 0
}

fn sniff_image_mime_type(sample: &[u8]) -> Option<&'static str> {
    if sample.len() >= 8 && sample[0..8] == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] {
        return Some("image/png");
    }
    if sample.len() >= 3 && sample[0] == 0xff && sample[1] == 0xd8 && sample[2] == 0xff {
        return Some("image/jpeg");
    }
    if sample.len() >= 6 && (&sample[0..6] == b"GIF87a" || &sample[0..6] == b"GIF89a") {
        return Some("image/gif");
    }
    if sample.len() >= 12 && &sample[0..4] == b"RIFF" && &sample[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if sample.len() >= 4 && (&sample[0..4] == b"MM\x00*" || &sample[0..4] == b"II*\x00") {
        return Some("image/tiff");
    }
    None
}

fn sniff_preview_kind(sample: &[u8]) -> Option<&'static str> {
    if sniff_image_mime_type(sample).is_some() {
        return Some("image");
    }
    if is_likely_text(sample) {
        return Some("text");
    }
    None
}

fn is_source_like_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    const SOURCE_EXTS: [&str; 30] = [
        ".txt", ".md", ".c", ".cpp", ".h", ".hpp", ".rs", ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".toml", ".yaml", ".yml",
        ".sh", ".bash", ".zsh", ".css", ".html", ".xml", ".sql", ".conf", ".ini", ".cfg", ".log", ".rst", ".tex", ".go",
    ];
    SOURCE_EXTS.iter().any(|ext| lower.ends_with(ext))
}

struct Store {
    sessions: HashMap<String, Session>,
    stopped: bool,
}

pub struct RemoteEditService {
    store: Arc<Mutex<Store>>,
    on_session_change: Arc<Mutex<Option<SessionCallback>>>,
    remote: Arc<RemoteService>,
    cache_root: String,
}

impl RemoteEditService {
    pub fn new(remote: Arc<RemoteService>, cache_root: String) -> Self {
        Self {
            store: Arc::new(Mutex::new(Store { sessions: HashMap::new(), stopped: false })),
            on_session_change: Arc::new(Mutex::new(None)),
            remote,
            cache_root,
        }
    }

    pub fn set_on_session_change(&self, cb: SessionCallback) {
        *self.on_session_change.lock().unwrap() = Some(cb);
    }

    fn emit_session(&self, session: &Session) {
        let payload = json!({ "session": session.to_json() });
        if let Some(cb) = &*self.on_session_change.lock().unwrap() {
            cb(payload);
        }
    }

    fn session_key(tab_id: &str, connection_id: &str, remote_path: &str) -> String {
        format!("{tab_id}\u{0}{connection_id}\u{0}{remote_path}")
    }

    pub fn list(&self) -> Vec<Value> {
        let store = self.store.lock().unwrap();
        let mut sessions: Vec<Value> = store.sessions.values().map(|s| s.to_json()).collect();
        sessions.sort_by(|a, b| b.get("updatedAt").and_then(|v| v.as_f64()).unwrap_or(0.0).partial_cmp(&a.get("updatedAt").and_then(|v| v.as_f64()).unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal));
        sessions
    }

    fn cache_dir_for_tab(&self, tab_id: &str) -> std::path::PathBuf {
        let dir = std::path::Path::new(&self.cache_root).join("remote-edit").join(&sha256_hex(tab_id)[..12.min(sha256_hex(tab_id).len())]);
        std::fs::create_dir_all(&dir).ok();
        dir
    }

    fn allocate_local_path(&self, tab_id: &str, remote_path: &str) -> String {
        let base = remote_path.rsplit('/').next().filter(|s| !s.is_empty()).unwrap_or("remote-file.txt");
        let sanitized = sanitize_file_name(base);
        let name = format!("{}-{}-{}", &sha256_hex(remote_path)[..16.min(sha256_hex(remote_path).len())], &new_uuid_short(), sanitized);
        self.cache_dir_for_tab(tab_id).join(name).to_string_lossy().into_owned()
    }

    pub fn open(&self, tab_id: &str, connection_id: &str, remote_path: &str, opener: &str, text_editor: Option<&str>, allow_binary_text: bool, allow_large_file: bool, allow_executable: bool) -> Result<Value, CoFinderError> {
        let remote_stat = self.remote.get_path_info(connection_id, remote_path)?;
        let etype = remote_stat.get("type").and_then(|v| v.as_str()).unwrap_or("file");
        if etype != "file" {
            return Err(CoFinderError::new("REMOTE_PREVIEW_UNSUPPORTED", "Remote edit supports files only."));
        }
        let size = remote_stat.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
        let mtime_ms = remote_stat.get("mtime").and_then(|v| v.as_str()).and_then(parse_iso_ms).unwrap_or(0);
        let mode = remote_stat.get("permissions").and_then(|v| v.as_str()).map(perms_to_mode).unwrap_or(0);

        // Resolve opener for source-like paths
        let opener = if opener == "default" && is_source_like_path(remote_path) { "text" } else { opener };

        // Large-file / executable guards
        let confirm_bytes = if opener == "text" { TEXT_OPEN_CONFIRM_BYTES } else { DEFAULT_OPEN_CONFIRM_BYTES };
        if size > confirm_bytes && !allow_large_file {
            let mb = confirm_bytes / (1024 * 1024);
            return Err(CoFinderError::new("REMOTE_PREVIEW_UNSUPPORTED", format!("This remote file is larger than the {} MB preview limit.", mb)));
        }
        if opener == "default" && mode & 0o111 != 0 && !allow_executable {
            return Err(CoFinderError::new("REMOTE_PREVIEW_UNSUPPORTED", "Remote edit refuses to open an executable file with the default app."));
        }

        let key = Self::session_key(tab_id, connection_id, remote_path);
        {
            let store = self.store.lock().unwrap();
            if let Some(existing) = store.sessions.get(&key) {
                // Re-open existing local copy (no re-download)
                let session = existing.clone();
                drop(store);
                if let Some(editor) = text_editor {
                    let _ = opener_for_open(editor, &session.local_path);
                }
                return Ok(session.to_json());
            }
        }

        // Allocate local copy + download
        let local_path = self.allocate_local_path(tab_id, remote_path);
        self.remote.download_path_to_local(connection_id, remote_path, &local_path)
            .map_err(|e| CoFinderError::new("REMOTE_PREVIEW_FAILED", format!("Failed to download remote file: {}", e.message)))?;

        // Sniff text for text opener
        if opener == "text" {
            let sample = std::fs::read(&local_path).unwrap_or_default();
            let sniff = sample.get(..TEXT_SNIFF_BYTES.min(sample.len())).unwrap_or(&sample[..0.min(sample.len())]);
            if sniff_preview_kind(sniff) != Some("text") && !allow_binary_text {
                std::fs::remove_file(&local_path).ok();
                return Err(CoFinderError::new("REMOTE_PREVIEW_UNSUPPORTED", "Remote edit supports sniffed text files only."));
            }
        }

        let _ = std::fs::set_permissions(&local_path, std::os::unix::fs::PermissionsExt::from_mode(0o644));
        let local_meta = std::fs::metadata(&local_path);
        let (last_size, last_mtime_ms) = match local_meta {
            Ok(m) => (m.len(), m.modified().map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)).unwrap_or(0)),
            Err(_) => (0, 0),
        };

        let session = Session {
            id: new_uuid_full(),
            tab_id: tab_id.to_string(),
            connection_id: connection_id.to_string(),
            remote_path: remote_path.to_string(),
            local_path,
            baseline_size: size,
            baseline_mtime: mtime_ms,
            last_local_size: last_size,
            last_local_mtime_ms: last_mtime_ms,
            state: "clean".to_string(),
            error: String::new(),
            updated_at: now_ms(),
            conflict_remote_copy_path: None,
            last_uploaded_at: None,
        };
        {
            let mut store = self.store.lock().unwrap();
            store.sessions.insert(key, session.clone());
        }
        self.emit_session(&session);
        // Open the local copy in the default editor
        if let Some(editor) = text_editor {
            let _ = opener_for_open(editor, &session.local_path);
        }
        self.spawn_poller(session.id.clone());
        Ok(session.to_json())
    }

    pub fn sync_now(&self, session_id: &str) -> Result<Value, CoFinderError> {
        let mut store = self.store.lock().unwrap();
        let mut session = store.sessions.get(session_id).cloned().ok_or_else(|| CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))?;
        if !matches!(session.state.as_str(), "dirty" | "failed" | "conflict") {
            let local = std::fs::metadata(&session.local_path);
            let unchanged = match local {
                Ok(m) => {
                    let sz = m.len();
                    let mtime = m.modified().map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)).unwrap_or(0);
                    sz == session.last_local_size && mtime == session.last_local_mtime_ms
                }
                Err(_) => true,
            };
            if unchanged {
                return Ok(session.to_json());
            }
        }
        // Local file missing?
        if !std::path::Path::new(&session.local_path).exists() {
            return Err(CoFinderError::new("REMOTE_NOT_FOUND", "Local edit copy was deleted."));
        }
        // Re-stat remote for conflict detection
        let remote_stat = self.remote.get_path_info(&session.connection_id, &session.remote_path)?;
        let remote_size = remote_stat.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
        let remote_mtime = remote_stat.get("mtime").and_then(|v| v.as_str()).and_then(parse_iso_ms).unwrap_or(0);
        if session.baseline_size != remote_size || session.baseline_mtime != remote_mtime {
            session.state = "conflict".to_string();
            session.error = "Remote file changed after this edit session started. Local edits were not uploaded.".to_string();
            session.updated_at = now_ms();
            let out = session.to_json();
            store.sessions.insert(session_id.to_string(), session);
            drop(store);
            self.emit_update_for(session_id);
            return Ok(out);
        }
        // Upload
        session.state = "uploading".to_string();
        session.updated_at = now_ms();
        store.sessions.insert(session_id.to_string(), session.clone());
        drop(store);
        let upload_result = self.remote.upload_path_to_remote(&session.connection_id, &session.local_path, &session.remote_path);
        let mut store = self.store.lock().unwrap();
        let mut session = store.sessions.get(session_id).cloned().ok_or_else(|| CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))?;
        match upload_result {
            Ok(()) => {
                let post = self.remote.get_path_info(&session.connection_id, &session.remote_path).unwrap_or_else(|_| {
                    let l = std::fs::metadata(&session.local_path).map(|m| m.len()).unwrap_or(0);
                    json!({ "size": l, "mtime": iso_from_ms(now_ms() as u64) })
                });
                session.baseline_size = post.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                session.baseline_mtime = post.get("mtime").and_then(|v| v.as_str()).and_then(parse_iso_ms).unwrap_or(0);
                let local_meta = std::fs::metadata(&session.local_path);
                session.last_local_size = local_meta.as_ref().map(|m| m.len()).unwrap_or(0);
                session.last_local_mtime_ms = local_meta.as_ref().map(|m| m.modified().map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)).unwrap_or(0)).unwrap_or(0);
                session.state = "uploaded".to_string();
                session.error = String::new();
                session.last_uploaded_at = Some(now_ms());
                session.updated_at = now_ms();
                let out = session.to_json();
                store.sessions.insert(session_id.to_string(), session.clone());
                drop(store);
                self.emit_update_for(session_id);
                Ok(out)
            }
            Err(e) => {
                session.state = "failed".to_string();
                session.error = e.message;
                session.updated_at = now_ms();
                let out = session.to_json();
                store.sessions.insert(session_id.to_string(), session.clone());
                drop(store);
                self.emit_update_for(session_id);
                Ok(out)
            }
        }
    }

    pub fn redownload(&self, session_id: &str) -> Result<Value, CoFinderError> {
        let mut store = self.store.lock().unwrap();
        let mut session = store.sessions.get_mut(session_id).cloned().ok_or_else(|| CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))?;
        self.remote.download_path_to_local(&session.connection_id, &session.remote_path, &session.local_path)
            .map_err(|e| CoFinderError::new("REMOTE_PREVIEW_FAILED", format!("Failed to redownload remote file: {}", e.message)))?;
        let remote_stat = self.remote.get_path_info(&session.connection_id, &session.remote_path).unwrap_or(json!({}));
        let local_meta = std::fs::metadata(&session.local_path);
        let mut session = session;
        session.baseline_size = remote_stat.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
        session.baseline_mtime = remote_stat.get("mtime").and_then(|v| v.as_str()).and_then(parse_iso_ms).unwrap_or(0);
        session.last_local_size = local_meta.as_ref().map(|m| m.len()).unwrap_or(0);
        session.last_local_mtime_ms = local_meta.as_ref().map(|m| m.modified().map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)).unwrap_or(0)).unwrap_or(0);
        session.state = "clean".to_string();
        session.error = String::new();
        session.updated_at = now_ms();
        let out = session.to_json();
        store.sessions.insert(session_id.to_string(), session.clone());
        drop(store);
        self.emit_update_for(session_id);
        Ok(out)
    }

    pub fn force_upload(&self, session_id: &str) -> Result<Value, CoFinderError> {
        let mut store = self.store.lock().unwrap();
        let session = store.sessions.get(session_id).cloned().ok_or_else(|| CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))?;
        if !std::path::Path::new(&session.local_path).exists() {
            return Err(CoFinderError::new("REMOTE_NOT_FOUND", "Local edit copy was deleted."));
        }
        store.sessions.insert(session_id.to_string(), Session { state: "uploading".to_string(), updated_at: now_ms(), ..session.clone() });
        drop(store);
        let result = self.remote.upload_path_to_remote(&session.connection_id, &session.local_path, &session.remote_path);
        let mut store = self.store.lock().unwrap();
        let mut session = store.sessions.get(session_id).cloned().ok_or_else(|| CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))?;
        match result {
            Ok(()) => {
                let post = self.remote.get_path_info(&session.connection_id, &session.remote_path).unwrap_or(json!({}));
                session.baseline_size = post.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                session.baseline_mtime = post.get("mtime").and_then(|v| v.as_str()).and_then(parse_iso_ms).unwrap_or(0);
                session.state = "uploaded".to_string();
                session.error = String::new();
                session.last_uploaded_at = Some(now_ms());
                session.updated_at = now_ms();
                let out = session.to_json();
                store.sessions.insert(session_id.to_string(), session.clone());
                drop(store);
                self.emit_update_for(session_id);
                Ok(out)
            }
            Err(e) => {
                session.state = "failed".to_string();
                session.error = e.message;
                session.updated_at = now_ms();
                let out = session.to_json();
                store.sessions.insert(session_id.to_string(), session.clone());
                drop(store);
                self.emit_update_for(session_id);
                Ok(out)
            }
        }
    }

    pub fn download_conflict_copy(&self, session_id: &str) -> Result<(Value, String), CoFinderError> {
        let mut store = self.store.lock().unwrap();
        let mut session = store.sessions.get(session_id).cloned().ok_or_else(|| CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))?;
        let parsed = std::path::Path::new(&session.local_path);
        let name = parsed.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "remote".to_string());
        let ext = parsed.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_else(|| ".txt".to_string());
        let copy_path = parsed.with_file_name(format!("{name}.remote-{}{ext}", now_ms() as u64)).to_string_lossy().into_owned();
        self.remote.download_path_to_local(&session.connection_id, &session.remote_path, &copy_path)
            .map_err(|e| CoFinderError::new("REMOTE_PREVIEW_FAILED", format!("Failed to download conflict copy: {}", e.message)))?;
        let _ = std::fs::set_permissions(&copy_path, std::os::unix::fs::PermissionsExt::from_mode(0o644));
        session.conflict_remote_copy_path = Some(copy_path.clone());
        session.updated_at = now_ms();
        let out = session.to_json();
        store.sessions.insert(session_id.to_string(), session.clone());
        drop(store);
        self.emit_update_for(session_id);
        Ok((out, copy_path))
    }

    pub fn close(&self, session_id: &str, discard_local: bool) -> Result<(), CoFinderError> {
        let mut store = self.store.lock().unwrap();
        let removed = store.sessions.remove(session_id);
        if let Some(s) = removed {
            if discard_local {
                std::fs::remove_file(&s.local_path).ok();
            }
            Ok(())
        } else {
            Err(CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))
        }
    }

    fn emit_update_for(&self, session_id: &str) {
        let store = self.store.lock().unwrap();
        if let Some(s) = store.sessions.get(session_id) {
            self.emit_session(s);
        }
    }

    /// Background poller: watches the local copy for changes and syncs when
    /// size or mtime changes since the last sync point. One thread per
    /// session; it stops itself once the session is closed.
    fn spawn_poller(&self, session_id: String) {
        let store = Arc::clone(&self.store);
        let remote = Arc::clone(&self.remote);
        let on_change = Arc::clone(&self.on_session_change);
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
                let snapshot = {
                    let st = store.lock().unwrap();
                    match st.sessions.get(&session_id) {
                        Some(s) => Some(s.clone()),
                        None => None,
                    }
                };
                let Some(session) = snapshot else { return; };
                let local_path = session.local_path.clone();
                let connection_id = session.connection_id.clone();
                let remote_path = session.remote_path.clone();
                let last_size = session.last_local_size;
                let last_mtime = session.last_local_mtime_ms;
                let local_meta = std::fs::metadata(&local_path);
                let Ok(meta) = local_meta else { continue; };
                let sz = meta.len();
                let mtime = meta.modified().map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)).unwrap_or(0);
                if sz == last_size && mtime == last_mtime {
                    continue;
                }
                // Local changed -> mark dirty + sync
                let mut dirty = false;
                {
                    let mut st = store.lock().unwrap();
                    if let Some(s) = st.sessions.get_mut(&session_id) {
                        s.last_local_size = sz;
                        s.last_local_mtime_ms = mtime;
                        s.state = "dirty".to_string();
                        s.updated_at = now_ms();
                        dirty = true;
                    }
                }
                if dirty {
                    if let Some(cb) = &*on_change.lock().unwrap() {
                        if let Some(s) = store.lock().unwrap().sessions.get(&session_id) {
                            cb(json!({ "session": s.to_json() }));
                        }
                    }
                    // Attempt sync (no conflict re-check needed beyond baseline)
                    let remote_stat = remote.get_path_info(&connection_id, &remote_path);
                    if let Ok(stat) = remote_stat {
                        let rsize = stat.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                        let rmtime = stat.get("mtime").and_then(|v| v.as_str()).and_then(parse_iso_ms).unwrap_or(0);
                        let base = { let st = store.lock().unwrap(); let s = st.sessions.get(&session_id).unwrap(); (s.baseline_size, s.baseline_mtime) };
                        if base.0 != rsize || base.1 != rmtime {
                            let mut st = store.lock().unwrap();
                            if let Some(s) = st.sessions.get_mut(&session_id) {
                                s.state = "conflict".to_string();
                                s.error = "Remote file changed after this edit session started. Local edits were not uploaded.".to_string();
                                s.updated_at = now_ms();
                            }
                            drop(st);
                            if let Some(cb) = &*on_change.lock().unwrap() {
                                if let Some(s) = store.lock().unwrap().sessions.get(&session_id) {
                                    cb(json!({ "session": s.to_json() }));
                                }
                            }
                            continue;
                        }
                    }
                    let up = remote.upload_path_to_remote(&connection_id, &local_path, &remote_path);
                    let mut st = store.lock().unwrap();
                    if let Some(s) = st.sessions.get_mut(&session_id) {
                        match up {
                            Ok(()) => {
                                if let Ok(post) = remote.get_path_info(&connection_id, &remote_path) {
                                    s.baseline_size = post.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                                    s.baseline_mtime = post.get("mtime").and_then(|v| v.as_str()).and_then(parse_iso_ms).unwrap_or(0);
                                }
                                s.state = "uploaded".to_string();
                                s.error = String::new();
                                s.last_uploaded_at = Some(now_ms());
                            }
                            Err(e) => {
                                s.state = "failed".to_string();
                                s.error = e.message;
                            }
                        }
                        s.updated_at = now_ms();
                    }
                    drop(st);
                    if let Some(cb) = &*on_change.lock().unwrap() {
                        if let Some(s) = store.lock().unwrap().sessions.get(&session_id) {
                            cb(json!({ "session": s.to_json() }));
                        }
                    }
                }
            }
        });
    }
}

fn new_uuid_short() -> String {
    uuid::Uuid::new_v4().to_string()[..8].to_string()
}

fn new_uuid_full() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn parse_iso_ms(iso: &str) -> Option<u64> {
    // ISO-8601 like "2026-08-06T10:00:00.000Z" or local. Parse to epoch ms.
    let t = iso.replace('Z', "");
    let parts: Vec<&str> = t.split(['-', 'T', ':', '.']).collect();
    if parts.len() < 6 {
        return None;
    }
    let y: i32 = parts[0].parse().ok()?;
    let mo: u32 = parts[1].parse().ok()?;
    let d: u32 = parts[2].parse().ok()?;
    let h: u32 = parts[3].parse().ok()?;
    let mi: u32 = parts[4].parse().ok()?;
    let s: u32 = parts[5].parse().ok()?;
    let ms: u32 = parts.get(6).and_then(|v| v.parse().ok()).unwrap_or(0);
    let dt = chrono::NaiveDate::from_ymd_opt(y, mo, d)?.and_hms_milli_opt(h, mi, s, ms)?;
    Some(dt.and_utc().timestamp_millis() as u64)
}

fn iso_from_ms(ms: u64) -> String {
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms as i64).unwrap_or(chrono::Utc::now());
    dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn perms_to_mode(rwx: &str) -> u32 {
    let mut mode = 0u32;
    for (i, ch) in rwx.chars().enumerate() {
        let bit = 1 << (8 - i);
        if ch != '-' {
            mode |= bit;
        }
    }
    mode
}

fn opener_for_open(editor: &str, local_path: &str) -> Result<(), String> {
    let args = if editor == "default" || editor.is_empty() {
        vec![local_path.to_string()]
    } else if editor == "TextEdit" || editor == "textedit" {
        vec!["-t".to_string(), local_path.to_string()]
    } else {
        vec!["-a".to_string(), editor.to_string(), local_path.to_string()]
    };
    let status = std::process::Command::new("open").args(&args).status().map_err(|e| format!("Failed to open editor: {e}"))?;
    if status.success() { Ok(()) } else { Err(format!("Failed to open editor (exit {status:?}).")) }
}

impl RemoteEditService {
    /// Return a session (for read-only handlers that need localPath/etc).
    pub fn find_session(&self, session_id: &str) -> Result<Session, CoFinderError> {
        let store = self.store.lock().unwrap();
        store.sessions.get(session_id).cloned().ok_or_else(|| CoFinderError::new("REMOTE_NOT_FOUND", "Edit session not found."))
    }
}

/// Public wrappers for the sniff helpers (used by `remote::read_preview`).
pub fn sniff_preview_kind_pub(sample: &[u8]) -> Option<&'static str> {
    sniff_preview_kind(sample)
}

pub fn sniff_image_mime_type_pub(sample: &[u8]) -> Option<&'static str> {
    sniff_image_mime_type(sample)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sniff_png_image() {
        let sample = [0x89u8, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
        assert_eq!(sniff_preview_kind(&sample), Some("image"));
        assert_eq!(sniff_image_mime_type(&sample), Some("image/png"));
    }

    #[test]
    fn sniff_jpeg_image() {
        let sample = [0xffu8, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
        assert_eq!(sniff_image_mime_type(&sample), Some("image/jpeg"));
    }

    #[test]
    fn sniff_plain_text() {
        let sample = b"hello world, plain text content\nsecond line";
        assert_eq!(sniff_preview_kind(sample), Some("text"));
    }

    #[test]
    fn sniff_binary_not_text() {
        let sample = [0x01u8, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x00, 0x01];
        assert_ne!(sniff_preview_kind(&sample), Some("text"));
    }

    #[test]
    fn parse_iso_to_ms() {
        let ms = parse_iso_ms("2026-08-06T10:00:00.000Z").unwrap();
        assert_eq!(ms, 1786010400000);
        assert!(parse_iso_ms("not a date").is_none());
    }

    #[test]
    fn sanitize_filename() {
        assert_eq!(sanitize_file_name("a/b\\c:d"), "a_b_c_d");
        assert_eq!(sanitize_file_name(""), "remote-file");
        assert_eq!(sanitize_file_name("x"), "x");
    }

    #[test]
    fn source_like_path_detection() {
        assert!(is_source_like_path("/data/x/readme.md"));
        assert!(is_source_like_path("/data/x/main.rs"));
        assert!(!is_source_like_path("/data/x/photo.jpeg"));
        assert!(!is_source_like_path("/data/x/noext"));
    }

    #[test]
    fn session_json_shape() {
        let s = Session {
            id: "id1".into(),
            tab_id: "t1".into(),
            connection_id: "c1".into(),
            remote_path: "/data/x.txt".into(),
            local_path: "/tmp/x.txt".into(),
            baseline_size: 10,
            baseline_mtime: 100,
            last_local_size: 10,
            last_local_mtime_ms: 100,
            state: "clean".into(),
            error: String::new(),
            updated_at: 1.0,
            conflict_remote_copy_path: None,
            last_uploaded_at: None,
        };
        let j = s.to_json();
        assert_eq!(j["state"], "clean");
        assert_eq!(j["remotePath"], "/data/x.txt");
        assert_eq!(j["baseline"]["size"], 10);
    }

    #[test]
    fn perms_mode_conversion() {
        assert_eq!(perms_to_mode("rwxr-xr-x"), 0o755);
        assert_eq!(perms_to_mode("rw-------"), 0o600);
    }
}
