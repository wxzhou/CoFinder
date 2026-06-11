import type { EntryType } from "../../shared/types/models";

export type FileIconKind =
  | "folder"
  | "symlink"
  | "text"
  | "code"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "image"
  | "archive"
  | "data"
  | "executable"
  | "other";

export type FileIconDescriptor = {
  kind: FileIconKind;
  label: string;
};

const EXTENSION_KIND: Record<string, FileIconDescriptor> = {
  txt: { kind: "text", label: "TXT" },
  md: { kind: "text", label: "MD" },
  log: { kind: "text", label: "LOG" },
  py: { kind: "code", label: "PY" },
  r: { kind: "code", label: "R" },
  m: { kind: "code", label: "M" },
  sh: { kind: "code", label: "SH" },
  bash: { kind: "code", label: "SH" },
  zsh: { kind: "code", label: "SH" },
  js: { kind: "code", label: "JS" },
  jsx: { kind: "code", label: "JSX" },
  ts: { kind: "code", label: "TS" },
  tsx: { kind: "code", label: "TSX" },
  cpp: { kind: "code", label: "C++" },
  c: { kind: "code", label: "C" },
  h: { kind: "code", label: "H" },
  json: { kind: "code", label: "JSON" },
  yaml: { kind: "code", label: "YAML" },
  yml: { kind: "code", label: "YAML" },
  html: { kind: "code", label: "HTML" },
  css: { kind: "code", label: "CSS" },
  pdf: { kind: "pdf", label: "PDF" },
  doc: { kind: "document", label: "DOC" },
  docx: { kind: "document", label: "DOCX" },
  pages: { kind: "document", label: "DOC" },
  xls: { kind: "spreadsheet", label: "XLS" },
  xlsx: { kind: "spreadsheet", label: "XLSX" },
  numbers: { kind: "spreadsheet", label: "NUM" },
  ppt: { kind: "presentation", label: "PPT" },
  pptx: { kind: "presentation", label: "PPTX" },
  key: { kind: "presentation", label: "KEY" },
  png: { kind: "image", label: "PNG" },
  jpg: { kind: "image", label: "JPG" },
  jpeg: { kind: "image", label: "JPEG" },
  gif: { kind: "image", label: "GIF" },
  tif: { kind: "image", label: "TIF" },
  tiff: { kind: "image", label: "TIFF" },
  svg: { kind: "image", label: "SVG" },
  zip: { kind: "archive", label: "ZIP" },
  gz: { kind: "archive", label: "GZ" },
  tgz: { kind: "archive", label: "TGZ" },
  tar: { kind: "archive", label: "TAR" },
  rar: { kind: "archive", label: "RAR" },
  "7z": { kind: "archive", label: "7Z" },
  csv: { kind: "data", label: "CSV" },
  tsv: { kind: "data", label: "TSV" },
  bam: { kind: "data", label: "BAM" },
  sam: { kind: "data", label: "SAM" },
  fastq: { kind: "data", label: "FQ" },
  fq: { kind: "data", label: "FQ" },
  fasta: { kind: "data", label: "FA" },
  fa: { kind: "data", label: "FA" },
  vcf: { kind: "data", label: "VCF" },
  bed: { kind: "data", label: "BED" },
  exe: { kind: "executable", label: "EXE" },
  app: { kind: "executable", label: "APP" },
  dmg: { kind: "archive", label: "DMG" }
};

export function classifyFileIcon(entry: { name: string; type: EntryType }): FileIconDescriptor {
  if (entry.type === "directory") return { kind: "folder", label: "" };
  if (entry.type === "symlink") return { kind: "symlink", label: "LINK" };
  const ext = extensionForName(entry.name);
  if (!ext) return { kind: "other", label: "OTHER" };
  return EXTENSION_KIND[ext] ?? { kind: "other", label: ext.slice(0, 5).toUpperCase() };
}

function extensionForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tar.gz")) return "tgz";
  const lastDot = lower.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === lower.length - 1) return "";
  return lower.slice(lastDot + 1);
}

