//! Transfer queue — Rust port of `TransferQueueService.ts`.
//!
//! Manages upload/download/delete/compress/md5/remote-copy-move jobs with
//! lane-based concurrency, path locks, rsync fast path with SFTP fallback,
//! progress/status, cancel/stop/retry, and `transfer:onUpdate` push events.

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::backend::error::CoFinderError;
use crate::backend::remote::RemoteService;

const TRANSFER_LANE: &str = "transfer";
const DELETE_LANE: &str = "delete";
const COMPRESSION_LANE: &str = "compression";
const MUTATION_LANE: &str = "remoteMutation";

type UpdateCallback = Box<dyn Fn(Vec<Value>) + Send + Sync>;

/// A path lock entry for lane/path conflict detection.
#[derive(Debug, Clone)]
struct PathLock {
    pane: String,
    connection_id: Option<String>,
    path: String,
    mode: String, // "read" | "write" | "delete"
}

#[derive(Debug, Clone)]
struct RunningContext {
    task_id: String,
    lane: String,
    locks: Vec<PathLock>,
    child_pid: Arc<Mutex<Option<u32>>>,
}

struct Store {
    tasks: Vec<Value>,
    running: HashMap<String, RunningContext>,
    pump_in_flight: bool,
    compression_concurrency: usize,
    stopping: Arc<AtomicBool>,
}

pub struct TransferQueue {
    store: Mutex<Store>,
    on_update: Mutex<Option<UpdateCallback>>,
    remote: Arc<RemoteService>,
}

fn now_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn is_safe_host_or_username(input: &str) -> bool {
    !input.is_empty() && input.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn normalize_remote_path_for_lock(input: &str) -> String {
    let t = input.trim();
    if t.is_empty() || t == "." {
        return "/".to_string();
    }
    if t.starts_with('/') {
        t.to_string()
    } else {
        format!("/{t}")
    }
}

fn validate_rsync_path(input: &str) -> Result<String, CoFinderError> {
    let t = input.trim();
    if t.is_empty() || t.contains('\u{0}') || t.contains('\n') || t.contains('\r') {
        return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Invalid path for transfer."));
    }
    if t.contains(['`', '$', '"', '\\', ';', '|', '&', '<', '>']) {
        return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Path contains unsupported characters for rsync transfer in this version."));
    }
    Ok(t.to_string())
}

fn build_ssh_spec(port: u16) -> String {
    format!("ssh -p {port} -o BatchMode=yes")
}

fn build_rsync_remote_spec(username: &str, host: &str, remote_path: &str) -> Result<String, CoFinderError> {
    if !is_safe_host_or_username(username) || !is_safe_host_or_username(host) {
        return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Invalid username or host for rsync transfer."));
    }
    Ok(format!("{username}@{host}:{remote_path}"))
}

fn lane_for_task(task: &Value) -> String {
    match task.get("kind").and_then(|v| v.as_str()) {
        Some("delete") => DELETE_LANE.to_string(),
        Some("gzip") | Some("decompress") | Some("md5") => COMPRESSION_LANE.to_string(),
        Some("remoteCopy") | Some("remoteMove") => MUTATION_LANE.to_string(),
        _ => TRANSFER_LANE.to_string(),
    }
}

fn concurrency_for_lane(store: &Store, lane: &str) -> usize {
    if lane == COMPRESSION_LANE {
        store.compression_concurrency
    } else {
        1
    }
}

fn normalize_lock_path(pane: &str, p: &str) -> String {
    let t = p.trim();
    if pane == "remote" {
        let n = normalize_remote_path_for_lock(t);
        if n != "/" && n.ends_with('/') {
            n[..n.len() - 1].to_string()
        } else {
            n
        }
    } else if t.is_empty() {
        "/".to_string()
    } else {
        crate::backend::util::normalize_local_path(t)
    }
}

fn locks_conflict(a: &PathLock, b: &PathLock) -> bool {
    if a.pane != b.pane {
        return false;
    }
    if a.pane == "remote" && a.connection_id != b.connection_id {
        return false;
    }
    let overlap = a.path == b.path || a.path.starts_with(&format!("{}/", b.path)) || b.path.starts_with(&format!("{}/", a.path));
    if !overlap {
        return false;
    }
    if a.mode == "read" && b.mode == "read" {
        return false;
    }
    true
}

fn has_running_path_conflict(store: &Store, candidate: &[PathLock]) -> bool {
    if candidate.is_empty() {
        return false;
    }
    for ctx in store.running.values() {
        for cl in &ctx.locks {
            for cand in candidate {
                if locks_conflict(cl, cand) {
                    return true;
                }
            }
        }
    }
    false
}

fn operation_lock_key(kind: &str, pane: &str, connection_id: &str, paths: &[String]) -> String {
    let mut sorted = paths.to_vec();
    sorted.sort();
    format!("{kind}\u{0}{pane}\u{0}{connection_id}\u{0}{}", sorted.join("\u{0}"))
}

impl TransferQueue {
    pub fn new(remote: Arc<RemoteService>) -> Self {
        Self {
            store: Mutex::new(Store {
                tasks: Vec::new(),
                running: HashMap::new(),
                pump_in_flight: false,
                compression_concurrency: 2,
                stopping: Arc::new(AtomicBool::new(false)),
            }),
            on_update: Mutex::new(None),
            remote,
        }
    }

    pub fn set_on_update(&self, cb: UpdateCallback) {
        *self.on_update.lock().unwrap() = Some(cb);
    }

    pub fn configure(&self, compression_concurrency: usize) {
        let cc = compression_concurrency.clamp(1, 4);
        self.store.lock().unwrap().compression_concurrency = cc;
    }

    fn snapshot(&self) -> Vec<Value> {
        self.store.lock().unwrap().tasks.clone()
    }

    fn emit(&self) {
        let snapshot = self.snapshot();
        if let Some(cb) = &*self.on_update.lock().unwrap() {
            cb(snapshot);
        }
    }

    fn make_task(&self, mut input: Value) -> Value {
        let id = new_uuid();
        let obj = input.as_object_mut().unwrap();
        obj.insert("id".into(), json!(id));
        obj.insert("status".into(), json!("pending"));
        obj.insert("rawLog".into(), json!([]));
        obj.insert("createdAt".into(), json!(now_ms()));
        input
    }

    fn push_tasks(&self, tasks: Vec<Value>) -> Vec<String> {
        let mut store = self.store.lock().unwrap();
        let ids: Vec<String> = tasks.iter().filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())).collect();
        store.tasks.extend(tasks);
        drop(store);
        self.emit();
        ids
    }

    pub fn list(&self) -> Vec<Value> {
        self.snapshot()
    }

    fn find_task_index(&self, id: &str) -> Option<usize> {
        let store = self.store.lock().unwrap();
        store.tasks.iter().position(|t| t.get("id").and_then(|v| v.as_str()) == Some(id))
    }

    fn set_task_status(&self, id: &str, status: &str, patch: Value) -> bool {
        let mut store = self.store.lock().unwrap();
        if let Some(idx) = store.tasks.iter().position(|t| t.get("id").and_then(|v| v.as_str()) == Some(id)) {
            let t = &mut store.tasks[idx];
            t["status"] = json!(status);
            if let Value::Object(pm) = patch {
                for (k, v) in pm {
                    t[k] = v;
                }
            }
            true
        } else {
            false
        }
    }

    pub fn cancel(&self, task_id: &str) -> Result<(), CoFinderError> {
        let status = {
            let store = self.store.lock().unwrap();
            store.tasks.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)).map(|t| t["status"].as_str().unwrap_or("").to_string())
        };
        match status {
            Some(s) if s == "pending" => {}
            Some(_) => return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Only pending task can be canceled.")),
            None => return Err(CoFinderError::new("TRANSFER_NOT_FOUND", "Task not found.")),
        }
        self.set_task_status(task_id, "canceled", json!({ "finishedAt": now_ms(), "rawLog": ["Task canceled before execution."] }));
        self.emit();
        Ok(())
    }

    pub fn stop(&self, task_id: &str) -> Result<(), CoFinderError> {
        let mut store = self.store.lock().unwrap();
        let running = store.running.get(task_id).cloned();
        let is_running = store.tasks.iter().any(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id) && t.get("status").and_then(|v| v.as_str()) == Some("running"));
        if let Some(ctx) = running {
            if !is_running {
                return Err(CoFinderError::new("TRANSFER_NOT_RUNNING", "Task is not running."));
            }
            let pid = ctx.child_pid.lock().unwrap().take();
            drop(store);
            if let Some(pid) = pid {
                let _ = std::process::Command::new("kill").args(["-TERM", &pid.to_string()]).status();
                Ok(())
            } else {
                Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "This running job cannot be stopped."))
            }
        } else {
            Err(CoFinderError::new("TRANSFER_NOT_RUNNING", "Task is not running."))
        }
    }

    pub fn retry(&self, task_id: &str) -> Result<(), CoFinderError> {
        let status = {
            let store = self.store.lock().unwrap();
            store.tasks.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)).map(|t| t["status"].as_str().unwrap_or("").to_string())
        };
        match status {
            Some(s) if s == "failed" => {}
            _ => return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Only failed tasks can be retried.")),
        }
        self.reset_for_retry(task_id);
        self.emit();
        Ok(())
    }

    pub fn retry_failed(&self) -> usize {
        let ids: Vec<String> = {
            let store = self.store.lock().unwrap();
            store.tasks.iter().filter(|t| t.get("status").and_then(|v| v.as_str()) == Some("failed")).filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())).collect()
        };
        for id in &ids {
            self.reset_for_retry(id);
        }
        if !ids.is_empty() {
            self.emit();
        }
        ids.len()
    }

    fn reset_for_retry(&self, id: &str) {
        self.set_task_status(id, "pending", json!({
            "startedAt": Value::Null, "finishedAt": Value::Null,
            "error": Value::Null, "errorCode": Value::Null,
            "percent": Value::Null, "speed": Value::Null, "eta": Value::Null,
            "currentFile": Value::Null, "progressText": Value::Null,
            "rawLog": [],
            "itemEntries": [], "itemDoneCount": 0
        }));
    }

    pub fn clear_completed(&self) -> usize {
        let mut store = self.store.lock().unwrap();
        let before = store.tasks.len();
        store.tasks.retain(|t| matches!(t.get("status").and_then(|v| v.as_str()), Some("running" | "pending" | "checking" | "conflict")));
        let after = store.tasks.len();
        let cleared = before - after;
        drop(store);
        if cleared > 0 {
            self.emit();
        }
        cleared
    }

    pub fn fail_remote_connection_tasks(&self, connection_id: &str) {
        let ids: Vec<String> = {
            let mut store = self.store.lock().unwrap();
            let mut ids = Vec::new();
            for t in store.tasks.iter_mut() {
                let has_conn = t.get("connectionId").and_then(|v| v.as_str()) == Some(connection_id);
                let status = t.get("status").and_then(|v| v.as_str());
                if has_conn && matches!(status, Some("pending" | "running")) {
                    t["status"] = json!("failed");
                    t["error"] = json!("Remote connection has been disconnected.");
                    t["errorCode"] = json!("remote_disconnected");
                    t["finishedAt"] = json!(now_ms());
                    ids.push(t.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string());
                }
            }
            for id in &ids {
                store.running.remove(id);
            }
            ids
        };
        if !ids.is_empty() {
            self.emit();
        }
    }
}

