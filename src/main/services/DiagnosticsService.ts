import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { redactSensitivePlaintext } from "../security/redactSensitive";
import { buildProcessEnv } from "../utils/processEnv";
import type { DiagnosticsBundle, ToolAvailability } from "../../shared/types/ipc";

export type DiagnosticsServiceOptions = {
  version: string;
  userDataPath: string;
  logFilePath: string;
  platform?: NodeJS.Platform;
  arch?: string;
};

export class DiagnosticsService {
  constructor(private readonly options: DiagnosticsServiceOptions) {}

  async buildBundle(): Promise<DiagnosticsBundle> {
    const [ssh, rsync, logFileExists] = await Promise.all([
      checkToolAvailability("ssh"),
      checkToolAvailability("rsync"),
      fileExists(this.options.logFilePath)
    ]);
    return {
      generatedAt: new Date().toISOString(),
      appVersion: this.options.version,
      platform: this.options.platform ?? process.platform,
      arch: this.options.arch ?? process.arch,
      userDataPath: this.options.userDataPath,
      logFilePath: this.options.logFilePath,
      logFileExists,
      tools: { ssh, rsync },
      updatePolicy: {
        mode: "manual-github-release",
        status: "Auto-update install is not enabled in this build. Check GitHub Releases manually until signing/notarization is configured."
      }
    };
  }

  async buildClipboardText(): Promise<string> {
    return formatDiagnosticsBundle(await this.buildBundle());
  }
}

export function formatDiagnosticsBundle(bundle: DiagnosticsBundle): string {
  const lines = [
    "CoFinder Diagnostics",
    `generatedAt: ${bundle.generatedAt}`,
    `appVersion: ${bundle.appVersion}`,
    `platform: ${bundle.platform}`,
    `arch: ${bundle.arch}`,
    `userDataPath: ${bundle.userDataPath}`,
    `logFilePath: ${bundle.logFilePath}`,
    `logFileExists: ${bundle.logFileExists ? "yes" : "no"}`,
    `ssh: ${formatTool(bundle.tools.ssh)}`,
    `rsync: ${formatTool(bundle.tools.rsync)}`,
    `updates: ${bundle.updatePolicy.status}`
  ];
  return redactSensitivePlaintext(`${lines.join("\n")}\n`);
}

async function checkToolAvailability(command: "ssh" | "rsync"): Promise<ToolAvailability> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--version"], {
      env: buildProcessEnv(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let settled = false;
    let output = "";
    const finish = (available: boolean, detail?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      resolve({ available, detail: detail ? redactSensitivePlaintext(detail.slice(0, 180)) : undefined });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(false, "version check timed out");
    }, 1500);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", (error) => finish(false, error.message));
    child.once("close", (code) => finish(code === 0, firstLine(output) || `exit ${code ?? "unknown"}`));
  });
}

function firstLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function formatTool(tool: ToolAvailability): string {
  return `${tool.available ? "available" : "missing"}${tool.detail ? ` (${tool.detail})` : ""}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.resolve(filePath));
    return stat.isFile();
  } catch {
    return false;
  }
}
