#!/usr/bin/env bash
# Regenerate assets/icon/icon.icns and assets/icon/icon.png from the archived 1:1 source PNG.
# Requires macOS (sips + iconutil). No npm dependencies.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${ROOT}/assets/icon/archive/2026-05-v2-triangle-grid/source/cofinder-icon-source.png"
ICONSET="${ROOT}/assets/icon/.tmp.CoFinder.iconset"
OUT_ICNS="${ROOT}/assets/icon/icon.icns"
OUT_PNG="${ROOT}/assets/icon/icon.png"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing source: $SOURCE" >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sips -z 16 16 "$SOURCE" --out "$ICONSET/icon_16x16.png"
sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_32x32.png"
sips -z 64 64 "$SOURCE" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128 "$SOURCE" --out "$ICONSET/icon_128x128.png"
sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_256x256.png"
sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$OUT_ICNS"
sips -z 512 512 "$SOURCE" --out "$OUT_PNG"
rm -rf "$ICONSET"

echo "Wrote $OUT_ICNS and $OUT_PNG"
