//! Local filesystem service — Rust port of `src/main/services/LocalFileService.ts`.
//!
//! Implements the read/introspection operations first (list, info, text reads,
//! preview sniffing, touch); mutation/compression/search land in later chunks.

use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

use chrono::TimeZone;

use crate::backend::error::CoFinderError;
use crate::backend::util;

const DEFAULT_TEXT_READ_BYTES: u64 = 256 * 1024;
const TEXT_SNIFF_BYTES: usize = 8192;
const DEFAULT_IMAGE_PREVIEW_BYTES: u64 = 12 * 1024 * 1024;

/// Sniff an image mime type from leading magic bytes (port of `sniffImageMimeType`).
pub fn sniff_image_mime_type(sample: &[u8]) -> Option<&'static str> {
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

/// Decide whether a sample looks like text (port of `isLikelyText`).
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
        let control = byte < 0x20 && !matches!(byte, 0x09 | 0x0a | 0x0d | 0x0c);
        if control {
            suspicious += 1;
        }
    }
    if suspicious as f64 / sample.len() as f64 >= 0.02 {
        return false;
    }
    std::str::from_utf8(sample).is_ok() || high_bit == 0
}

/// Port of `sniffPreviewKind`.
pub fn sniff_preview_kind(sample: &[u8]) -> Option<&'static str> {
    if sniff_image_mime_type(sample).is_some() {
        return Some("image");
    }
    if is_likely_text(sample) {
        return Some("text");
    }
    None
}

fn mtime_iso(meta: &fs::Metadata) -> String {
    match meta.modified() {
        Ok(t) => {
            let secs = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
            let nanos = t.duration_since(std::time::UNIX_EPOCH).map(|d| d.subsec_nanos()).unwrap_or(0);
            // ISO-8601 with millisecond precision, matching JS `toISOString()`.
            match chrono::DateTime::<chrono::Utc>::from_timestamp(secs, nanos) {
                Some(dt) => dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                None => "1970-01-01T00:00:00.000Z".to_string(),
            }
        }
        Err(_) => "1970-01-01T00:00:00.000Z".to_string(),
    }
}

fn owner_name_cache() -> &'static std::sync::Mutex<std::collections::HashMap<u32, String>> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<std::sync::Mutex<std::collections::HashMap<u32, String>>> = OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

fn resolve_local_owner_name(uid: u32) -> String {
    if let Some(cached) = owner_name_cache().lock().unwrap().get(&uid) {
        return cached.clone();
    }
    let name = Command::new("id")
        .args(["-nu", &uid.to_string()])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| uid.to_string());
    owner_name_cache().lock().unwrap().insert(uid, name.clone());
    name
}

#[cfg(unix)]
fn uid_of(meta: &fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::MetadataExt;
    Some(meta.uid())
}

#[cfg(unix)]
fn gid_of(meta: &fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::MetadataExt;
    Some(meta.gid())
}

#[cfg(not(unix))]
fn uid_of(_: &fs::Metadata) -> Option<u32> {
    None
}

#[cfg(not(unix))]
fn gid_of(_: &fs::Metadata) -> Option<u32> {
    None
}

fn map_fs_error(error: &std::io::Error, requested_path: &str, fallback_code: &str, fallback_msg: &str) -> CoFinderError {
    use std::io::ErrorKind;
    match error.kind() {
        ErrorKind::NotFound => CoFinderError::new("NOT_FOUND", format!("Path not found: {requested_path}")),
        ErrorKind::PermissionDenied => CoFinderError::new("PERMISSION_DENIED", format!("Permission denied: {requested_path}")),
        _ => CoFinderError::new(fallback_code, format!("{fallback_msg}: {requested_path}")),
    }
}

fn read_file_chunk(path: &str, byte_offset: u64, max_bytes: u64) -> std::io::Result<Vec<u8>> {
    if max_bytes == 0 {
        return Ok(Vec::new());
    }
    let mut f = fs::File::open(path)?;
    use std::io::Seek;
    f.seek(std::io::SeekFrom::Start(byte_offset))?;
    let mut buf = vec![0u8; max_bytes as usize];
    let n = f.read(&mut buf)?;
    buf.truncate(n);
    Ok(buf)
}

