const FALLBACK_PATH_SEGMENTS = ["/usr/bin", "/bin", "/usr/sbin", "/sbin", "/opt/homebrew/bin", "/usr/local/bin"];

export function buildProcessEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const mergedSegments: string[] = [];
  const seen = new Set<string>();
  const current = (baseEnv.PATH ?? "").split(":").filter(Boolean);
  for (const seg of [...current, ...FALLBACK_PATH_SEGMENTS]) {
    if (seen.has(seg)) continue;
    seen.add(seg);
    mergedSegments.push(seg);
  }
  return { ...baseEnv, PATH: mergedSegments.join(":") };
}
