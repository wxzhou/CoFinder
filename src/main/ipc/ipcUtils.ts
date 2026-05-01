import path from "node:path";
import { posix as posixPath } from "node:path";
import type { IpcFailureResponse, IpcResponse, RemoteErrorCode } from "../../shared/types/ipc";

export class AppError extends Error {
  constructor(
    public readonly code: RemoteErrorCode,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

const SAFE_HOST_USER = /^[A-Za-z0-9._-]+$/;

export function ok<T>(data: T): IpcResponse<T> {
  return { ok: true, data };
}

export function fail(code: RemoteErrorCode, message: string, detail?: string): IpcFailureResponse {
  return { ok: false, error: { code, message, detail } };
}

export function toIpcError(error: unknown, fallbackCode: RemoteErrorCode, fallbackMessage: string): IpcFailureResponse {
  if (error instanceof AppError) return fail(error.code, error.message, error.detail);
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const rawCode = String((error as { code: unknown }).code);
    return fail(
      mapErrorCode(rawCode, fallbackCode),
      String((error as { message: unknown }).message),
      "detail" in error ? safeDetail((error as { detail?: unknown }).detail) : undefined
    );
  }
  return fail(fallbackCode, fallbackMessage);
}

export function asRecord(input: unknown, code: RemoteErrorCode, message: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new AppError(code, message);
  return input as Record<string, unknown>;
}

export function requiredString(
  value: unknown,
  field: string,
  code: RemoteErrorCode,
  message?: string,
  options?: { trim?: boolean; maxLength?: number }
): string {
  if (typeof value !== "string") throw new AppError(code, message ?? `${field} must be a string.`);
  const out = options?.trim === false ? value : value.trim();
  if (!out) throw new AppError(code, message ?? `${field} is required.`);
  if (options?.maxLength && out.length > options.maxLength) {
    throw new AppError(code, `${field} is too long.`);
  }
  return out;
}

export function optionalString(value: unknown, options?: { trim?: boolean }): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const next = options?.trim === false ? value : value.trim();
  return next || undefined;
}

export function requiredPort(value: unknown, code: RemoteErrorCode): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new AppError(code, "Port must be between 1 and 65535.");
  return n;
}

export function requiredHost(value: unknown, code: RemoteErrorCode): string {
  const host = requiredString(value, "Host", code);
  if (!SAFE_HOST_USER.test(host)) throw new AppError(code, "Host contains unsupported characters.");
  return host;
}

export function requiredUsername(value: unknown, code: RemoteErrorCode): string {
  const username = requiredString(value, "Username", code);
  if (!SAFE_HOST_USER.test(username)) throw new AppError(code, "Username contains unsupported characters.");
  return username;
}

export function requiredId(value: unknown, field: string, code: RemoteErrorCode): string {
  return requiredString(value, field, code, `${field} is required.`);
}

export function validateLocalPathInput(value: unknown, code: RemoteErrorCode, field = "Path"): string {
  const localPath = requiredString(value, field, code);
  if (/\u0000|\n|\r/.test(localPath)) throw new AppError(code, `${field} contains unsupported characters.`);
  return path.resolve(localPath);
}

export function normalizeRemotePathInput(value: unknown, code: RemoteErrorCode, field = "Remote path"): string {
  const source = requiredString(value, field, code);
  if (/\u0000|\n|\r/.test(source)) throw new AppError(code, `${field} contains unsupported characters.`);
  const normalized = posixPath.normalize(source);
  if (normalized === ".") return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function safeDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  const text = String(detail);
  return text.slice(0, 500);
}

function mapErrorCode(rawCode: string, fallbackCode: RemoteErrorCode): RemoteErrorCode {
  if (rawCode === "NOT_FOUND") return "LOCAL_NOT_FOUND";
  if (rawCode === "PERMISSION_DENIED") return "LOCAL_PERMISSION_DENIED";
  if (rawCode === "NOT_DIRECTORY") return "LOCAL_NOT_DIRECTORY";
  if (rawCode === "OPEN_FAILED") return "LOCAL_OPEN_FAILED";
  if (rawCode === "RENAME_FAILED") return "LOCAL_RENAME_FAILED";
  if (rawCode === "DELETE_FAILED") return "LOCAL_DELETE_FAILED";
  if (rawCode === "UNKNOWN") return "LOCAL_UNKNOWN_ERROR";
  return rawCode as RemoteErrorCode;
}
