import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { registerIpcHandlers, shutdownMainProcessResources } from "./ipc/registerIpcHandlers";

const isDev = !app.isPackaged;
const debugPackaged = process.env.COFINDER_DEBUG === "1";
let processDiagnosticsRegistered = false;

function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "../preload/index.js");
  const indexPath = path.join(__dirname, "../../dist/index.html");
  logBoot("window-paths", {
    isDev,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    dirname: __dirname,
    preloadPath,
    preloadExists: fs.existsSync(preloadPath),
    indexPath,
    indexExists: fs.existsSync(indexPath)
  });

  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  wireWebContentsDiagnostics(mainWindow);

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    void mainWindow.loadFile(indexPath);
    if (debugPackaged) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  }

  return mainWindow;
}

app.whenReady().then(() => {
  registerProcessDiagnostics();
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let isShuttingDown = false;

async function shutdownAndExit(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    await shutdownMainProcessResources();
  } finally {
    app.exit(0);
  }
}

app.on("before-quit", (event) => {
  if (isShuttingDown) return;
  event.preventDefault();
  void shutdownAndExit();
});

app.on("will-quit", (event) => {
  if (isShuttingDown) return;
  event.preventDefault();
  void shutdownAndExit();
});

function logBoot(message: string, payload?: Record<string, unknown>): void {
  const prefix = "[CoFinder:main]";
  if (payload) console.info(prefix, message, payload);
  else console.info(prefix, message);
  try {
    const line = `${new Date().toISOString()} ${prefix} ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}\n`;
    const userDataPath = safeGetUserDataPath();
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.appendFileSync(path.join(userDataPath, "main.log"), line, "utf8");
  } catch {
    // no-op: diagnostics must not crash app bootstrap
  }
}

function safeGetUserDataPath(): string {
  try {
    return app.getPath("userData");
  } catch {
    return path.join(process.cwd(), ".cofinder-debug");
  }
}

function registerProcessDiagnostics(): void {
  if (processDiagnosticsRegistered) return;
  processDiagnosticsRegistered = true;
  process.on("uncaughtException", (error) => {
    logBoot("uncaughtException", { message: error.message, stack: error.stack });
  });
  process.on("unhandledRejection", (reason) => {
    logBoot("unhandledRejection", { reason: String(reason) });
  });
}

function wireWebContentsDiagnostics(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logBoot("did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logBoot("render-process-gone", {
      reason: details.reason,
      exitCode: details.exitCode
    });
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logBoot("renderer-console", { level, message, line, sourceId });
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    logBoot("preload-error", { preloadPath, error: error.message });
  });
}
