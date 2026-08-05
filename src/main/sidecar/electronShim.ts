/**
 * Electron API shim for the Node sidecar.
 *
 * CoFinder's main-process services were written against Electron's `app`,
 * `ipcMain`, `BrowserWindow`, `clipboard`, `shell` and `safeStorage`. Under a
 * Tauri shell these APIs do not exist, so this module provides compatible
 * implementations backed by Node built-ins plus a line-delimited JSON protocol
 * over stdin/stdout that the Tauri (Rust) host understands.
 *
 * When the module is loaded inside a real Electron runtime (`process.versions.electron`),
 * it transparently re-exports the real Electron modules so the classic Electron dev
 * flow keeps working from the same source files.
 */
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const runningUnderElectron = typeof process !== "undefined" && Boolean(process.versions.electron);

let realElectron: any = null;
if (runningUnderElectron) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  realElectron = require("electron");
}

/* ------------------------------------------------------------------ */
/* stdout protocol                                                      */
/* ------------------------------------------------------------------ */

export interface SidecarOutgoing {
  writeLine(payload: Record<string, unknown>): void;
}

let writer: SidecarOutgoing = {
  writeLine() {
    // replaced by the sidecar entry once the transport is ready
  }
};

export function setSidecarWriter(next: SidecarOutgoing): void {
  writer = next;
}

function emitEvent(channel: string, payload: unknown): void {
  writer.writeLine({ type: "event", channel, payload });
}

/* ------------------------------------------------------------------ */
/* app (sidecar implementation)                                        */
/* ------------------------------------------------------------------ */

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function appDataPath(): string {
  return readEnv("COFINDER_APP_DATA") ?? path.join(os.homedir(), "Library", "Application Support");
}

const shimApp = {
  name: "CoFinder",
  getPath(name: string): string {
    switch (name) {
      case "userData":
        return readEnv("COFINDER_USER_DATA") ?? path.join(appDataPath(), "cofinder");
      case "temp":
        return os.tmpdir();
      case "home":
        return os.homedir();
      case "appData":
        return appDataPath();
      case "desktop":
        return path.join(os.homedir(), "Desktop");
      case "downloads":
        return path.join(os.homedir(), "Downloads");
      case "documents":
        return path.join(os.homedir(), "Documents");
      default:
        return os.homedir();
    }
  },
  getVersion(): string {
    return readEnv("COFINDER_APP_VERSION") ?? "1.9.10";
  },
  getAppPath(): string {
    return readEnv("COFINDER_APP_PATH") ?? process.cwd();
  },
  isPackaged: readEnv("COFINDER_PACKAGED") === "1",
  whenReady(): Promise<void> {
    return Promise.resolve();
  },
  on(): void {
    /* no-op */
  },
  once(): void {
    /* no-op */
  },
  quit(): void {
    /* no-op */
  },
  exit(): void {
    /* no-op */
  }
};

/* ------------------------------------------------------------------ */
/* ipcMain (sidecar implementation)                                    */
/* ------------------------------------------------------------------ */

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

const ipcHandlers = new Map<string, IpcHandler>();

const shimIpcMain = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(channel: string, listener: (event: any, ...args: any[]) => unknown): void {
    ipcHandlers.set(channel, listener as IpcHandler);
  },
  removeHandler(channel: string): void {
    ipcHandlers.delete(channel);
  }
};

export function getIpcHandler(channel: string): IpcHandler | undefined {
  return ipcHandlers.get(channel);
}

/* ------------------------------------------------------------------ */
/* BrowserWindow (sidecar implementation)                              */
/* ------------------------------------------------------------------ */

/** A virtual window whose `webContents.send` broadcasts events to the host. */
function createBroadcastWindow(): {
  webContents: { send(channel: string, payload: unknown): void };
} {
  return {
    webContents: {
      send(channel, payload) {
        emitEvent(channel, payload);
      }
    }
  };
}

