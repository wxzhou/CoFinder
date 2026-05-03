import type { ServerProfile } from "../shared/types/models";

export function profilePrimaryLabel(profile: ServerProfile): string {
  if (profile.alias.trim()) return profile.alias.trim();
  return `${profile.username}@${profile.host}:${profile.port}`;
}