// ---------------------------------------------------------------------------
// Enqueue methods
// ---------------------------------------------------------------------------
impl TransferQueue {
    pub fn enqueue_upload(&self, req: &Value) -> Result<Vec<String>, CoFinderError> {
        let tab_id = required_str(req, "tabId", "tabId")?.to_string();
        let host = required_host(req, "host")?.to_string();
        let port = required_port(req, "port")?;
        let username = required_username(req, "username")?.to_string();
        let profile_id = optional_str(req, "profileId").map(|s| s.to_string());
        let connection_id = optional_str(req, "connectionId").map(|s| s.to_string());
        let preserve = req.get("preserveTimestamps").and_then(|v| v.as_bool()).unwrap_or(true);
        let remote_dest_dir = validate_rsync_path(optional_str(req, "remoteDestinationDir").unwrap_or("/"))?;
        let overrides = string_map(req.get("remoteTargetOverrides"));

        let sources: Vec<String> = match req.get("localSources") {
            Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str()).map(|s| crate::backend::util::normalize_local_path(s)).collect(),
            _ => Vec::new(),
        };
        if sources.is_empty() {
            return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Select at least one local file to upload."));
        }

        let mut tasks = Vec::new();
        for source in &sources {
            if !std::path::Path::new(source).exists() {
                return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", format!("Path not found: {source}")));
            }
            let source_name = std::path::Path::new(source).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let is_dir = std::path::Path::new(source).is_dir();
            let destination_path = overrides.get(source).cloned().unwrap_or_else(|| {
                if remote_dest_dir == "/" {
                    source_name.clone()
                } else {
                    format!("{remote_dest_dir}/{source_name}")
                }
            });
            let rsync_remote_path = if is_dir && !overrides.contains_key(source) {
                remote_dest_dir.clone()
            } else {
                destination_path.clone()
            };
            let mut item_entries: Vec<Value> = Vec::new();
            if is_dir {
                item_entries = local_directory_files(source);
            }
            let item_total = item_entries.len();
            let mut task = json!({
                "tabId": tab_id,
                "kind": "upload",
                "direction": "upload",
                "profileId": profile_id,
                "connectionId": connection_id,
                "host": host,
                "port": port,
                "username": username,
                "source": source,
                "destination": destination_path,
                "sourceDisplay": source,
                "destinationDisplay": format!("{username}@{host}:{destination_path}"),
                "localPath": source,
                "remotePath": rsync_remote_path,
                "preserveTimestamps": preserve,
                "itemEntries": item_entries,
                "itemTotalCount": item_total,
                "itemDoneCount": 0
            });
            task = self.make_task(task);
            tasks.push(task);
        }
        Ok(self.push_tasks(tasks))
    }

    pub fn enqueue_download(&self, req: &Value) -> Result<Vec<String>, CoFinderError> {
        let tab_id = required_str(req, "tabId", "tabId")?.to_string();
        let host = required_host(req, "host")?.to_string();
        let port = required_port(req, "port")?;
        let username = required_username(req, "username")?.to_string();
        let profile_id = optional_str(req, "profileId").map(|s| s.to_string());
        let connection_id = optional_str(req, "connectionId").map(|s| s.to_string());
        let preserve = req.get("preserveTimestamps").and_then(|v| v.as_bool()).unwrap_or(true);
        let local_dest_dir = crate::backend::util::normalize_local_path(optional_str(req, "localDestinationDir").unwrap_or("."));
        let overrides = string_map(req.get("localTargetOverrides"));

        let sources: Vec<String> = match req.get("remoteSources") {
            Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str()).map(normalize_remote_path_for_lock).collect(),
            _ => Vec::new(),
        };
        if sources.is_empty() {
            return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Select at least one remote file to download."));
        }
        if !std::path::Path::new(&local_dest_dir).exists() {
            return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Local destination directory does not exist."));
        }

        let mut tasks = Vec::new();
        for source in &sources {
            let source_name = source.rsplit('/').next().unwrap_or(source).to_string();
            let local_path = overrides.get(source).cloned().unwrap_or_else(|| std::path::Path::new(&local_dest_dir).join(&source_name).to_string_lossy().into_owned());
            let task = self.make_task(json!({
                "tabId": tab_id,
                "kind": "download",
                "direction": "download",
                "profileId": profile_id,
                "connectionId": connection_id,
                "host": host,
                "port": port,
                "username": username,
                "source": source,
                "destination": local_path,
                "sourceDisplay": format!("{username}@{host}:{source}"),
                "destinationDisplay": local_path,
                "localPath": local_path,
                "remotePath": source,
                "preserveTimestamps": preserve
            }));
            tasks.push(task);
        }
        Ok(self.push_tasks(tasks))
    }

    pub fn enqueue_delete(&self, req: &Value) -> Result<Vec<String>, CoFinderError> {
        let tab_id = required_str(req, "tabId", "tabId")?.to_string();
        let pane = if req.get("pane").and_then(|v| v.as_str()) == Some("remote") { "remote" } else { "local" }.to_string();
        let connection_id = optional_str(req, "connectionId").map(|s| s.to_string());
        if pane == "remote" && connection_id.as_deref().map(|s| s.trim().is_empty()).unwrap_or(true) {
            return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Remote connection id is required for delete."));
        }
        let mut paths: Vec<String> = match req.get("paths") {
            Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str()).map(|s| {
                if pane == "remote" {
                    normalize_remote_path_for_lock(s)
                } else {
                    crate::backend::util::normalize_local_path(s)
                }
            }).collect(),
            _ => Vec::new(),
        };
        paths.sort();
        paths.dedup();
        if paths.is_empty() {
            return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Select at least one item to delete."));
        }
        let lock_key = operation_lock_key("delete", &pane, connection_id.as_deref().unwrap_or(""), &paths);
        self.assert_no_conflicting_operation(&lock_key)?;
        let label = if paths.len() == 1 { paths[0].clone() } else { format!("{} items", paths.len()) };
        let task = self.make_task(json!({
            "tabId": tab_id,
            "kind": "delete",
            "pane": pane,
            "source": label,
            "destination": "",
            "sourceDisplay": if pane == "remote" { format!("Remote delete: {label}") } else { format!("Local delete: {label}") },
            "destinationDisplay": "",
            "connectionId": connection_id,
            "host": "",
            "port": 0,
            "username": "",
            "remotePath": if pane == "remote" { label.clone() } else { "".to_string() },
            "localPath": if pane == "local" { label.clone() } else { "".to_string() },
            "operationPaths": paths,
            "operationLockKey": lock_key
        }));
        Ok(self.push_tasks(vec![task]))
    }

    pub fn enqueue_operation(&self, kind: &str, req: &Value) -> Result<Vec<String>, CoFinderError> {
        let tab_id = required_str(req, "tabId", "tabId")?.to_string();
        let pane = if req.get("pane").and_then(|v| v.as_str()) == Some("remote") { "remote" } else { "local" }.to_string();
        let connection_id = optional_str(req, "connectionId").map(|s| s.to_string());
        if pane == "remote" && connection_id.as_deref().map(|s| s.trim().is_empty()).unwrap_or(true) {
            return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Remote connection id is required for this operation."));
        }
        let source_path = if pane == "remote" {
            normalize_remote_path_for_lock(required_str(req, "path", "path")?)
        } else {
            crate::backend::util::normalize_local_path(required_str(req, "path", "path")?)
        };
        let delete_source = req.get("deleteSourceAfterSuccess").and_then(|v| v.as_bool()).unwrap_or(false);
        let destination_path = match kind {
            "gzip" => format!("{source_path}.gz"),
            "decompress" => decompress_destination(&source_path)?,
            "md5" => format!("{source_path}.md5"),
            _ => return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Unknown operation kind.")),
        };
        let lock_key = operation_lock_key(kind, &pane, connection_id.as_deref().unwrap_or(""), &[source_path.clone()]);
        self.assert_no_conflicting_operation(&lock_key)?;
        let task = self.make_task(json!({
            "tabId": tab_id,
            "kind": kind,
            "pane": pane,
            "source": source_path,
            "destination": destination_path,
            "sourceDisplay": if pane == "remote" { format!("Remote {kind}: {source_path}") } else { format!("Local {kind}: {source_path}") },
            "destinationDisplay": destination_path,
            "connectionId": connection_id,
            "host": "",
            "port": 0,
            "username": "",
            "remotePath": if pane == "remote" { source_path.clone() } else { "".to_string() },
            "localPath": if pane == "local" { source_path.clone() } else { "".to_string() },
            "deleteSourceAfterSuccess": delete_source,
            "operationLockKey": lock_key
        }));
        Ok(self.push_tasks(vec![task]))
    }

    pub fn enqueue_remote_copy_move(&self, kind: &str, req: &Value) -> Result<Vec<String>, CoFinderError> {
        let tab_id = required_str(req, "tabId", "tabId")?.to_string();
        let connection_id = required_str(req, "connectionId", "connectionId")?.to_string();
        let sources: Vec<String> = match req.get("sources") {
            Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str()).map(normalize_remote_path_for_lock).collect(),
            _ => Vec::new(),
        };
        if sources.is_empty() {
            return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Select at least one remote item."));
        }
        let destination_input = normalize_remote_path_for_lock(required_str(req, "destinationPath", "destinationPath")?);
        let conflict_policy = if req.get("conflictPolicy").and_then(|v| v.as_str()) == Some("rename") { "rename" } else { "fail" };
        let force_dir = sources.len() > 1 || req.get("destinationPath").and_then(|v| v.as_str()).map(|s| s.ends_with('/')).unwrap_or(false);
        let mut tasks = Vec::new();
        for source in &sources {
            let base = source.rsplit('/').next().unwrap_or(source).to_string();
            let destination_display = if force_dir {
                if destination_input == "/" { base.clone() } else { format!("{destination_input}/{base}") }
            } else {
                destination_input.clone()
            };
            let lock_key = operation_lock_key(kind, "remote", &connection_id, &[source.clone(), destination_display.clone()]);
            self.assert_no_conflicting_operation(&lock_key)?;
            let task = self.make_task(json!({
                "tabId": tab_id,
                "kind": kind,
                "pane": "remote",
                "source": source,
                "destination": destination_input,
                "sourceDisplay": format!("Remote {kind}: {source}"),
                "destinationDisplay": destination_display,
                "connectionId": connection_id,
                "host": "",
                "port": 0,
                "username": "",
                "remotePath": source,
                "localPath": "",
                "operationPaths": [source, destination_display],
                "operationLockKey": lock_key,
                "remoteCopyMoveConflictPolicy": conflict_policy,
                "remoteCopyMoveForceDestinationDirectory": force_dir
            }));
            tasks.push(task);
        }
        Ok(self.push_tasks(tasks))
    }

    fn assert_no_conflicting_operation(&self, lock_key: &str) -> Result<(), CoFinderError> {
        let store = self.store.lock().unwrap();
        for t in &store.tasks {
            if t.get("operationLockKey").and_then(|v| v.as_str()) == Some(lock_key) {
                if let Some(status) = t.get("status").and_then(|v| v.as_str()) {
                    if status == "pending" || status == "running" {
                        return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "A conflicting operation is already running."));
                    }
                }
            }
        }
        Ok(())
    }
}