/**
 * Virtual BrowserWindow used by the content-window code path.
 * Under the sidecar the actual window is owned by the Tauri host; the shim
 * only emits host signals (`sys: openContentWindow`) and lets the host decide
 * when the window is ready (a `contentReady` command on stdin triggers the
 * buffered `did-finish-load` callback).
 */
class ContentWindowShim {
  private closedCallbacks: Array<() => void> = [];
  private finishLoadCallbacks: Array<() => void> = [];
  private destroyed = false;
  private minimized = false;

  webContents = {
    send: (channel: string, payload: unknown) => emitEvent(channel, payload),
    once: (event: string, callback: () => void) => {
      if (event === "did-finish-load") this.finishLoadCallbacks.push(callback);
    }
  };

  constructor() {
    writer.writeLine({ type: "sys", action: "openContentWindow" });
  }

  on(event: string, callback: () => void): this {
    if (event === "closed") this.closedCallbacks.push(callback);
    return this;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
    this.closedCallbacks.forEach((cb) => cb());
  }

  isMinimized(): boolean {
    return this.minimized;
  }

  restore(): void {
    this.minimized = false;
  }

  show(): void {
    /* host controls visibility */
  }

  focus(): void {
    /* host controls focus */
  }

  loadURL(_url?: string): Promise<void> {
    return Promise.resolve();
  }

  /** Called by the sidecar entry when the host reports the window is ready. */
  fireFinishLoad(): void {
    const cbs = this.finishLoadCallbacks;
    this.finishLoadCallbacks = [];
    cbs.forEach((cb) => cb());
  }
}

type ShimBrowserWindowInstance = ContentWindowShim;

interface BrowserWindowConstructorOptions {
  width?: number;
  height?: number;
  [key: string]: unknown;
}

class ShimBrowserWindow {
  static getAllWindows(): Array<{ webContents: { send(channel: string, payload: unknown): void } }> {
    return [createBroadcastWindow()];
  }
  static getFocusedWindow(): { webContents: { send(channel: string, payload: unknown): void } } | null {
    return createBroadcastWindow();
  }
  static createContentWindow(): ShimBrowserWindowInstance {
    return new ContentWindowShim();
  }
  constructor(_options?: BrowserWindowConstructorOptions) {
    return new ContentWindowShim() as unknown as ShimBrowserWindow;
  }
  // Instance surface matching ContentWindowShim (the object actually returned).
  // Present so the service layer can typecheck against the real BrowserWindow API.
  webContents!: { send(channel: string, payload: unknown): void; once(event: string, cb: () => void): void };
  on(_event: string, _cb: () => void): this {
    return this;
  }
  isDestroyed(): boolean {
    return false;
  }
  destroy(): void {}
  isMinimized(): boolean {
    return false;
  }
  restore(): void {}
  show(): void {}
  focus(): void {}
  loadURL(_url?: string): Promise<void> {
    return Promise.resolve();
  }
  once(_event: string, _cb: () => void): this {
    return this;
  }
}

/* ------------------------------------------------------------------ */
/* clipboard (sidecar implementation)                                  */
/* ------------------------------------------------------------------ */

const shimClipboard = {
  writeText(text: string): void {
    const child = spawn("pbcopy");
    child.stdin.on("error", () => {
      /* ignore */
    });
    child.stdin.write(text);
    child.stdin.end();
  }
};

/* ------------------------------------------------------------------ */
/* shell (sidecar implementation)                                      */
/* ------------------------------------------------------------------ */

function runCommand(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { stdio: "ignore" });
    child.once("error", () => resolve(`Failed to launch ${binary}`));
    child.once("exit", (code) => resolve(code === 0 ? "" : `Command ${binary} exited with code ${String(code)}`));
  });
}

const shimShell = {
  openPath(fullPath: string): Promise<string> {
    return runCommand("open", [fullPath]);
  },
  showItemInFolder(fullPath: string): void {
    spawn("open", ["-R", fullPath], { stdio: "ignore" }).unref();
  },
  openExternal(_url: string): Promise<void> {
    return Promise.resolve();
  }
};