/// Recursive directory size (port of `getDirectorySize`).
pub fn directory_size(dir_path: &Path) -> std::io::Result<u64> {
    let mut total = 0u64;
    for entry in fs::read_dir(dir_path)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_dir() {
            total += directory_size(&entry.path())?;
        } else {
            total += meta.len();
        }
    }
    Ok(total)
}

/// Count immediate file/folder children (port of `directoryChildCounts`).
fn directory_child_counts(dir_path: &Path) -> (u64, u64) {
    let mut file_count = 0u64;
    let mut folder_count = 0u64;
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                folder_count += 1;
            } else {
                file_count += 1;
            }
        }
    }
    (file_count, folder_count)
}

pub struct LocalFileService;

impl LocalFileService {
    /// Port of `listDirectory`.
    pub fn list_directory(&self, input_path: &str, home: &str) -> Result<Value, CoFinderError> {
        let requested = if input_path.trim().is_empty() {
            home.to_string()
        } else {
            input_path.trim().to_string()
        };
        let normalized = util::normalize_local_path(&requested);
        let meta = fs::metadata(&normalized)
            .map_err(|e| map_fs_error(&e, &normalized, "UNKNOWN", "Failed to access path"))?;
        if !meta.is_dir() {
            return Err(CoFinderError::new("NOT_DIRECTORY", format!("Path is not a directory: {normalized}")));
        }
        let mut entries: Vec<Value> = Vec::new();
        let read = fs::read_dir(&normalized).map_err(|e| map_fs_error(&e, &normalized, "UNKNOWN", "Failed to access path"))?;
        for dirent in read.flatten() {
            let name = dirent.file_name().to_string_lossy().into_owned();
            let full_path = PathBuf::from(&normalized).join(&name);
            let full_path_str = full_path.to_string_lossy().into_owned();
            let file_stats = match fs::symlink_metadata(&full_path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let etype = {
                let ft = file_stats.file_type();
                if ft.is_symlink() {
                    "symlink"
                } else if ft.is_dir() {
                    "directory"
                } else if ft.is_file() {
                    "file"
                } else {
                    "unknown"
                }
            };
            let owner = uid_of(&file_stats).map(|uid| resolve_local_owner_name(uid));
            entries.push(json!({
                "name": name,
                "fullPath": full_path_str,
                "type": etype,
                "size": file_stats.len(),
                "mtime": mtime_iso(&file_stats),
                "permissions": util::mode_to_rwx(file_stats.mode()),
                "owner": owner,
                "isHidden": name.starts_with('.')
            }));
        }
        Ok(json!({ "path": normalized, "entries": entries }))
    }

    /// Port of `getPathInfo`.
    pub fn get_path_info(&self, target_path: &str, include_directory_size: bool) -> Result<Value, CoFinderError> {
        let normalized = util::normalize_local_path(target_path);
        let stats = fs::symlink_metadata(&normalized).map_err(|e| map_fs_error(&e, &normalized, "INFO_FAILED", "Failed to get path info"))?;
        let etype = {
            let ft = stats.file_type();
            if ft.is_dir() {
                "directory"
            } else if ft.is_file() {
                "file"
            } else if ft.is_symlink() {
                "symlink"
            } else {
                "unknown"
            }
        };
        let size = if etype == "directory" && include_directory_size {
            directory_size(Path::new(&normalized)).unwrap_or(0)
        } else {
            stats.len()
        };
        let name = Path::new(&normalized)
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| normalized.clone());
        let owner = uid_of(&stats).map(|uid| resolve_local_owner_name(uid));
        let group = gid_of(&stats).map(|gid| gid.to_string());
        let mut counts = json!({});
        if etype == "directory" {
            let (file_count, folder_count) = directory_child_counts(Path::new(&normalized));
            counts = json!({ "fileCount": file_count, "folderCount": folder_count });
        }
        let mut info = json!({
            "name": name,
            "fullPath": normalized,
            "type": etype,
            "size": size,
            "mtime": mtime_iso(&stats),
            "permissions": util::mode_to_rwx(stats.mode()),
            "owner": owner,
            "group": group
        });
        if let Value::Object(ref mut map) = info {
            if let Value::Object(ref counts_map) = counts {
                for (k, v) in counts_map {
                    map.insert(k.clone(), v.clone());
                }
            }
        }
        Ok(info)
    }

