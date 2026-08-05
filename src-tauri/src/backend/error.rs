//! Backend error type mapped to the shared IPC failure contract:
//! `{ ok: false, error: { code, message, detail? } }`.

use serde_json::json;

/// CoFinder backend error. `code` mirrors the TS `RemoteErrorCode` strings the
/// renderer switches on, so the React UI behaves identically.
#[derive(Debug, Clone)]
pub struct CoFinderError {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
}

impl CoFinderError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    /// Serializes to the `{ code, message, detail? }` failure payload.
    pub fn to_json(&self) -> serde_json::Value {
        match &self.detail {
            Some(detail) => json!({ "code": self.code, "message": self.message, "detail": detail }),
            None => json!({ "code": self.code, "message": self.message }),
        }
    }
}

impl std::fmt::Display for CoFinderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for CoFinderError {}

/// Convenience constructors for common error codes.
#[allow(dead_code)]
impl CoFinderError {
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new("INVALID_INPUT", message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("NOT_FOUND", message)
    }

    pub fn unknown(message: impl Into<String>) -> Self {
        Self::new("UNKNOWN", message)
    }
}
