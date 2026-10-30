// Rewrites a recorded UI test so it runs on this Linux machine:
// local Playwright, the development Electron binary and --no-sandbox under Xvfb.
import fs from 'node:fs';
import path from 'node:path';
const [file] = process.argv.slice(2);
let s = fs.readFileSync(file, 'utf8');
s = s.replace(/from\s*'file:\/\/\/C:\/Users\/[^']*playwright\/index\.mjs'/g, "from'file:///opt/node-tools/node_modules/playwright/index.mjs'");
const electron = path.resolve('work/LEVEL7-CAD-0.9.111-source/node_modules/electron/dist/electron');
s = s.replace(/executablePath:path\.resolve\('work\/desktop-build\/node_modules\/electron\/dist\/electron\.exe'\),args:\[source\]/g, `executablePath:${JSON.stringify(electron)},args:['--no-sandbox',source]`);
const out = file.replace(/\.mjs$/, '.portable.mjs');
fs.writeFileSync(out, s);
console.log(out);