// ---------------------------------------------------------------------------
// Pump / execution
// ---------------------------------------------------------------------------
impl TransferQueue {
    /// Start the scheduling loop on a background thread. Must be called via an
    /// `Arc<TransferQueue>` so the worker owns a strong reference.
    pub fn pump_async(self: &Arc<Self>) {
        let mut store = self.store.lock().unwrap();
        if store.pump_in_flight {
            return;
        }
        store.pump_in_flight = true;
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            loop {
                let started = {
                    let mut store = this.store.lock().unwrap();
                    let candidate_ids: Vec<String> = store.tasks.iter().filter(|t| t.get("status").and_then(|v| v.as_str()) == Some("pending")).filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())).collect();
                    let mut launched = false;
                    for id in candidate_ids {
                        if store.stopping.load(Ordering::SeqCst) {
                            break;
                        }
                        let (lane, locks) = {
                            let task = store.tasks.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(&id)).unwrap();
                            (lane_for_task(task), locks_for_task(task))
                        };
                        let lane_concurrency = concurrency_for_lane(&store, &lane);
                        let lane_running = store.running.values().filter(|c| c.lane == lane).count();
                        if lane_running >= lane_concurrency {
                            continue;
                        }
                        if has_running_path_conflict(&store, &locks) {
                            continue;
                        }
                        let ctx = RunningContext { task_id: id.clone(), lane, locks, child_pid: Arc::new(Mutex::new(None)) };
                        store.running.insert(id.clone(), ctx);
                        launched = true;
                    }
                    launched
                };
                if !started {
                    break;
                }
                // Launch each reserved task on its own thread.
                let to_launch: Vec<String> = {
                    let store = this.store.lock().unwrap();
                    store.tasks.iter().filter(|t| t.get("status").and_then(|v| v.as_str()) == Some("pending")).filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())).collect()
                };
                let mut any = false;
                for id in to_launch {
                    let is_reserved = { let store = this.store.lock().unwrap(); store.running.contains_key(&id) };
                    if is_reserved {
                        any = true;
                        let this2 = Arc::clone(&this);
                        std::thread::spawn(move || {
                            this2.run_task(&id);
                        });
                    }
                }
                if !any {
                    break;
                }
            }
            let mut store = this.store.lock().unwrap();
            store.pump_in_flight = false;
        });
    }

    fn run_task(self: &Arc<Self>, task_id: &str) {
        // Mark running
        {
            let mut store = self.store.lock().unwrap();
            if let Some(idx) = store.tasks.iter().position(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)) {
                let t = &mut store.tasks[idx];
                if t.get("status").and_then(|v| v.as_str()) != Some("pending") {
                    return;
                }
                t["status"] = json!("running");
                t["startedAt"] = json!(now_ms());
                t["error"] = Value::Null;
            }
        }
        self.emit();

        // Classify task kind
        let kind = self.task_field(task_id, "kind").unwrap_or_default();
        let pane = self.task_field(task_id, "pane").unwrap_or_else(|| "local".to_string());

        let result: Result<(), String> = match kind.as_str() {
            "delete" => self.run_delete_task(task_id, &pane),
            "gzip" | "decompress" | "md5" => self.run_operation_task(task_id, &kind, &pane),
            "remoteCopy" | "remoteMove" => self.run_remote_copy_move(task_id, &kind),
            "upload" | "download" => self.run_rsync_transfer(task_id, &kind),
            _ => Err(format!("Unknown task kind: {kind}")),
        };

        match result {
            Ok(()) => {}
            Err(msg) => {
                let mut store = self.store.lock().unwrap();
                if let Some(idx) = store.tasks.iter().position(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)) {
                    let t = &mut store.tasks[idx];
                    if t.get("status").and_then(|v| v.as_str()) != Some("running") {
                        return;
                    }
                    t["status"] = json!("failed");
                    t["finishedAt"] = json!(now_ms());
                    t["error"] = json!(msg);
                    t["errorCode"] = json!(classify_transfer_failure(&msg));
                }
            }
        }
        {
            let mut store = self.store.lock().unwrap();
            store.running.remove(task_id);
        }
        self.emit();
        self.pump_async();
    }

    fn task_field(&self, task_id: &str, key: &str) -> Option<String> {
        let store = self.store.lock().unwrap();
        store.tasks.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)).and_then(|t| t.get(key).and_then(|v| v.as_str()).map(|s| s.to_string()))
    }

    fn task_field_owned(&self, task_id: &str, key: &str) -> Option<Value> {
        let store = self.store.lock().unwrap();
        store.tasks.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)).and_then(|t| t.get(key).cloned())
    }

    fn append_log(&self, task_id: &str, line: &str) {
        let mut store = self.store.lock().unwrap();
        if let Some(idx) = store.tasks.iter().position(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)) {
            let t = &mut store.tasks[idx];
            let mut log: Vec<String> = t.get("rawLog").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
            log.push(line.to_string());
            if log.len() > 200 {
                log.drain(0..log.len() - 200);
            }
            t["rawLog"] = json!(log);
        }
    }

    fn set_task_fields(&self, task_id: &str, patch: Value) {
        let mut store = self.store.lock().unwrap();
        if let Some(idx) = store.tasks.iter().position(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)) {
            let t = &mut store.tasks[idx];
            if let Value::Object(pm) = patch {
                for (k, v) in pm {
                    t[k] = v;
                }
            }
        }
    }

    fn run_rsync_transfer(self: &Arc<Self>, task_id: &str, kind: &str) -> Result<(), String> {
        // rsync availability check
        let rsync_ok = Command::new("rsync").arg("--version").output().is_ok();
        if !rsync_ok {
            return Err("rsync is not installed or not found in PATH".to_string());
        }
        let username = self.task_field(task_id, "username").unwrap_or_default();
        let host = self.task_field(task_id, "host").unwrap_or_default();
        let port = self.task_field_owned(task_id, "port").and_then(|v| v.as_u64()).unwrap_or(22) as u16;
        let preserve = self.task_field_owned(task_id, "preserveTimestamps").and_then(|v| v.as_bool()).unwrap_or(true);
        let local_path = self.task_field(task_id, "localPath").unwrap_or_default();
        let remote_path = self.task_field(task_id, "remotePath").unwrap_or_default();
        let connection_id = self.task_field(task_id, "connectionId");
        let destination_display = self.task_field(task_id, "destination").unwrap_or_default();

        let args = if kind == "upload" {
            let remote_spec = build_rsync_remote_spec(&username, &host, &remote_path).map_err(|e| e.message)?;
            let flags = if preserve { "-avh" } else { "-rvh" };
            vec![flags.to_string(), "--progress".to_string(), "-e".to_string(), build_ssh_spec(port), local_path.clone(), remote_spec]
        } else {
            let remote_spec = build_rsync_remote_spec(&username, &host, &remote_path).map_err(|e| e.message)?;
            let flags = if preserve { "-avh" } else { "-rvh" };
            vec![flags.to_string(), "--progress".to_string(), "-e".to_string(), build_ssh_spec(port), remote_spec, local_path.clone()]
        };

        self.append_log(task_id, &format!("rsync {}", args.join(" ")));
        self.set_task_fields(task_id, json!({ "progressText": "Starting transfer...", "currentFile": Value::Null, "percent": Value::Null, "speed": Value::Null, "eta": Value::Null }));
        self.emit();

        let mut child = Command::new("rsync").args(&args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("Failed to start rsync process: {e}"))?;

        // Register child pid for stop()
        {
            let mut store = self.store.lock().unwrap();
            if let Some(ctx) = store.running.get_mut(task_id) {
                *ctx.child_pid.lock().unwrap() = Some(child.id());
            }
        }

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let task_stdout = task_id.to_string();
        let task_stderr = task_id.to_string();

        let this_out = Arc::clone(self);
        let out_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    this_out.consume_progress_line(&task_stdout, &line);
                }
            }
        });
        let this_err = Arc::clone(self);
        let err_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    this_err.consume_progress_line(&task_stderr, &line);
                }
            }
        });

        let status = child.wait().map_err(|e| format!("Failed to wait for rsync: {e}"))?;
        let _ = out_thread.join();
        let _ = err_thread.join();

        // Clear child registration
        {
            let mut store = self.store.lock().unwrap();
            if let Some(ctx) = store.running.get_mut(task_id) {
                *ctx.child_pid.lock().unwrap() = None;
            }
        }

        let is_running = { let store = self.store.lock().unwrap(); store.tasks.iter().any(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id) && t.get("status").and_then(|v| v.as_str()) == Some("running")) };
        if !is_running {
            return Ok(());
        }

        let code = status.code();
        if code == Some(0) {
            self.set_task_fields(task_id, json!({ "status": "success", "finishedAt": now_ms(), "errorCode": Value::Null, "percent": 100, "progressText": "Transfer completed successfully." }));
            self.append_log(task_id, "Transfer completed successfully.");
            return Ok(());
        }

        // Failure — decide SFTP fallback
        let recent_log: String = {
            let store = self.store.lock().unwrap();
            let t = store.tasks.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id)).unwrap();
            t.get("rawLog").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("\n")).unwrap_or_default()
        };
        let category = classify_transfer_failure(&recent_log);
        if let Some(conn) = &connection_id {
            if should_fallback_to_sftp(code.unwrap_or(-1), &category, &recent_log) {
                return self.run_sftp_fallback(task_id, kind, conn, &local_path, &remote_path, &destination_display);
            }
        }
        Err(human_transfer_error(&category, code.unwrap_or(-1)))
    }

    fn consume_progress_line(&self, task_id: &str, line: &str) {
        let safe_line = &line[..line.len().min(400)];
        self.append_log(task_id, safe_line);
        let is_running = { let store = self.store.lock().unwrap(); store.tasks.iter().any(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id) && t.get("status").and_then(|v| v.as_str()) == Some("running")) };
        if !is_running {
            return;
        }
        // file hint: to-check=... name
        let re = regex::Regex::new(r"to-ch(?:eck|k)=\d+/\d+\)\s*(.+)$").unwrap();
        if let Some(caps) = re.captures(safe_line) {
            self.set_task_fields(task_id, json!({ "currentFile": caps.get(1).map(|m| m.as_str().to_string()) }));
            self.emit();
        }
        // progress: N% 12.3MB/s 00:01:02
        let pre = regex::Regex::new(r"(\d+)%\s+([0-9.]+\w+/s)\s+(\d+:\d+:\d+|\d+:\d+)").unwrap();
        if let Some(caps) = pre.captures(safe_line) {
            let percent = caps.get(1).and_then(|m| m.as_str().parse::<u64>().ok()).unwrap_or(0);
            self.set_task_fields(task_id, json!({
                "percent": percent,
                "speed": caps.get(2).map(|m| m.as_str().to_string()),
                "eta": caps.get(3).map(|m| m.as_str().to_string()),
                "progressText": safe_line
            }));
            self.emit();
        } else if safe_line.contains('%') || safe_line.contains("xfr#") || safe_line.contains("to-check=") {
            self.set_task_fields(task_id, json!({ "progressText": safe_line }));
            self.emit();
        }
    }

    fn run_sftp_fallback(&self, task_id: &str, kind: &str, connection_id: &str, local_path: &str, remote_path: &str, destination_display: &str) -> Result<(), String> {
        self.set_task_fields(task_id, json!({ "progressText": "rsync SSH failed; transferring over SFTP..." }));
        self.append_log(task_id, "rsync SSH failed; transferring over SFTP...");
        self.emit();
        let is_running = { let store = self.store.lock().unwrap(); store.tasks.iter().any(|t| t.get("id").and_then(|v| v.as_str()) == Some(task_id) && t.get("status").and_then(|v| v.as_str()) == Some("running")) };
        if !is_running {
            return Ok(());
        }
        let result = if kind == "upload" {
            self.remote.upload_path_to_remote(connection_id, local_path, remote_path)
        } else {
            self.remote.download_path_to_local(connection_id, remote_path, local_path)
        };
        match result {
            Ok(()) => {
                self.set_task_fields(task_id, json!({ "status": "success", "finishedAt": now_ms(), "errorCode": Value::Null, "percent": 100, "progressText": if kind == "upload" { "Uploaded over SFTP." } else { "Downloaded over SFTP." } }));
                self.append_log(task_id, if kind == "upload" { "Uploaded over SFTP." } else { "Downloaded over SFTP." });
                self.emit();
                let _ = destination_display;
                Ok(())
            }
            Err(e) => Err(e.message),
        }
    }

    fn run_delete_task(&self, task_id: &str, pane: &str) -> Result<(), String> {
        let paths: Vec<String> = self
            .task_field_owned(task_id, "operationPaths")
            .and_then(|v| v.as_array().cloned())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        let paths = if paths.is_empty() { vec![self.task_field(task_id, "source").unwrap_or_default()] } else { paths };
        self.set_task_fields(task_id, json!({ "currentFile": if paths.len() == 1 { paths[0].clone() } else { format!("{} items", paths.len()) }, "progressText": "Deleting..." }));
        self.emit();
        let deleted = if pane == "remote" {
            let conn = self.task_field(task_id, "connectionId").ok_or("Remote connection id is required for delete.")?;
            self.remote.delete_paths(&conn, &paths).map_err(|e| e.message)?
        } else {
            let svc = crate::backend::local_files::LocalFileService;
            let mut n: u64 = 0;
            for p in &paths {
                let one = vec![p.clone()];
                if let Ok(del) = svc.delete_paths(&one) {
                    n += del;
                }
            }
            n
        };
        self.set_task_fields(task_id, json!({ "status": "success", "finishedAt": now_ms(), "progressText": format!("Deleted {deleted} {}", if deleted == 1 { "item" } else { "items" }) }));
        self.append_log(task_id, &format!("Deleted {deleted} {}", if deleted == 1 { "item" } else { "items" }));
        self.emit();
        Ok(())
    }

    fn run_operation_task(&self, task_id: &str, kind: &str, pane: &str) -> Result<(), String> {
        let source = self.task_field(task_id, "source").unwrap_or_default();
        let delete_source = self.task_field_owned(task_id, "deleteSourceAfterSuccess").and_then(|v| v.as_bool()).unwrap_or(false);
        let progress_text = match kind {
            "md5" => "Generating MD5...".to_string(),
            "decompress" => "Decompressing...".to_string(),
            "gzip" => "Compressing...".to_string(),
            _ => "Working...".to_string(),
        };
        self.set_task_fields(task_id, json!({ "currentFile": source, "progressText": progress_text }));
        self.emit();
        let output = if pane == "remote" {
            let conn = self.task_field(task_id, "connectionId").ok_or("Remote connection id is required.")?;
            match kind {
                "md5" => self.remote.remote_md5(&conn, &source).map_err(|e| e.message)?,
                "decompress" => self.remote.remote_decompress(&conn, &source).map_err(|e| e.message)?,
                "gzip" => self.remote.remote_gzip(&conn, &source, delete_source).map_err(|e| e.message)?,
                _ => return Err("Unknown operation".to_string()),
            }
        } else {
            let svc = crate::backend::local_files::LocalFileService;
            match kind {
                "md5" => svc.local_md5(&source).map_err(|e| e.message)?,
                "decompress" => svc.local_decompress(&source).map_err(|e| e.message)?,
                "gzip" => svc.local_gzip(&source, delete_source).map_err(|e| e.message)?,
                _ => return Err("Unknown operation".to_string()),
            }
        };
        self.set_task_fields(task_id, json!({
            "status": "success", "finishedAt": now_ms(),
            "destination": output, "destinationDisplay": output,
            "progressText": match kind { "md5" => "MD5 generated.", "decompress" => "Decompressed.", "gzip" => if delete_source { "Compressed and deleted source." } else { "Compressed; source kept." }, _ => "Completed." }
        }));
        self.append_log(task_id, "Operation completed.");
        self.emit();
        Ok(())
    }

    fn run_remote_copy_move(&self, task_id: &str, kind: &str) -> Result<(), String> {
        let conn = self.task_field(task_id, "connectionId").ok_or("Remote connection id is required.")?;
        let source = self.task_field(task_id, "source").unwrap_or_default();
        let destination = self.task_field(task_id, "destination").unwrap_or_default();
        let conflict_policy = self.task_field(task_id, "remoteCopyMoveConflictPolicy").unwrap_or_else(|| "fail".to_string());
        let force_dir = self.task_field_owned(task_id, "remoteCopyMoveForceDestinationDirectory").and_then(|v| v.as_bool()).unwrap_or(false);
        self.set_task_fields(task_id, json!({ "currentFile": source, "progressText": if kind == "remoteCopy" { "Copying remote item..." } else { "Moving remote item..." } }));
        self.emit();
        let output = if kind == "remoteCopy" {
            self.remote.remote_copy(&conn, &source, &destination, &conflict_policy, force_dir).map_err(|e| e.message)?
        } else {
            self.remote.remote_move(&conn, &source, &destination, &conflict_policy, force_dir).map_err(|e| e.message)?
        };
        self.set_task_fields(task_id, json!({
            "status": "success", "finishedAt": now_ms(),
            "destination": output, "destinationDisplay": output,
            "progressText": if kind == "remoteCopy" { "Remote copy completed." } else { "Remote move completed." }
        }));
        self.append_log(task_id, "Remote mutation completed.");
        self.emit();
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Conflict checks (used by transfer:checkUploadConflicts / checkDownloadConflicts)
// ---------------------------------------------------------------------------
impl TransferQueue {
    pub fn check_upload_conflicts(&self, req: &Value) -> Result<Vec<Value>, CoFinderError> {
        let connection_id = required_str(req, "connectionId", "connectionId")?.to_string();
        let remote_dest_dir = validate_rsync_path(optional_str(req, "remoteDestinationDir").unwrap_or("/"))?;
        let overrides = string_map(req.get("remoteTargetOverrides"));
        let sources: Vec<String> = match req.get("localSources") {
            Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str()).map(|s| crate::backend::util::normalize_local_path(s)).collect(),
            _ => Vec::new(),
        };
        let mut conflicts = Vec::new();
        for source in &sources {
            let name = std::path::Path::new(source).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let target = overrides.get(source).cloned().unwrap_or_else(|| {
                if remote_dest_dir == "/" { name.clone() } else { format!("{remote_dest_dir}/{name}") }
            });
            if let Ok(info) = self.remote.get_path_info(&connection_id, &target) {
                let ttype = info.get("type").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                conflicts.push(json!({ "source": source, "target": target, "targetType": ttype }));
            }
        }
        Ok(conflicts)
    }

    pub fn check_download_conflicts(&self, req: &Value) -> Result<Vec<Value>, CoFinderError> {
        let local_dest_dir = crate::backend::util::normalize_local_path(optional_str(req, "localDestinationDir").unwrap_or("."));
        let overrides = string_map(req.get("localTargetOverrides"));
        let sources: Vec<String> = match req.get("remoteSources") {
            Some(Value::Array(a)) => a.iter().filter_map(|v| v.as_str()).map(normalize_remote_path_for_lock).collect(),
            _ => Vec::new(),
        };
        let mut conflicts = Vec::new();
        for source in &sources {
            let name = source.rsplit('/').next().unwrap_or(source).to_string();
            let target = overrides.get(source).cloned().unwrap_or_else(|| std::path::Path::new(&local_dest_dir).join(&name).to_string_lossy().into_owned());
            if std::path::Path::new(&target).exists() {
                let ttype = if std::path::Path::new(&target).is_dir() { "directory" } else if std::path::Path::new(&target).is_symlink() { "symlink" } else { "file" }.to_string();
                conflicts.push(json!({ "source": source, "target": target, "targetType": ttype }));
            }
        }
        Ok(conflicts)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
fn required_str<'a>(req: &'a Value, key: &str, label: &str) -> Result<&'a str, CoFinderError> {
    req.get(key).and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty())
        .ok_or_else(|| CoFinderError::new("TRANSFER_INVALID_REQUEST", format!("{label} is required.")))
}

