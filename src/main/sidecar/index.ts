/**
 * CoFinder Node sidecar entry point.
 *
 * Runs the existing Electron-era main-process services (`registerIpcHandlers`)
 * inside a plain Node process, speaking a line-delimited JSON protocol over
 * stdin/stdout to the Tauri (Rust) host:
 *
 *   stdin:  {"id": 1, "channel": "local:listDirectory", "request": {...}}
 *   stdout: {"id": 1, "response": {"ok": true, "data": ...}}
 *           {"id": 1, "response": {"ok": false, "error": {...}}}
 *           {"type": "event", "channel": "transfer:onUpdate", "payload": {...}}
 *           {"type": "sys", "action": "openContentWindow"}
 *
 * The Rust host also drives the content-window lifecycle:
 *   stdin:  {"type": "sys", "action": "contentReady"}
 */
import { registerIpcHandlers, shutdownMainProcessResources } from "../ipc/registerIpcHandlers";
import { setSidecarWriter, getIpcHandler, createContentWindowShim } from "./electronShim";
import readline from "node:readline";

type IncomingMessage = {
  id?: number;
  type?: string;
  action?: string;
  channel?: string;
  request?: unknown;
};

function writeLine(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

let contentWindowShim: ReturnType<typeof createContentWindowShim> | null = null;

function openContentWindow(): void {
  if (!contentWindowShim) contentWindowShim = createContentWindowShim();
  contentWindowShim.show();
  contentWindowShim.focus();
}

function handleContentReady(): void {
  contentWindowShim?.fireFinishLoad();
}

async function dispatch(msg: IncomingMessage): Promise<void> {
  if (msg.id === undefined || typeof msg.channel !== "string") {
    if (msg.type === "sys") {
      if (msg.action === "contentReady") handleContentReady();
    }
    return;
  }
  const handler = getIpcHandler(msg.channel);
  if (!handler) {
    writeLine({
      id: msg.id,
      response: { ok: false, error: { code: "UNKNOWN", message: `No handler for channel: ${msg.channel}` } }
    });
    return;
  }
  try {
    const response = await handler({ sender: {} }, msg.request);
    writeLine({ id: msg.id, response: response ?? { ok: true, data: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine({
      id: msg.id,
      response: { ok: false, error: { code: "UNKNOWN", message } }
    });
  }
}

let inFlight = 0;
let flushWait: Promise<void> | null = null;

function trackDispatch(promise: Promise<void>): void {
  inFlight += 1;
  promise.finally(() => {
    inFlight -= 1;
  });
}

function waitForIdle(): Promise<void> {
  if (inFlight === 0) return Promise.resolve();
  if (!flushWait) {
    flushWait = new Promise((resolve) => {
      const check = (): void => {
        if (inFlight === 0) {
          flushWait = null;
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }
  return flushWait;
}

async function main(): Promise<void> {
  setSidecarWriter({ writeLine });

  registerIpcHandlers();

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(line) as IncomingMessage;
    } catch {
      return;
    }
    trackDispatch(dispatch(msg));
  });

  const shutdown = async (): Promise<void> => {
    try {
      await waitForIdle();
      await shutdownMainProcessResources();
    } finally {
      process.exit(0);
    }
  };

  rl.on("close", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}

void main();
