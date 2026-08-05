//! Shared small helpers for the Rust local/remote file services.
//! Ports of `permissionDisplay.ts`, `pathSafety.ts`, and `timestampInput.ts`.

/// Render a Unix mode's permission bits as an rwx triplet (port of `modeToRwx`).
pub fn mode_to_rwx(mode: u32) -> String {
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

/// Resolve an absolute local path (port of `path.resolve` for the POSIX macOS case).
pub fn normalize_local_path(input: &str) -> String {
    let p = std::path::Path::new(input);
    if p.is_absolute() {
        p.to_string_lossy().into_owned()
    } else {
        match std::env::current_dir() {
            Ok(cwd) => cwd.join(p).to_string_lossy().into_owned(),
            Err(_) => input.to_string(),
        }
    }
}

/// Parse `YYYY-MM-DDTHH:mm:ss` into a naive datetime, port of `parseTimestampInput`.
/// Returns `None` when invalid.
pub fn parse_timestamp_input(value: &str) -> Option<chrono::NaiveDateTime> {
    use chrono::{Datelike, NaiveDate, Timelike};
    let parts: Vec<&str> = value.split(['-', 'T', ':']).collect();
    if parts.len() != 6 {
        return None;
    }
    let y: i32 = parts[0].parse().ok()?;
    let mo: u32 = parts[1].parse().ok()?;
    let d: u32 = parts[2].parse().ok()?;
    let h: u32 = parts[3].parse().ok()?;
    let mi: u32 = parts[4].parse().ok()?;
    let s: u32 = parts[5].parse().ok()?;
    let date = NaiveDate::from_ymd_opt(y, mo, d)?;
    let dt = date.and_hms_opt(h, mi, s)?;
    // Reject impossible rollovers (e.g. month 13 -> Jan next year) by checking
    // the components round-trip, matching the TS calendar validation.
    if dt.year() != y || dt.month() != mo || dt.day() != d || dt.hour() != h || dt.minute() != mi || dt.second() != s {
        return None;
    }
    Some(dt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Timelike};

    #[test]
    fn mode_to_rwx_renders_triplets() {
        assert_eq!(mode_to_rwx(0o644), "rw-r--r--");
        assert_eq!(mode_to_rwx(0o755), "rwxr-xr-x");
        assert_eq!(mode_to_rwx(0o600), "rw-------");
        assert_eq!(mode_to_rwx(0o777), "rwxrwxrwx");
    }

    #[test]
    fn timestamp_parse_valid() {
        let dt = parse_timestamp_input("2024-05-06T10:20:30").expect("valid");
        assert_eq!(dt.year(), 2024);
        assert_eq!(dt.month(), 5);
        assert_eq!(dt.day(), 6);
        assert_eq!(dt.hour(), 10);
    }

    #[test]
    fn timestamp_parse_invalid_forms() {
        assert!(parse_timestamp_input("2024-13-01T00:00:00").is_none());
        assert!(parse_timestamp_input("not-a-date").is_none());
        assert!(parse_timestamp_input("2024-02-30T00:00:00").is_none());
    }
}
