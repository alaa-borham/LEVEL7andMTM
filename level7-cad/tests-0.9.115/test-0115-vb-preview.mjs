// 0.9.115: a newer GRAFIS save (MDL variant VB) must show its stored drawings
// read-only, and must stay non-editable. Usage: node test-0115-vb-preview.mjs <app-dir> <vb.mdl>
import fs from'node:fs';import path from'node:path';import{pathToFileURL}from'node:url';import assert from'node:assert/strict';
const [src,file]=process.argv.slice(2);const load=f=>import(pathToFileURL(path.join(src,'src',f)).href);
const {parseMdl}=await load('native-mdl.js'),{readCachedPreview}=await load('native-cache-preview.js');
const doc=parseMdl(fs.readFileSync(file));assert.equal(doc.variant,'VB');console.log('PASS file is variant VB');
let parts=0,objects=0,empty=0;for(let p=1;p<=999;p++){try{const c=readCachedPreview(doc,{partId:p});parts++;objects+=c.objects.length;}catch(e){if(/unique evaluated cache/.test(e.message)){empty++;continue;}throw e;}if(p>2000)break;}
assert(parts>0&&objects>0);console.log(`PASS ${parts} parts with ${objects} stored objects readable (${empty} part numbers without a stored drawing)`);
assert(doc.warnings.some(w=>/verified only for VA/.test(w)));console.log('PASS VB stays read-only (native edits verified only for VA)');