/* ------------------------------------------------------------------ */
/* safeStorage (sidecar implementation)                                */
/* ------------------------------------------------------------------ */

const KEYCHAIN_SERVICE = "com.wxzhou.cofinder";
const KEYCHAIN_ACCOUNT = "cofinder-safe-storage-key";

let cachedKey: Buffer | null = null;

/**
 * Returns a stable AES-256 key. Prefers the macOS login Keychain; falls back
 * to a 0600 file under userData when the `security` CLI is unavailable or the
 * keychain cannot be written (e.g. CI / non-interactive shell).
 */
import { execFileSync } from "node:child_process";

function readKeychainKey(): Buffer | null {
  try {
    const out = execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out ? Buffer.from(out, "base64") : null;
  } catch {
    return null;
  }
}

function writeKeychainKey(key: Buffer): boolean {
  try {
    execFileSync(
      "security",
      ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w", key.toString("base64")],
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }
    );
    return true;
  } catch {
    return false;
  }
}

function getOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fs = require("node:fs") as typeof import("node:fs");

  // Prefer the macOS login Keychain; fall back to a 0600 key file under userData.
  const keychainKey = readKeychainKey();
  if (keychainKey) {
    cachedKey = keychainKey;
    return keychainKey;
  }
  const keyFile = path.join(shimApp.getPath("userData"), "safe-storage.key");
  try {
    if (fs.existsSync(keyFile)) {
      const raw = fs.readFileSync(keyFile, "utf8").trim();
      if (raw) {
        cachedKey = Buffer.from(raw, "base64");
        return cachedKey;
      }
    }
  } catch {
    /* fall through to creation */
  }
  const key = crypto.randomBytes(32);
  if (!writeKeychainKey(key)) {
    try {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      fs.writeFileSync(keyFile, key.toString("base64"), { mode: 0o600 });
    } catch {
      /* key will be regenerated each launch in the worst case */
    }
  }
  cachedKey = key;
  return key;
}

function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptBuffer(payload: Buffer): Buffer {
  const key = getOrCreateKey();
  if (payload.length < 12 + 16) throw new Error("Encrypted payload is too short.");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

const shimSafeStorage = {
  isEncryptionAvailable(): boolean {
    return true;
  },
  encryptString(plainText: string): Buffer {
    return encryptBuffer(Buffer.from(plainText, "utf8"));
  },
  decryptString(encrypted: Buffer): string {
    return decryptBuffer(encrypted).toString("utf8");
  }
};

/* ------------------------------------------------------------------ */
/* powerMonitor / Menu (unused under the sidecar)                      */
/* ------------------------------------------------------------------ */

const shimPowerMonitor = {
  on(): void {
    /* no-op */
  }
};

const shimMenu = {
  setApplicationMenu(): void {
    /* no-op */
  },
  buildFromTemplate(): unknown {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Electron delegation                                                 */
/* ------------------------------------------------------------------ */

function select<T>(name: string, shimValue: T): T {
  if (runningUnderElectron && realElectron && typeof realElectron[name] !== "undefined") {
    return realElectron[name] as T;
  }
  return shimValue;
}

export const app = select("app", shimApp);
export const ipcMain = select("ipcMain", shimIpcMain);
export const BrowserWindow = select("BrowserWindow", ShimBrowserWindow);
export const clipboard = select("clipboard", shimClipboard);
export const shell = select("shell", shimShell);
export const safeStorage = select("safeStorage", shimSafeStorage);
export const powerMonitor = select("powerMonitor", shimPowerMonitor);
export const Menu = select("Menu", shimMenu);

export type IpcMainInvokeEvent = { sender: unknown };

export type BrowserWindowInstance = ShimBrowserWindow;

export function createContentWindowShim(): ContentWindowShim {
  return new ContentWindowShim();
}

export function flushContentWindow(callback: () => void): void {
  void callback;
}

export default {
  app,
  ipcMain,
  BrowserWindow,
  clipboard,
  shell,
  safeStorage,
  powerMonitor,
  Menu,
  getIpcHandler,
  createContentWindowShim
};
