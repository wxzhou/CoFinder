export type BatchRenameMode = "replace" | "add" | "format";
export type BatchRenameAddPosition = "before" | "after";

export type BatchRenameEntry = {
  fullPath: string;
  name: string;
};

export type BatchRenameOptions = {
  mode: BatchRenameMode;
  applyToExtension: boolean;
  findText: string;
  replaceText: string;
  addText: string;
  addPosition: BatchRenameAddPosition;
  formatBaseName: string;
  formatStartNumber: number;
  formatPadding: number;
};

export type BatchRenamePreviewItem = {
  fullPath: string;
  originalName: string;
  newName: string;
  changed: boolean;
};

export const DEFAULT_BATCH_RENAME_OPTIONS: BatchRenameOptions = {
  mode: "replace",
  applyToExtension: false,
  findText: "",
  replaceText: "",
  addText: "",
  addPosition: "after",
  formatBaseName: "File",
  formatStartNumber: 1,
  formatPadding: 2
};

export function buildBatchRenamePreview(entries: BatchRenameEntry[], options: BatchRenameOptions): BatchRenamePreviewItem[] {
  return entries.map((entry, index) => {
    const parts = splitProtectedExtension(entry.name, options.applyToExtension);
    const body = options.applyToExtension ? entry.name : parts.base;
    let nextBody = body;
    if (options.mode === "replace") {
      nextBody = options.findText ? body.split(options.findText).join(options.replaceText) : body;
    } else if (options.mode === "add") {
      nextBody = options.addPosition === "before" ? `${options.addText}${body}` : `${body}${options.addText}`;
    } else {
      const start = Number.isFinite(options.formatStartNumber) ? Math.trunc(options.formatStartNumber) : 1;
      const padding = Math.max(0, Math.trunc(options.formatPadding || 0));
      const number = String(start + index).padStart(padding, "0");
      const base = options.formatBaseName.trim() || "File";
      nextBody = `${base}-${number}`;
    }
    const newName = options.applyToExtension ? nextBody : `${nextBody}${parts.extension}`;
    return {
      fullPath: entry.fullPath,
      originalName: entry.name,
      newName,
      changed: newName !== entry.name
    };
  });
}

export function validateBatchRenamePlan(plan: BatchRenamePreviewItem[], visibleEntries: BatchRenameEntry[]): string[] {
  const errors = new Set<string>();
  const seen = new Map<string, string>();
  const selectedPaths = new Set(plan.map((item) => item.fullPath));
  const visibleNames = new Map(
    visibleEntries
      .filter((entry) => !selectedPaths.has(entry.fullPath))
      .map((entry) => [entry.name.toLocaleLowerCase(), entry.name])
  );

  for (const item of plan) {
    const newName = item.newName.trim();
    if (!newName) {
      errors.add("New names cannot be empty.");
      continue;
    }
    if (/[/:\\\x00-\x1f]/.test(newName)) {
      errors.add("New names cannot contain path separators or control characters.");
    }
    const key = newName.toLocaleLowerCase();
    if (seen.has(key)) {
      errors.add(`Duplicate new name: ${newName}.`);
    }
    seen.set(key, item.fullPath);
    const collision = visibleNames.get(key);
    if (collision) {
      errors.add(`Name already exists in this folder: ${collision}.`);
    }
  }

  return Array.from(errors);
}

function splitProtectedExtension(name: string, applyToExtension: boolean): { base: string; extension: string } {
  if (applyToExtension) return { base: name, extension: "" };
  const lower = name.toLowerCase();
  if (lower.endsWith(".tar.gz")) return { base: name.slice(0, -7), extension: name.slice(-7) };
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return { base: name, extension: "" };
  return { base: name.slice(0, lastDot), extension: name.slice(lastDot) };
}
