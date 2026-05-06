/**
 * Minimal redaction for logs and IPC error details — never substitute security review.
 * Keys: password, passphrase, privateKey, token (case-insensitive on structured walks).
 */

const SENSITIVE_KEYS = /^(password|passphrase|privateKey|token)$/i;

const JSON_VALUE_PATTERN = (key: string): RegExp =>
  new RegExp(`("${escapeRegex(key)}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, "gi");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Redact common JSON / key=value patterns in free-form text (IPC detail, stderr snippets). */
export function redactSensitivePlaintext(text: string): string {
  if (!text) return text;
  let out = text;
  for (const key of ["password", "passphrase", "privateKey", "token"]) {
    out = out.replace(JSON_VALUE_PATTERN(key), '$1"<redacted>"');
    out = out.replace(new RegExp(`\\b${escapeRegex(key)}\\s*=\\s*\\S+`, "gi"), `${key}=<redacted>`);
  }
  return out;
}

/** Deep-walk plain objects and arrays for log payloads; leaves non-JSON types as-is. */
export function redactSensitiveStructured(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSensitivePlaintext(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitiveStructured);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = redactSensitiveStructured(v);
    }
  }
  return out;
}