fn optional_str<'a>(req: &'a Value, key: &str) -> Option<&'a str> {
    req.get(key).and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty())
}

fn required_host<'a>(req: &'a Value, key: &str) -> Result<&'a str, CoFinderError> {
    let v = required_str(req, key, key)?;
    if !is_safe_host_or_username(v) {
        return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Invalid host."));
    }
    Ok(v)
}

fn required_username<'a>(req: &'a Value, key: &str) -> Result<&'a str, CoFinderError> {
    let v = required_str(req, key, key)?;
    if !is_safe_host_or_username(v) {
        return Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Invalid username."));
    }
    Ok(v)
}

fn required_port(req: &Value, key: &str) -> Result<u16, CoFinderError> {
    let v = req.get(key).and_then(|v| v.as_u64()).filter(|p| *p > 0 && *p <= 65535)
        .ok_or_else(|| CoFinderError::new("TRANSFER_INVALID_REQUEST", "Port must be between 1 and 65535."))?;
    Ok(v as u16)
}

fn string_map(v: Option<&Value>) -> HashMap<String, String> {
    let mut m = HashMap::new();
    if let Some(Value::Object(o)) = v {
        for (k, val) in o {
            if let Some(s) = val.as_str() {
                let t = s.trim();
                if !t.is_empty() {
                    m.insert(k.clone(), t.to_string());
                }
            }
        }
    }
    m
}

