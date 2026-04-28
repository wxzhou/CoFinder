import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";

const isDev = !app.isPackaged;

function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "../preload/index.js");

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

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
  } else {
    const indexPath = path.join(__dirname, "../../dist/index.html");
    void mainWindow.loadFile(indexPath);
  }

  return mainWindow;
}

app.whenReady().then(() => {
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
