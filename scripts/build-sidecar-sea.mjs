/**
 * Builds the Node sidecar into a self-contained executable using Node's SEA
 * (Single Executable Application) support, then stages it for Tauri's
 * externalBin packaging at src-tauri/binaries/cofinder-sidecar-<triple>.
 *
 * Steps:
 *   1. esbuild-bundle src/main/sidecar/index.ts -> dist-sidecar/sidecar.cjs
 *   2. node --experimental-sea-config -> dist-sidecar/sea-prep.blob
 *   3. copy the current node binary, strip its signature, inject the blob
 *      with postject, re-sign ad-hoc
 *   4. rename to src-tauri/binaries/cofinder-sidecar-aarch64-apple-darwin
 *
 * Dev flow does NOT use this binary: `tauri dev` spawns plain `node` directly.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distSidecar = path.join(root, "dist-sidecar");
const binDir = path.join(root, "src-tauri", "binaries");
const seaConfig = path.join(distSidecar, "sea-config.json");

const triple = execSync("rustc -vV", { encoding: "utf8" })
  .split("\n")
  .find((line) => line.startsWith("host:"))
  ?.split(":")[1]
  .trim();
if (!triple) {
  console.error("failed to determine target triple");
  process.exit(1);
}

fs.mkdirSync(distSidecar, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });

console.log("→ bundling sidecar with esbuild");
execSync(
  `npx esbuild src/main/sidecar/index.ts --bundle --platform=node --format=cjs ` +
    `--outfile=${path.join(distSidecar, "sidecar.cjs")} --external:cpu-features --external:*.node`,
  { cwd: root, stdio: "inherit" }
);

console.log("→ generating SEA config");
const entry = path.join(distSidecar, "sidecar.cjs");
fs.writeFileSync(
  seaConfig,
  JSON.stringify(
    {
      main: entry,
      output: path.join(distSidecar, "sea-prep.blob"),
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false
    },
    null,
    2
  )
);

console.log("→ building SEA blob");
execSync(`node --experimental-sea-config ${seaConfig}`, { cwd: root, stdio: "inherit" });

const nodeBinary = process.execPath;
const outBin = path.join(distSidecar, "cofinder-sidecar");
fs.copyFileSync(nodeBinary, outBin);

console.log("→ stripping signature, injecting blob, re-signing");
try {
  execSync(`codesign --remove-signature ${outBin}`, { stdio: "inherit" });
} catch {
  /* unsigned already */
}
const blob = path.join(distSidecar, "sea-prep.blob");
const sentinel = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
execSync(
  `npx postject ${outBin} NODE_SEA_BLOB ${blob} --sentinel-fuse ${sentinel} --macho-segment-name NODE_SEA`,
  { cwd: root, stdio: "inherit" }
);
execSync(`codesign --sign - ${outBin}`, { stdio: "inherit" });

const finalBin = path.join(binDir, `cofinder-sidecar-${triple}`);
fs.copyFileSync(outBin, finalBin);
fs.chmodSync(finalBin, 0o755);

console.log(`→ staged sidecar at ${finalBin}`);