fn decompress_destination(path: &str) -> Result<String, CoFinderError> {
    for (suffix, _) in [(".tar.gz", 7), (".tgz", 4), (".gz", 3)] {
        if path.ends_with(suffix) {
            return Ok(path[..path.len() - suffix.len()].to_string());
        }
    }
    Err(CoFinderError::new("TRANSFER_INVALID_REQUEST", "Selected item is not a supported compressed file."))
}

fn local_directory_files(root: &str) -> Vec<Value> {
    fn walk(dir: &std::path::Path, rel_base: &str, out: &mut Vec<Value>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let rel = if rel_base.is_empty() { name.clone() } else { format!("{rel_base}/{name}") };
            let is_dir = e.path().is_dir();
            let size = if !is_dir { e.metadata().ok().map(|m| m.len()) } else { None };
            out.push(json!({
                "relativePath": rel,
                "displayPath": rel,
                "size": size,
                "status": "pending"
            }));
            if is_dir {
                walk(&e.path(), &rel, out);
            }
        }
    }
    let mut out = Vec::new();
    walk(std::path::Path::new(root), "", &mut out);
    out
}

fn classify_transfer_failure(input: &str) -> String {
    if input.contains("rsync is not installed") || input.contains("not found in PATH") || input.contains("ENOENT") {
        "rsync_not_found".to_string()
    } else if input.contains("BatchMode") || input.contains("Permission denied (publickey)") {
        "ssh_batchmode_failed".to_string()
    } else if input.contains("No space left") {
        "no_space_left".to_string()
    } else if input.contains("Permission denied") || input.contains("EACCES") || input.contains("EPERM") {
        "permission_denied".to_string()
    } else if input.contains("No such file") || input.contains("not found") || input.contains("No such path") {
        "path_not_found".to_string()
    } else if input.contains("Connection reset") || input.contains("Connection lost") || input.contains("disconnect") || input.contains("Broken pipe") || input.contains("timed out") {
        "remote_disconnected".to_string()
    } else {
        "unknown".to_string()
    }
}

