import { describe, expect, it } from "vitest";
import { validateEmbeddedRemoteConnectInput } from "../src/renderer/embeddedRemoteConnect";

describe("validateEmbeddedRemoteConnectInput", () => {
  it("rejects private key auth", () => {
    const r = validateEmbeddedRemoteConnectInput({
      authType: "privateKey",
      host: "h",
      username: "u",
      port: 22,
      passwordTyped: "",
      hasStoredPassword: false
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not supported/i);
  });

  it("requires host and username", () => {
    expect(
      validateEmbeddedRemoteConnectInput({
        authType: "password",
        host: "  ",
        username: "u",
        port: 22,
        passwordTyped: "x",
        hasStoredPassword: false
      }).ok
    ).toBe(false);
    expect(
      validateEmbeddedRemoteConnectInput({
        authType: "password",
        host: "h",
        username: "  ",
        port: 22,
        passwordTyped: "x",
        hasStoredPassword: false
      }).ok
    ).toBe(false);
  });

  it("requires password when no stored password", () => {
    const r = validateEmbeddedRemoteConnectInput({
      authType: "password",
      host: "h",
      username: "u",
      port: 22,
      passwordTyped: "",
      hasStoredPassword: false
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Password is required/i);
  });

  it("allows empty password when stored password exists", () => {
    expect(
      validateEmbeddedRemoteConnectInput({
        authType: "password",
        host: "h",
        username: "u",
        port: 22,
        passwordTyped: "",
        hasStoredPassword: true
      }).ok
    ).toBe(true);
  });

  it("validates port range", () => {
    expect(
      validateEmbeddedRemoteConnectInput({
        authType: "password",
        host: "h",
        username: "u",
        port: 0,
        passwordTyped: "p",
        hasStoredPassword: false
      }).ok
    ).toBe(false);
  });
});
