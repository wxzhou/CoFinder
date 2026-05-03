/**
 * Pure validation for embedded remote connect + Site Manager login (same rules).
 */

export type EmbeddedRemoteConnectValidationInput = {
  authType: "password" | "privateKey";
  host: string;
  username: string;
  port: number;
  passwordTyped: string;
  /** True when selected profile has a saved password in secure storage */
  hasStoredPassword: boolean;
};

export function validateEmbeddedRemoteConnectInput(
  input: EmbeddedRemoteConnectValidationInput
): { ok: true } | { ok: false; message: string } {
  if (input.authType === "privateKey") {
    return { ok: false, message: "Private key authentication is not supported yet." };
  }
  const host = input.host.trim();
  const username = input.username.trim();
  if (!host) {
    return { ok: false, message: "Host is required." };
  }
  if (!username) {
    return { ok: false, message: "Username is required." };
  }
  const port = input.port;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { ok: false, message: "Port must be between 1 and 65535." };
  }
  const pwd = input.passwordTyped.trim();
  if (!pwd && !input.hasStoredPassword) {
    return { ok: false, message: "Password is required, or choose a site with a saved password." };
  }
  return { ok: true };
}