fn should_fallback_to_sftp(exit_code: i32, category: &str, recent_log: &str) -> bool {
    if category == "path_not_found" || category == "no_space_left" {
        return false;
    }
    if exit_code == 255 {
        return true;
    }
    if category == "permission_denied" {
        return recent_log.contains("Permission denied (publickey)") || recent_log.contains("Permission denied (password)") || recent_log.contains("Permission denied (keyboard-interactive)") || recent_log.contains("Permission denied, please try again");
    }
    category == "ssh_batchmode_failed" || recent_log.contains("Permission denied (publickey)") || recent_log.contains("BatchMode") || recent_log.contains("Host key verification failed")
}

fn human_transfer_error(category: &str, code: i32) -> String {
    match category {
        "permission_denied" => "Transfer failed: permission denied.".to_string(),
        "path_not_found" => "Transfer failed: path not found.".to_string(),
        "no_space_left" => "Transfer failed: no space left on destination.".to_string(),
        "remote_disconnected" => "Transfer failed: remote connection was interrupted.".to_string(),
        "rsync_not_found" => "rsync is not installed or not found in PATH".to_string(),
        "ssh_batchmode_failed" => "SSH key/passwordless login required for rsync transfer.".to_string(),
        _ => format!("rsync exited with code {code}."),
    }
}

