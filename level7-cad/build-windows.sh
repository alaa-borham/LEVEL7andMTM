#!/bin/bash
# Assembles the Windows build of LEVEL7 and MTM from level7-cad/source-<version>
# with the stock Electron 44.9.0 runtime. Usage: build-windows.sh <version> <out-dir>
# The exe keeps Electron's file icon (changing it needs rcedit on Windows); the
# window and taskbar use assets/icon.ico. Not signed.
set -euo pipefail
V=${1:-0.9.127}; OUT=${2:-dist}
HERE=$(cd "$(dirname "$0")" && pwd)
SRC="$HERE/source-$V"; [ -d "$SRC" ] || SRC="$HERE/releases/app"  # from 0.9.114 the latest tree is releases/app
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
Z="$OUT/electron-v44.9.0-win32-x64.zip"
[ -f "$Z" ] || curl -fsSL -o "$Z" https://github.com/electron/electron/releases/download/v44.9.0/electron-v44.9.0-win32-x64.zip
D="$OUT/LEVEL7-and-MTM-$V-win32-x64"
rm -rf "$D"; mkdir -p "$D"; unzip -q "$Z" -d "$D"
rm -f "$D/resources/default_app.asar"; mkdir -p "$D/resources/app"
(cd "$SRC" && tar --exclude=node_modules -cf - .) | (cd "$D/resources/app" && tar -xf -)
mv "$D/electron.exe" "$D/LEVEL7 and MTM.exe"
(cd "$OUT" && rm -f "LEVEL7-and-MTM-$V-win32-x64.zip" && zip -qr "LEVEL7-and-MTM-$V-win32-x64.zip" "LEVEL7-and-MTM-$V-win32-x64")
echo "$OUT/LEVEL7-and-MTM-$V-win32-x64.zip"