    /// Port of `readTextFile`.
    pub fn read_text_file(&self, target_path: &str, byte_offset: Option<u64>, max_bytes: Option<u64>) -> Result<Value, CoFinderError> {
        let normalized = util::normalize_local_path(target_path);
        let byte_offset = byte_offset.unwrap_or(0);
        let max_bytes = max_bytes.unwrap_or(DEFAULT_TEXT_READ_BYTES).min(DEFAULT_TEXT_READ_BYTES);
        let stats = fs::symlink_metadata(&normalized).map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to read local text file"))?;
        if !stats.file_type().is_file() {
            return Err(CoFinderError::new("CONTENT_FAILED", "View Text supports files only."));
        }
        let chunk = read_file_chunk(&normalized, byte_offset, max_bytes)
            .map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to read local text file"))?;
        if byte_offset == 0 {
            let sample_end = TEXT_SNIFF_BYTES.min(chunk.len());
            if sniff_preview_kind(&chunk[..sample_end]) != Some("text") {
                return Err(CoFinderError::new("CONTENT_FAILED", "Selected file does not look like text."));
            }
        }
        let content = String::from_utf8_lossy(&chunk).into_owned();
        let next_byte_offset = byte_offset + chunk.len() as u64;
        Ok(json!({
            "path": normalized,
            "content": content,
            "byteOffset": byte_offset,
            "nextByteOffset": next_byte_offset,
            "size": stats.len(),
            "truncated": next_byte_offset < stats.len()
        }))
    }