fn locks_for_task(task: &Value) -> Vec<PathLock> {
    let kind = task.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    let pane = task.get("pane").and_then(|v| v.as_str()).unwrap_or(if kind == "upload" || kind == "download" { "mixed" } else { "local" });
    let connection_id = task.get("connectionId").and_then(|v| v.as_str()).map(|s| s.to_string());
    let local_path = task.get("localPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let remote_path = task.get("remotePath").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let destination = task.get("destination").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let mut locks = Vec::new();
    match kind {
        "upload" => {
            if !local_path.is_empty() {
                locks.push(PathLock { pane: "local".into(), connection_id: None, path: normalize_lock_path("local", &local_path), mode: "read".into() });
            }
            if !destination.is_empty() {
                locks.push(PathLock { pane: "remote".into(), connection_id: connection_id.clone(), path: normalize_lock_path("remote", &destination), mode: "write".into() });
            }
        }
        "download" => {
            if !remote_path.is_empty() {
                locks.push(PathLock { pane: "remote".into(), connection_id: connection_id.clone(), path: normalize_lock_path("remote", &remote_path), mode: "read".into() });
            }
            if !local_path.is_empty() {
                locks.push(PathLock { pane: "local".into(), connection_id: None, path: normalize_lock_path("local", &local_path), mode: "write".into() });
            }
        }
        "delete" => {
            let paths: Vec<String> = task.get("operationPaths").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
            let p = task.get("pane").and_then(|v| v.as_str()).unwrap_or("local");
            for path in paths {
                locks.push(PathLock { pane: p.to_string(), connection_id: connection_id.clone(), path: normalize_lock_path(p, &path), mode: "delete".into() });
            }
        }
        "gzip" => {
            let src = task.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let p = task.get("pane").and_then(|v| v.as_str()).unwrap_or("local");
            locks.push(PathLock { pane: p.to_string(), connection_id: connection_id.clone(), path: normalize_lock_path(p, &src), mode: "write".into() });
            locks.push(PathLock { pane: p.to_string(), connection_id: connection_id.clone(), path: normalize_lock_path(p, &destination), mode: "write".into() });
        }
        "decompress" | "md5" => {
            let src = task.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let p = task.get("pane").and_then(|v| v.as_str()).unwrap_or("local");
            locks.push(PathLock { pane: p.to_string(), connection_id: connection_id.clone(), path: normalize_lock_path(p, &src), mode: "read".into() });
            locks.push(PathLock { pane: p.to_string(), connection_id: connection_id.clone(), path: normalize_lock_path(p, &destination), mode: "write".into() });
        }
        "remoteCopy" => {
            let src = task.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string();
            locks.push(PathLock { pane: "remote".into(), connection_id: connection_id.clone(), path: normalize_lock_path("remote", &src), mode: "read".into() });
            locks.push(PathLock { pane: "remote".into(), connection_id: connection_id.clone(), path: normalize_lock_path("remote", &destination), mode: "write".into() });
        }
        "remoteMove" => {
            let src = task.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string();
            locks.push(PathLock { pane: "remote".into(), connection_id: connection_id.clone(), path: normalize_lock_path("remote", &src), mode: "write".into() });
            locks.push(PathLock { pane: "remote".into(), connection_id: connection_id.clone(), path: normalize_lock_path("remote", &destination), mode: "write".into() });
        }
        _ => {}
    }
    locks
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_queue() -> Arc<TransferQueue> {
        Arc::new(TransferQueue::new(Arc::new(crate::backend::remote::RemoteService::new())))
    }

    fn mk_upload_req(dir: &std::path::Path) -> Value {
        json!({
            "tabId": "t1",
            "host": "10.0.32.10",
            "port": 22,
            "username": "zhouwenxiong",
            "localSources": [dir.join("a.txt").to_str().unwrap()],
            "remoteDestinationDir": "/home/zhouwenxiong/upload-test"
        })
    }

    #[test]
    fn enqueue_upload_creates_pending_task() {
        let dir = std::env::temp_dir().join("cf-transfer-test-upload");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "hello").unwrap();
        let q = test_queue();
        let ids = q.enqueue_upload(&mk_upload_req(&dir)).unwrap();
        assert_eq!(ids.len(), 1);
        let tasks = q.list();
        assert_eq!(tasks[0]["status"], "pending");
        assert_eq!(tasks[0]["kind"], "upload");
        assert_eq!(tasks[0]["direction"], "upload");
        assert_eq!(tasks[0]["port"], 22);
        assert_eq!(tasks[0]["host"], "10.0.32.10");
        assert_eq!(tasks[0]["destinationDisplay"], "zhouwenxiong@10.0.32.10:/home/zhouwenxiong/upload-test/a.txt");
    }

    #[test]
    fn enqueue_upload_requires_sources() {
        let q = test_queue();
        let req = json!({ "tabId": "t1", "host": "h", "port": 22, "username": "u", "localSources": [], "remoteDestinationDir": "/x" });
        let err = q.enqueue_upload(&req).unwrap_err();
        assert_eq!(err.code, "TRANSFER_INVALID_REQUEST");
    }

    #[test]
    fn enqueue_upload_rejects_bad_host() {
        let q = test_queue();
        let req = json!({ "tabId": "t1", "host": "bad host!", "port": 22, "username": "u", "localSources": ["/tmp/x"], "remoteDestinationDir": "/x" });
        assert!(q.enqueue_upload(&req).is_err());
    }

    #[test]
    fn enqueue_download_task_shape() {
        let dir = std::env::temp_dir().join("cf-transfer-test-dl");
        std::fs::create_dir_all(&dir).unwrap();
        let q = test_queue();
        let req = json!({
            "tabId": "t1", "host": "10.0.42.9", "port": 22, "username": "cygnus",
            "remoteSources": ["/data/01.project/readme.txt"],
            "localDestinationDir": dir.to_str().unwrap()
        });
        let ids = q.enqueue_download(&req).unwrap();
        assert_eq!(ids.len(), 1);
        let tasks = q.list();
        assert_eq!(tasks[0]["kind"], "download");
        assert_eq!(tasks[0]["direction"], "download");
        assert_eq!(tasks[0]["source"], "/data/01.project/readme.txt");
    }

    #[test]
    fn enqueue_delete_requires_conn_for_remote() {
        let q = test_queue();
        let req = json!({ "tabId": "t1", "pane": "remote", "paths": ["/tmp/x"] });
        let err = q.enqueue_delete(&req).unwrap_err();
        assert_eq!(err.code, "TRANSFER_INVALID_REQUEST");
    }

    #[test]
    fn enqueue_delete_local_shapes_task() {
        let q = test_queue();
        let req = json!({ "tabId": "t1", "pane": "local", "paths": ["/tmp/cf-delete-me.txt"] });
        let ids = q.enqueue_delete(&req).unwrap();
        assert_eq!(ids.len(), 1);
        let tasks = q.list();
        assert_eq!(tasks[0]["kind"], "delete");
        assert_eq!(tasks[0]["pane"], "local");
        assert_eq!(tasks[0]["operationLockKey"].as_str().unwrap().contains("delete"), true);
    }

    #[test]
    fn cancel_pending_task() {
        let q = test_queue();
        let req = json!({ "tabId": "t1", "pane": "local", "paths": ["/tmp/cf-cancel-me.txt"] });
        let ids = q.enqueue_delete(&req).unwrap();
        q.cancel(&ids[0]).unwrap();
        assert_eq!(q.list()[0]["status"], "canceled");
        assert!(q.cancel(&ids[0]).is_err(), "canceled task cannot be canceled again");
    }

    #[test]
    fn retry_failed_task() {
        let q = test_queue();
        let req = json!({ "tabId": "t1", "pane": "local", "paths": ["/tmp/cf-retry-me.txt"] });
        let ids = q.enqueue_delete(&req).unwrap();
        let id = ids[0].clone();
        q.set_task_status(&id, "failed", json!({ "error": "boom" }));
        q.retry(&id).unwrap();
        assert_eq!(q.list()[0]["status"], "pending");
        assert_eq!(q.list()[0]["error"], Value::Null);
    }

    #[test]
    fn clear_completed_removes_finished() {
        let q = test_queue();
        let req = json!({ "tabId": "t1", "pane": "local", "paths": ["/tmp/cf-clear-me.txt"] });
        let ids = q.enqueue_delete(&req).unwrap();
        q.set_task_status(&ids[0], "success", json!({}));
        let cleared = q.clear_completed();
        assert_eq!(cleared, 1);
        assert!(q.list().is_empty());
    }

    #[test]
    fn check_upload_conflicts_no_conflict() {
        let q = test_queue();
        let dir = std::env::temp_dir().join("cf-transfer-conflict");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "x").unwrap();
        let req = json!({
            "connectionId": "nonexistent",
            "remoteDestinationDir": "/home/zhouwenxiong/x",
            "localSources": [dir.join("a.txt").to_str().unwrap()]
        });
        // Connection missing -> stat fails -> no conflicts (server error treated as missing)
        let conflicts = q.check_upload_conflicts(&req).unwrap();
        assert!(conflicts.is_empty());
    }

    #[test]
    fn check_download_conflicts_detects_local() {
        let q = test_queue();
        let dir = std::env::temp_dir().join("cf-transfer-conflict-dl");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("readme.txt"), "x").unwrap();
        let req = json!({
            "localDestinationDir": dir.to_str().unwrap(),
            "remoteSources": ["/data/01.project/readme.txt"]
        });
        let conflicts = q.check_download_conflicts(&req).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0]["source"], "/data/01.project/readme.txt");
        assert_eq!(conflicts[0]["targetType"], "file");
    }

    #[test]
    fn decompress_destination_parsing() {
        assert_eq!(decompress_destination("/a/b.tar.gz").unwrap(), "/a/b");
        assert_eq!(decompress_destination("/a/c.tgz").unwrap(), "/a/c");
        assert_eq!(decompress_destination("/a/d.gz").unwrap(), "/a/d");
        assert!(decompress_destination("/a/e.txt").is_err());
    }

    #[test]
    fn lane_assignment() {
        let q = test_queue();
        let up = json!({ "kind": "upload" });
        let del = json!({ "kind": "delete" });
        let gz = json!({ "kind": "gzip" });
        let cp = json!({ "kind": "remoteCopy" });
        assert_eq!(lane_for_task(&up), "transfer");
        assert_eq!(lane_for_task(&del), "delete");
        assert_eq!(lane_for_task(&gz), "compression");
        assert_eq!(lane_for_task(&cp), "remoteMutation");
        let _ = &q;
    }

    #[test]
    fn classify_failure_codes() {
        assert_eq!(classify_transfer_failure("No space left on device"), "no_space_left");
        assert_eq!(classify_transfer_failure("Permission denied (publickey)"), "ssh_batchmode_failed");
        assert_eq!(classify_transfer_failure("Permission denied"), "permission_denied");
        assert_eq!(classify_transfer_failure("rsync: No such file or directory"), "path_not_found");
        assert_eq!(classify_transfer_failure("Connection reset by peer"), "remote_disconnected");
        assert_eq!(classify_transfer_failure("something weird"), "unknown");
    }

    #[test]
    fn should_fallback_rules() {
        assert!(should_fallback_to_sftp(255, "unknown", ""));
        assert!(!should_fallback_to_sftp(1, "path_not_found", ""));
        assert!(!should_fallback_to_sftp(1, "no_space_left", ""));
        assert!(should_fallback_to_sftp(1, "ssh_batchmode_failed", ""));
        assert!(should_fallback_to_sftp(1, "permission_denied", "Permission denied (publickey)"));
        assert!(!should_fallback_to_sftp(1, "permission_denied", "other error"));
    }
}

