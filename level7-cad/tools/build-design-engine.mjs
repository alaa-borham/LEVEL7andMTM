// Builds the LEVEL7 design engine (../app) into <app dir>/assets/l7design (a path the
// auto-updater of installed versions already accepts).
// Usage: node tools/build-design-engine.mjs <desktop app dir>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(process.argv[2] ?? '', 'assets', 'l7design');
const engine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../app');
execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: engine, stdio: 'inherit' });
// file:// pages cannot load module scripts marked crossorigin.
const index = path.join(out, 'index.html');
fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace(/ crossorigin/g, ''));
console.log('design engine ->', out);
