// Builds the automatic-update release: <out>/latest.json + <out>/app/<files>.
// Usage: node make-release.mjs <app-source-dir> <out-dir> [notes]
// The installed program downloads only files whose SHA-256 differs from its own.
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';
const [src,out,notes='']=process.argv.slice(2);if(!src||!out){console.error('usage: node make-release.mjs <app-source-dir> <out-dir> [notes]');process.exit(2);}
const allowed=/^(?:native\.html|index\.html|package\.json|README[^/]*\.md|(?:src|desktop|assets|examples)\/[A-Za-z0-9._\-\/]+)$/;
const files=[];const walk=d=>{for(const e of fs.readdirSync(path.join(src,d),{withFileTypes:true})){const rel=d?d+'/'+e.name:e.name;if(e.isDirectory()){if(!['node_modules','.git'].includes(e.name))walk(rel);}else if(allowed.test(rel))files.push(rel);}};walk('');files.sort();
const version=JSON.parse(fs.readFileSync(path.join(src,'package.json'),'utf8')).version;
fs.rmSync(path.join(out,'app'),{recursive:true,force:true});
const list=files.map(rel=>{const b=fs.readFileSync(path.join(src,rel));const t=path.join(out,'app',rel);fs.mkdirSync(path.dirname(t),{recursive:true});fs.writeFileSync(t,b);return{path:rel,sha256:crypto.createHash('sha256').update(b).digest('hex'),size:b.length};});
fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify({product:'LEVEL7 and MTM',version,notes,files:list},null,1)+'\n');
console.log(`release ${version}: ${list.length} files`);
