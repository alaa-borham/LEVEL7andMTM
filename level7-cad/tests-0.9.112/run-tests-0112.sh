#!/bin/bash
# Portable test run for LEVEL7 and MTM 0.9.112 on Linux (used for the recorded results).
# Layout expected (same as the original machine's relative paths):
#   ENV/work/LEVEL7-CAD-0.9.111-source -> the 0.9.112 source folder (symlink)
#   ENV/work/test-0111-*.mjs            -> the archived 0.9.111 tests
#   ENV/portable-ui.mjs, ENV/work/test-0112-ux-ui.mjs
# Requirements: Node 22, Playwright at /opt/node-tools/node_modules/playwright,
# Xvfb (xvfb-run), and a NON-root user: Electron refuses to run as root with the
# app's sandbox enabled. Never run the machine-specific updater script.
set -u
ENV=${ENV:-/home/user/work/env}
cd "$ENV"
(cd work/LEVEL7-CAD-0.9.111-source && npm install --no-save electron@44.9.0 && node node_modules/electron/install.js)
for t in x-anytime workspace x-immediate; do
  f=$(node portable-ui.mjs work/test-0111-$t-ui.mjs)
  xvfb-run -a node "$f" > "$f.log" 2>&1; echo "$t exit=$? passed=$(grep -c '^PASS' "$f.log")"
done
xvfb-run -a node work/test-0112-ux-ui.mjs > work/test-0112-ux-ui.log 2>&1; echo "0112-ux exit=$? passed=$(grep -c '^PASS' work/test-0112-ux-ui.log)"
# packaged build: L7_EXE=/path/to/level7-and-mtm xvfb-run -a node work/test-0112-ux-ui.mjs
