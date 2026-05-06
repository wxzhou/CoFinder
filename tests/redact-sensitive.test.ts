import { describe, expect, it } from "vitest";
import { redactSensitivePlaintext, redactSensitiveStructured } from "../src/main/security/redactSensitive";

describe("redactSensitivePlaintext", () => {
  it("redacts JSON-like sensitive keys", () => {
    const s = '{"password":"secret123","host":"h.example.com"}';
    expect(redactSensitivePlaintext(s)).toContain("<redacted>");
    expect(redactSensitivePlaintext(s)).not.toContain("secret123");
  });

  it("redacts token and privateKey patterns", () => {
    expect(redactSensitivePlaintext('{"token":"abc","privateKey":"-----BEGIN"}')).not.toContain("abc");
    expect(redactSensitivePlaintext('{"token":"abc","privateKey":"-----BEGIN"}')).not.toContain("BEGIN");
  });

  it("redacts passphrase key=value style", () => {
    expect(redactSensitivePlaintext("passphrase=hunter2 extra")).not.toContain("hunter2");
  });
});

describe("redactSensitiveStructured", () => {
  it("redacts sensitive object keys recursively", () => {
    const out = redactSensitiveStructured({
      nested: { Password: "x", token: "y" },
      ok: "visible"
    }) as Record<string, unknown>;
    expect(out.ok).toBe("visible");
    const nested = out.nested as Record<string, unknown>;
    expect(nested.Password).toBe("[redacted]");
    expect(nested.token).toBe("[redacted]");
  });

  it("redacts strings in nested values", () => {
    const out = redactSensitiveStructured({ msg: '{"password":"z"}' }) as { msg: string };
    expect(out.msg).not.toContain("z");
  });
});