    /// Port of `readTextWindow` (line window around a target line).
    pub fn read_text_window(&self, target_path: &str, target_line: u64, context_before: Option<u64>, context_after: Option<u64>) -> Result<Value, CoFinderError> {
        let normalized = util::normalize_local_path(target_path);
        let target_line = if target_line == 0 { 1 } else { target_line };
        let context_before = context_before.unwrap_or(80).min(500);
        let context_after = context_after.unwrap_or(80).min(500);
        let start_line = target_line.saturating_sub(context_before).max(1);
        let end_line = target_line + context_after;
        let stats = fs::symlink_metadata(&normalized).map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to read local text file"))?;
        if !stats.file_type().is_file() {
            return Err(CoFinderError::new("CONTENT_FAILED", "View Text supports files only."));
        }
        let content = fs::read_to_string(&normalized).map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to read local text file"))?;
        let all_lines: Vec<&str> = content.lines().collect();
        let mut lines: Vec<&str> = Vec::new();
        let mut truncated_after = false;
        let total = all_lines.len() as u64;
        for i in start_line..=end_line {
            if i > total {
                break;
            }
            lines.push(all_lines[(i - 1) as usize]);
        }
        if end_line < total {
            truncated_after = true;
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

    /// Port of `readPreviewFile` (text or image preview with sniffing).
    pub fn read_preview_file(&self, target_path: &str, max_text_bytes: Option<u64>, max_image_bytes: Option<u64>) -> Result<Value, CoFinderError> {
        let normalized = util::normalize_local_path(target_path);
        let max_text_bytes = max_text_bytes.unwrap_or(DEFAULT_TEXT_READ_BYTES).min(DEFAULT_TEXT_READ_BYTES);
        let max_image_bytes = max_image_bytes.unwrap_or(DEFAULT_IMAGE_PREVIEW_BYTES).min(DEFAULT_IMAGE_PREVIEW_BYTES);
        let stats = fs::symlink_metadata(&normalized).map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to read local preview file"))?;
        if !stats.file_type().is_file() {
            return Err(CoFinderError::new("CONTENT_FAILED", "Preview supports files only."));
        }
        let size = stats.len();
        let initial_bytes = (TEXT_SNIFF_BYTES.max(max_text_bytes as usize)).min(size.max(0) as usize).max(0);
        let initial_chunk = read_file_chunk(&normalized, 0, initial_bytes as u64)
            .map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to read local preview file"))?;
        let sample_end = TEXT_SNIFF_BYTES.min(initial_chunk.len());
        let kind = sniff_preview_kind(&initial_chunk[..sample_end]);
        match kind {
            Some("text") => {
                let end = max_text_bytes.min(initial_chunk.len() as u64) as usize;
                let content = String::from_utf8_lossy(&initial_chunk[..end]).into_owned();
                Ok(json!({
                    "path": normalized,
                    "kind": "text",
                    "size": size,
                    "content": content,
                    "truncated": max_text_bytes < size
                }))
            }
            Some("image") => {
                if size > max_image_bytes {
                    let mb = (max_image_bytes as f64 / 1024.0 / 1024.0).round() as u64;
                    return Err(CoFinderError::new("CONTENT_FAILED", format!("Image preview supports files up to {mb} MB.")));
                }
                let image_bytes = if initial_chunk.len() as u64 >= size {
                    initial_chunk[..size as usize].to_vec()
                } else {
                    read_file_chunk(&normalized, 0, size).map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to read local preview file"))?
                };
                let sample_end = TEXT_SNIFF_BYTES.min(image_bytes.len());
                let mime = sniff_image_mime_type(&image_bytes[..sample_end]).unwrap_or("application/octet-stream");
                let base64 = base64_engine::encode(&image_bytes);
                Ok(json!({
                    "path": normalized,
                    "kind": "image",
                    "size": size,
                    "mimeType": mime,
                    "imageDataUrl": format!("data:{mime};base64,{base64}"),
                    "truncated": false
                }))
            }
            _ => Err(CoFinderError::new("CONTENT_FAILED", "Selected file does not look like previewable text or image.")),
        }
    }

    /// Port of `searchText` (uses `rg`, falls back to `grep`).
    pub fn search_text(&self, target_path: &str, query: &str, max_matches: Option<u64>) -> Result<Value, CoFinderError> {
        let normalized = util::normalize_local_path(target_path);
        let trimmed = query.trim();
        let max_matches = max_matches.unwrap_or(200).min(200);
        if trimmed.is_empty() {
            return Err(CoFinderError::new("CONTENT_FAILED", "Search query is required."));
        }
        let meta = fs::symlink_metadata(&normalized).map_err(|e| map_fs_error(&e, &normalized, "CONTENT_FAILED", "Failed to search local text"))?;
        if !meta.file_type().is_file() && !meta.file_type().is_dir() {
            return Err(CoFinderError::new("CONTENT_FAILED", "Search Contents supports files and folders only."));
        }
        let is_dir = meta.file_type().is_dir();
        let (matches, truncated, tool) = run_local_text_search(&normalized, trimmed, is_dir, max_matches)?;
        Ok(json!({
            "query": trimmed,
            "rootPath": normalized,
            "matches": matches,
            "truncated": truncated,
            "tool": tool
        }))
    }

    /// Port of `touchPath` (utimes to now or parsed local timestamp).
    pub fn touch_path(&self, target_path: &str, timestamp: Option<&str>) -> Result<(), CoFinderError> {
        let normalized = util::normalize_local_path(target_path);
        let _meta = fs::symlink_metadata(&normalized).map_err(|e| map_fs_error(&e, &normalized, "TOUCH_FAILED", "Failed to touch path"))?;
        let system_time = match timestamp {
            Some(raw) => {
                let dt = util::parse_timestamp_input(raw)
                    .ok_or_else(|| CoFinderError::new("TOUCH_FAILED", "Timestamp must use YYYY-MM-DDTHH:mm:ss."))?;
                match chrono::Local.from_local_datetime(&dt) {
                    chrono::LocalResult::Single(t) => t.into(),
                    _ => return Err(CoFinderError::new("TOUCH_FAILED", "Timestamp is not a valid calendar date.")),
                }
            }
            None => std::time::SystemTime::now(),
        };
        std::fs::File::open(&normalized)
            .and_then(|f| f.set_times(std::fs::FileTimes::new().set_accessed(system_time).set_modified(system_time)))
            .map_err(|e| map_fs_error(&e, &normalized, "TOUCH_FAILED", "Failed to touch path"))
    }

    /// Port of `renamePath`.
    pub fn rename_path(&self, target_path: &str, new_name: &str) -> Result<String, CoFinderError> {
        let normalized = util::normalize_local_path(target_path);
        let trimmed = new_name.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
            return Err(CoFinderError::new("RENAME_FAILED", "New name is invalid."));
        }
        if trimmed.contains('/') || trimmed.contains('\\') {
            return Err(CoFinderError::new("RENAME_FAILED", "New name cannot contain path separators."));
        }
        let parent = Path::new(&normalized).parent().unwrap_or(Path::new("/"));
        let destination = util::normalize_local_path(&parent.join(trimmed).to_string_lossy());
        if destination == normalized {
            return Ok(normalized);
        }
        // Target must not already exist.
        match fs::symlink_metadata(&destination) {
            Ok(_) => return Err(CoFinderError::new("RENAME_FAILED", "A file or folder with the same name already exists.")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(map_fs_error(&e, &normalized, "RENAME_FAILED", "Failed to rename path")),
        }
        fs::rename(&normalized, &destination).map_err(|e| map_fs_error(&e, &normalized, "RENAME_FAILED", "Failed to rename path"))?;
        Ok(destination)
    }

    /// Port of `deletePaths`.
    pub fn delete_paths(&self, paths: &[String]) -> Result<u64, CoFinderError> {
        if paths.is_empty() {
            return Err(CoFinderError::new("DELETE_FAILED", "Select at least one local path to delete."));
        }
        let mut seen = std::collections::HashSet::new();
        let mut deleted = 0u64;
        for raw in paths {
            let target = util::normalize_local_path(raw);
            if !seen.insert(target.clone()) {
                continue;
            }
            let result = match fs::symlink_metadata(&target) {
                Ok(meta) => {
                    if meta.is_dir() {
                        fs::remove_dir_all(&target)
                    } else {
                        fs::remove_file(&target)
                    }
                }
                Err(_) => fs::remove_file(&target), // missing -> NotFound handled below
            };
            match result {
                Ok(_) => deleted += 1,
                Err(e) => return Err(map_fs_error(&e, &target, "DELETE_FAILED", "Failed to delete path")),
            }
        }
        Ok(deleted)
    }

    /// Port of `makeDirectory`.
    pub fn make_directory(&self, parent_path: &str, name: &str) -> Result<String, CoFinderError> {
        let parent = util::normalize_local_path(parent_path);
        let child_name = validate_new_child_name(name)?;
        let target = util::normalize_local_path(&Path::new(&parent).join(&child_name).to_string_lossy());
        fs::create_dir(&target).map_err(|e| map_fs_error(&e, &target, "UNKNOWN", "Failed to create path"))?;
        Ok(target)
    }

    /// Port of `createTextFile` (empty file, wx semantics; auto-names Untitled.txt).
    pub fn create_text_file(&self, parent_path: &str, name: Option<&str>) -> Result<String, CoFinderError> {
        let parent = util::normalize_local_path(parent_path);
        let target = match name {
            Some(n) if !n.trim().is_empty() => {
                let child_name = validate_new_child_name(n)?;
                util::normalize_local_path(&Path::new(&parent).join(&child_name).to_string_lossy())
            }
            _ => next_available_text_file(&parent)?,
        };
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create_new(true);
        opts.open(&target).map_err(|e| map_fs_error(&e, &target, "UNKNOWN", "Failed to create path"))?;
        Ok(target)
    }
}

mod base64_engine {
    pub fn encode(data: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(data)
    }
}

fn validate_new_child_name(name: &str) -> Result<String, CoFinderError> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.chars().any(|c| matches!(c, '\u{0}' | '\r' | '\n'))
    {
        return Err(CoFinderError::new("UNKNOWN", "Name is invalid."));
    }
    Ok(trimmed.to_string())
}

fn next_available_text_file(parent: &str) -> Result<String, CoFinderError> {
    for i in 1..1000u32 {
        let name = if i == 1 { "Untitled.txt".to_string() } else { format!("Untitled {i}.txt") };
        let candidate = util::normalize_local_path(&Path::new(parent).join(&name).to_string_lossy());
        if fs::symlink_metadata(&candidate).is_err() {
            return Ok(candidate);
        }
    }
    Err(CoFinderError::new("UNKNOWN", "Could not find an available text file name."))
}

fn parse_search_line(line: &str) -> Option<Value> {
    let (path, rest) = line.rsplit_once(':')?;
    let (path2, line_no) = path.rsplit_once(':')?;
    let line_num: u64 = line_no.parse().ok()?;
    Some(json!({ "path": path2, "line": line_num, "preview": rest }))
}

fn parse_search_output(output: &str, max_matches: u64, tool: &str) -> (Vec<Value>, bool, String) {
    let mut matches = Vec::new();
    let lines: Vec<&str> = output.split(['\r', '\n']).filter(|l| !l.is_empty()).collect();
    for line in &lines {
        if let Some(parsed) = parse_search_line(line) {
            matches.push(parsed);
            if matches.len() as u64 >= max_matches {
                break;
            }
        }
    }
    let truncated = lines.len() > matches.len();
    (matches, truncated, tool.to_string())
}

/// Port of `runLocalTextSearch`: try `rg`, fall back to `grep`.
fn run_local_text_search(target: &str, query: &str, is_dir: bool, max_matches: u64) -> Result<(Vec<Value>, bool, String), CoFinderError> {
    // rg first
    let rg_res = Command::new("rg")
        .args(["--line-number", "--with-filename", "--fixed-strings", "--no-heading", "--color", "never", "--", query, target])
        .output();
    if let Ok(out) = rg_res {
        if out.status.success() {
            let output = String::from_utf8_lossy(&out.stdout).into_owned();
            return Ok(parse_search_output(&output, max_matches, "rg"));
        } else if out.status.code() == Some(1) {
            // no matches -> empty
            return Ok((Vec::new(), false, "rg".to_string()));
        }
        // error with stdout still usable
        if !out.stdout.is_empty() {
            let output = String::from_utf8_lossy(&out.stdout).into_owned();
            return Ok(parse_search_output(&output, max_matches, "rg"));
        }
    }
    // grep fallback
    let grep_args: Vec<&str> = if is_dir {
        vec!["-R", "-n", "-H", "-F", "--", query, target]
    } else {
        vec!["-n", "-H", "-F", "--", query, target]
    };
    match Command::new("grep").args(&grep_args).output() {
        Ok(out) => {
            if out.status.success() {
                let output = String::from_utf8_lossy(&out.stdout).into_owned();
                Ok(parse_search_output(&output, max_matches, "grep"))
            } else if out.status.code() == Some(1) {
                Ok((Vec::new(), false, "grep".to_string()))
            } else {
                let output = String::from_utf8_lossy(&out.stdout).into_owned();
                if !output.is_empty() {
                    Ok(parse_search_output(&output, max_matches, "grep"))
                } else {
                    Err(CoFinderError::new("CONTENT_FAILED", "Failed to search local text."))
                }
            }
        }
        Err(_) => Err(CoFinderError::new("CONTENT_FAILED", "Failed to search local text.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Datelike;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cf-rs-localfs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn list_directory_basic() {
        let dir = temp_dir("list");
        std::fs::write(dir.join("a.txt"), "hello").unwrap();
        std::fs::create_dir(dir.join("sub")).unwrap();
        let svc = LocalFileService;
        let out = svc.list_directory(dir.to_str().unwrap(), "/").unwrap();
        assert_eq!(out["path"], dir.to_str().unwrap());
        let entries = out["entries"].as_array().unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"a.txt"));
        assert!(names.contains(&"sub"));
        let a = entries.iter().find(|e| e["name"] == "a.txt").unwrap();
        assert_eq!(a["type"], "file");
        assert_eq!(a["isHidden"], false);
        assert_eq!(a["size"], 5);
        assert_eq!(a["permissions"].as_str().unwrap().len(), 9);
    }

    #[test]
    fn list_directory_not_found_returns_error() {
        let svc = LocalFileService;
        let err = svc.list_directory("/definitely/not/here/xyz", "/").unwrap_err();
        assert_eq!(err.code, "NOT_FOUND");
    }

    #[test]
    fn get_path_info_file() {
        let dir = temp_dir("info");
        let f = dir.join("f.txt");
        std::fs::write(&f, "abcdef").unwrap();
        let svc = LocalFileService;
        let out = svc.get_path_info(f.to_str().unwrap(), true).unwrap();
        assert_eq!(out["type"], "file");
        assert_eq!(out["size"], 6);
        assert_eq!(out["name"], "f.txt");
    }

    #[test]
    fn read_text_file_sniffs_and_chunks() {
        let dir = temp_dir("text");
        let f = dir.join("t.txt");
        std::fs::write(&f, "line one\nline two\n").unwrap();
        let svc = LocalFileService;
        let out = svc.read_text_file(f.to_str().unwrap(), None, Some(10)).unwrap();
        assert_eq!(out["content"], "line one\nl");
        assert_eq!(out["byteOffset"], 0);
        assert_eq!(out["nextByteOffset"], 10);
        assert_eq!(out["truncated"], true);
    }

    #[test]
    fn read_text_file_rejects_binary() {
        let dir = temp_dir("bin");
        let f = dir.join("b.bin");
        std::fs::write(&f, [0u8, 1, 2, 3, 255, 0]).unwrap();
        let svc = LocalFileService;
        let err = svc.read_text_file(f.to_str().unwrap(), None, None).unwrap_err();
        assert_eq!(err.code, "CONTENT_FAILED");
    }

    #[test]
    fn read_text_window_lines() {
        let dir = temp_dir("win");
        let f = dir.join("w.txt");
        std::fs::write(&f, "a\nb\nc\nd\ne\n").unwrap();
        let svc = LocalFileService;
        let out = svc.read_text_window(f.to_str().unwrap(), 3, Some(1), Some(1)).unwrap();
        assert_eq!(out["startLine"], 2);
        assert_eq!(out["targetLine"], 3);
        assert_eq!(out["content"], "b\nc\nd");
        assert_eq!(out["truncatedBefore"], true);
        assert_eq!(out["truncatedAfter"], true);
    }

    #[test]
    fn read_preview_text() {
        let dir = temp_dir("pv");
        let f = dir.join("p.txt");
        std::fs::write(&f, "previewable text content\n").unwrap();
        let svc = LocalFileService;
        let out = svc.read_preview_file(f.to_str().unwrap(), Some(1000), None).unwrap();
        assert_eq!(out["kind"], "text");
        assert!(out["content"].as_str().unwrap().contains("previewable"));
    }

    #[test]
    fn read_preview_image_sniffs_png() {
        let dir = temp_dir("img");
        let f = dir.join("i.png");
        let png: Vec<u8> = vec![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];
        std::fs::write(&f, &png).unwrap();
        let svc = LocalFileService;
        let out = svc.read_preview_file(f.to_str().unwrap(), None, Some(1024 * 1024)).unwrap();
        assert_eq!(out["kind"], "image");
        assert_eq!(out["mimeType"], "image/png");
        assert!(out["imageDataUrl"].as_str().unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn touch_path_updates_mtime() {
        let dir = temp_dir("touch");
        let f = dir.join("t.txt");
        std::fs::write(&f, "x").unwrap();
        let before = std::fs::metadata(&f).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let svc = LocalFileService;
        svc.touch_path(f.to_str().unwrap(), None).unwrap();
        let after = std::fs::metadata(&f).unwrap().modified().unwrap();
        assert!(after > before);
    }

    #[test]
    fn touch_path_with_timestamp() {
        let dir = temp_dir("touch-ts");
        let f = dir.join("t.txt");
        std::fs::write(&f, "x").unwrap();
        let svc = LocalFileService;
        svc.touch_path(f.to_str().unwrap(), Some("2020-01-02T03:04:05")).unwrap();
        let meta = std::fs::metadata(&f).unwrap();
        let mtime = meta.modified().unwrap();
        let dt: chrono::DateTime<chrono::Utc> = mtime.into();
        // local-time interpretation; allow year/month/day check
        let local = dt.with_timezone(&chrono::Local);
        assert_eq!(local.year(), 2020);
        assert_eq!(local.month(), 1);
        assert_eq!(local.day(), 2);
    }

    #[test]
    fn rename_path_basic() {
        let dir = temp_dir("rename");
        let f = dir.join("a.txt");
        std::fs::write(&f, "x").unwrap();
        let svc = LocalFileService;
        let new_path = svc.rename_path(f.to_str().unwrap(), "b.txt").unwrap();
        assert!(new_path.ends_with("b.txt"));
        assert!(std::fs::metadata(&new_path).is_ok());
        assert!(std::fs::metadata(dir.join("a.txt")).is_err());
    }

    #[test]
    fn rename_path_rejects_invalid_names() {
        let dir = temp_dir("rename-invalid");
        let f = dir.join("a.txt");
        std::fs::write(&f, "x").unwrap();
        let svc = LocalFileService;
        let err = svc.rename_path(f.to_str().unwrap(), "a/b").unwrap_err();
        assert_eq!(err.code, "RENAME_FAILED");
        let err2 = svc.rename_path(f.to_str().unwrap(), "..").unwrap_err();
        assert_eq!(err2.code, "RENAME_FAILED");
    }

    #[test]
    fn rename_path_conflict_rejected() {
        let dir = temp_dir("rename-conflict");
        std::fs::write(dir.join("a.txt"), "x").unwrap();
        std::fs::write(dir.join("b.txt"), "y").unwrap();
        let svc = LocalFileService;
        let err = svc.rename_path(dir.join("a.txt").to_str().unwrap(), "b.txt").unwrap_err();
        assert_eq!(err.code, "RENAME_FAILED");
    }

    #[test]
    fn delete_paths_removes_file_and_dir() {
        let dir = temp_dir("delete");
        std::fs::write(dir.join("f.txt"), "x").unwrap();
        std::fs::create_dir(dir.join("sub")).unwrap();
        let svc = LocalFileService;
        let deleted = svc
            .delete_paths(&[dir.join("f.txt").to_string_lossy().into_owned(), dir.join("sub").to_string_lossy().into_owned()])
            .unwrap();
        assert_eq!(deleted, 2);
        assert!(std::fs::metadata(dir.join("f.txt")).is_err());
        assert!(std::fs::metadata(dir.join("sub")).is_err());
    }

    #[test]
    fn delete_paths_empty_is_error() {
        let svc = LocalFileService;
        let err = svc.delete_paths(&[]).unwrap_err();
        assert_eq!(err.code, "DELETE_FAILED");
    }

    #[test]
    fn make_directory_creates() {
        let dir = temp_dir("mkdir");
        let svc = LocalFileService;
        let created = svc.make_directory(dir.to_str().unwrap(), "newdir").unwrap();
        assert!(created.ends_with("newdir"));
        assert!(std::fs::metadata(&created).unwrap().is_dir());
    }

    #[test]
    fn make_directory_rejects_bad_names() {
        let dir = temp_dir("mkdir-bad");
        let svc = LocalFileService;
        let err = svc.make_directory(dir.to_str().unwrap(), "../escape").unwrap_err();
        assert_eq!(err.code, "UNKNOWN");
    }

    #[test]
    fn create_text_file_named_and_auto() {
        let dir = temp_dir("create");
        let svc = LocalFileService;
        let named = svc.create_text_file(dir.to_str().unwrap(), Some("hello.txt")).unwrap();
        assert!(named.ends_with("hello.txt"));
        assert!(std::fs::metadata(&named).unwrap().is_file());
        // Auto-name produces Untitled.txt then Untitled 2.txt
        let auto1 = svc.create_text_file(dir.to_str().unwrap(), None).unwrap();
        assert!(auto1.ends_with("Untitled.txt"));
        let auto2 = svc.create_text_file(dir.to_str().unwrap(), None).unwrap();
        assert!(auto2.ends_with("Untitled 2.txt"));
    }

    #[test]
    fn search_text_finds_matches_with_rg() {
        let dir = temp_dir("search");
        std::fs::write(dir.join("a.txt"), "apple pie\nbanana\n").unwrap();
        std::fs::write(dir.join("b.txt"), "no match here\n").unwrap();
        let svc = LocalFileService;
        let out = svc.search_text(dir.to_str().unwrap(), "apple", None).unwrap();
        assert_eq!(out["query"], "apple");
        assert_eq!(out["tool"], "rg");
        assert_eq!(out["matches"].as_array().unwrap().len(), 1);
        assert_eq!(out["matches"][0]["line"], 1);
        assert_eq!(out["matches"][0]["preview"], "apple pie");
    }

    #[test]
    fn search_text_no_matches_returns_empty() {
        let dir = temp_dir("search-none");
        std::fs::write(dir.join("a.txt"), "hello world\n").unwrap();
        let svc = LocalFileService;
        let out = svc.search_text(dir.to_str().unwrap(), "zzznomatch", None).unwrap();
        assert_eq!(out["matches"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn search_text_requires_query() {
        let dir = temp_dir("search-q");
        std::fs::write(dir.join("a.txt"), "x\n").unwrap();
        let svc = LocalFileService;
        let err = svc.search_text(dir.to_str().unwrap(), "   ", None).unwrap_err();
        assert_eq!(err.code, "CONTENT_FAILED");
    }
}
