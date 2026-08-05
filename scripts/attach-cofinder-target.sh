#!/usr/bin/env bash
# Mounts the CoFinder build-target APFS sparse image from the flash card so
# cargo can place its build artifacts there instead of on the local disk.
#
# Usage: scripts/attach-cofinder-target.sh
set -euo pipefail

SPARSE="/Volumes/SANDISK ELE/CoFinder-tauri-target/cofinder-target.sparseimage"
MOUNT="/Volumes/CoFinderTarget"

if ! ls "/Volumes/SANDISK ELE" >/dev/null 2>&1; then
  echo "error: flash card 'SANDISK ELE' is not mounted" >&2
  exit 1
fi
if [ ! -f "$SPARSE" ]; then
  echo "error: sparse image not found at $SPARSE" >&2
  exit 1
fi
if mount | grep -q " on $MOUNT "; then
  echo "already mounted at $MOUNT"
  exit 0
fi
hdiutil attach "$SPARSE" >/dev/null
echo "mounted CoFinder build target at $MOUNT"
