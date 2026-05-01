#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}

const userData =
  parseArg("--user-data") ||
  process.env.COFINDER_USER_DATA ||
  path.join(process.env.HOME || "", "Library", "Application Support", "CoFinder");

const profilesPath = path.join(userData, "profiles.json");
const credentialsPath = path.join(userData, "credentials.enc.json");

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasForbiddenKeys(value, forbidden) {
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKeys(item, forbidden));
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) return true;
      if (hasForbiddenKeys(child, forbidden)) return true;
    }
  }
  return false;
}

function containsPlainPasswordText(value) {
  if (typeof value === "string") {
    return /password\s*[:=]/i.test(value);
  }
  if (Array.isArray(value)) return value.some((item) => containsPlainPasswordText(item));
  if (value && typeof value === "object") {
    return Object.values(value).some((child) => containsPlainPasswordText(child));
  }
  return false;
}

(async () => {
  const profiles = await readJsonIfExists(profilesPath);
  const credentials = await readJsonIfExists(credentialsPath);

  let ok = true;

  if (profiles) {
    const forbidden = new Set(["password", "passphrase", "privateKeyContent"]);
    if (hasForbiddenKeys(profiles, forbidden)) {
      console.error("[FAIL] profiles.json contains forbidden secret fields.");
      ok = false;
    } else {
      console.log("[OK] profiles.json has no forbidden secret fields.");
    }
  } else {
    console.log("[SKIP] profiles.json not found or unreadable.");
  }

  if (credentials) {
    if (containsPlainPasswordText(credentials)) {
      console.error("[WARN] credentials.enc.json appears to contain plaintext-like password tokens.");
      ok = false;
    } else {
      console.log("[OK] credentials.enc.json does not appear to contain plaintext password tokens.");
    }
  } else {
    console.log("[SKIP] credentials.enc.json not found or unreadable.");
  }

  if (!ok) process.exit(1);
})();
