/** Build cumulative POSIX path segments for Finder-like path bar (includes root `/`). */
export function pathToSegments(absolutePath: string): { label: string; path: string }[] {
  const normalized = (absolutePath || "").replace(/\/+/g, "/") || "/";
  if (normalized === "/") {
    return [{ label: "/", path: "/" }];
  }
  const parts = normalized.split("/").filter(Boolean);
  const out: { label: string; path: string }[] = [{ label: "/", path: "/" }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    out.push({ label: p, path: acc });
  }
  return out;
}
