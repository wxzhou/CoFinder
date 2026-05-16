export type PermissionRights = {
  user?: string;
  group?: string;
  other?: string;
};

export function modeToRwx(mode: number): string {
  const perm = mode & 0o777;
  const chunks = [(perm >> 6) & 0b111, (perm >> 3) & 0b111, perm & 0b111];
  return chunks.map((chunk) => rightsChunkToRwx(chunk)).join("");
}

export function rightsToRwx(rights: PermissionRights): string {
  return `${symbolicRightsToTriplet(rights.user)}${symbolicRightsToTriplet(rights.group)}${symbolicRightsToTriplet(rights.other)}`;
}

function rightsChunkToRwx(chunk: number): string {
  return `${chunk & 0b100 ? "r" : "-"}${chunk & 0b010 ? "w" : "-"}${chunk & 0b001 ? "x" : "-"}`;
}

function symbolicRightsToTriplet(value: string | undefined): string {
  const raw = value ?? "";
  return `${raw.includes("r") ? "r" : "-"}${raw.includes("w") ? "w" : "-"}${raw.includes("x") ? "x" : "-"}`;
}