#[cfg(test)]
mod dispatch_tests {
    use super::*;

    fn test_state() -> Arc<crate::backend::BackendState> {
        let dir = std::env::temp_dir().join("cf-transfer-dispatch");
        std::fs::create_dir_all(&dir).unwrap();
        Arc::new(crate::backend::BackendState::new(dir.to_str().unwrap()))
    }

    #[test]
    fn dispatch_enqueue_and_list_upload() {
        let state = test_state();
        let dir = std::env::temp_dir().join("cf-transfer-dispatch-upload");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "hello").unwrap();
        let req = json!({
            "tabId": "t1", "host": "10.0.32.10", "port": 22, "username": "zhouwenxiong",
            "localSources": [dir.join("a.txt").to_str().unwrap()],
            "remoteDestinationDir": "/home/zhouwenxiong/upload-test"
        });
        let res = state.dispatch("transfer:enqueueUpload", Some(&req)).unwrap().unwrap();
        assert_eq!(res["data"]["queued"], true);
        let tasks = state.dispatch("transfer:list", None).unwrap().unwrap();
        assert_eq!(tasks["data"]["tasks"][0]["status"], "pending");
    }

    #[test]
    fn dispatch_local_delete_runs_to_success() {
        let state = test_state();
        let dir = std::env::temp_dir().join("cf-transfer-dispatch-delete");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("del-me.txt");
        std::fs::write(&f, "x").unwrap();
        let req = json!({ "tabId": "t1", "pane": "local", "paths": [f.to_str().unwrap()] });
        let res = state.dispatch("transfer:enqueueDelete", Some(&req)).unwrap().unwrap();
        let task_ids = res["data"]["taskIds"].as_array().unwrap().clone();
        state.transfer.pump_async();
        // Wait for worker to finish
        std::thread::sleep(std::time::Duration::from_millis(1200));
        let tasks = state.dispatch("transfer:list", None).unwrap().unwrap();
        assert_eq!(tasks["data"]["tasks"][0]["status"], "success");
        assert!(!f.exists(), "local file should be deleted");
        let _ = task_ids;
    }

    #[test]
    fn dispatch_local_gzip_runs_to_success() {
        let state = test_state();
        let dir = std::env::temp_dir().join("cf-transfer-dispatch-gzip");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("gz-me.txt");
        std::fs::write(&f, "hello gzip").unwrap();
        let req = json!({ "tabId": "t1", "pane": "local", "path": f.to_str().unwrap() });
        state.dispatch("transfer:enqueueGzip", Some(&req)).unwrap().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1200));
        let tasks = state.dispatch("transfer:list", None).unwrap().unwrap();
        assert_eq!(tasks["data"]["tasks"][0]["status"], "success");
        assert!(std::path::Path::new(&format!("{}.gz", f.to_str().unwrap())).exists());
    }
}
