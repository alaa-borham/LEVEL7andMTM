#!/bin/bash
# Builds LEVEL7 and MTM 0.9.112 from /home/user/work/dev with the stock
# Electron 44.9.0 runtime (no signing, exe icon unchanged: needs rcedit/wine).
set -e
SRC=/home/user/work/dev
CACHE=/root/.cache/electron/5ea8d8a9b31b6adae9bf3c2dbe1ac40908da7b96143379b3ba53f43037430952
OUT=/home/user/work/pkg
V=0.9.112
for P in win32 linux; do
  D="$OUT/LEVEL7-and-MTM-$V-$P-x64"
  rm -rf "$D" && mkdir -p "$D" && unzip -q "$CACHE/electron-v44.9.0-$P-x64.zip" -d "$D"
  rm -f "$D/resources/default_app.asar"
  mkdir -p "$D/resources/app"
  (cd "$SRC" && tar --exclude=node_modules --exclude=.git -cf - .) | (cd "$D/resources/app" && tar -xf -)
  if [ "$P" = win32 ]; then mv "$D/electron.exe" "$D/LEVEL7 and MTM.exe"; else mv "$D/electron" "$D/level7-and-mtm"; fi
done
rm -f "$OUT/LEVEL7-and-MTM-$V-win32-x64.zip"
(cd "$OUT" && zip -qr "LEVEL7-and-MTM-$V-win32-x64.zip" "LEVEL7-and-MTM-$V-win32-x64")
ls -la "$OUT"/*.zip
