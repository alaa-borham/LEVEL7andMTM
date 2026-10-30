// 0.9.112 round-corner (EK_c004_02) regression against GRAFIS-stored geometry.
// Usage: node test-0112-round-corner.mjs <source-dir> <ALAA2026.mdl> [corner-test.mdl]
// The .mdl files are the owner's GRAFIS saves and are not stored in the repository.
// Computed geometry comes only from history replay; the GRAFIS cache is used as the
// expected answer, never as an input.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const [src,alaa,cornerFile]=process.argv.slice(2);if(!src||!alaa){console.error('usage: node test-0112-round-corner.mjs <source-dir> <ALAA2026.mdl> [corner-test.mdl]');process.exit(2);}
const load=f=>import(pathToFileURL(path.join(src,'src',f)).href);
const {parseMdl}=await load('native-mdl.js'),{readCachedPreview}=await load('native-cache-preview.js'),{createPartHistoryCalculation}=await load('part-history-engine.mjs'),{readNativeMetadata}=await load('native-measurements.js'),{solveSmallCorner}=await load('round-corner-kernel.mjs');
const n=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),seg=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy;let t=L?((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));return n(q,[a[0]+t*dx,a[1]+t*dy]);},dist=(q,P)=>P.length===1?n(q,P[0]):Math.min(...P.slice(1).map((b,i)=>seg(q,P[i],b)));
let failed=0;const check=(name,ok,detail)=>{console.log((ok?'PASS ':'FAIL ')+name+' '+detail);if(!ok)failed++;};
const doc=parseMdl(fs.readFileSync(alaa)),calc=createPartHistoryCalculation(doc,{sizeKey:readNativeMetadata(doc).referenceSize.name});
for(const part of [3,47,65]){const r=calc.get(part);let worst=0;for(const g of readCachedPreview(doc,{partId:part}).objects){const o=r.objects.find(o=>o.id===g.objectId);if(!o){worst=Infinity;continue;}const G=g.points.map(q=>[q.x,q.y]),O=o.points.map(q=>Array.isArray(q)?q:[q.x,q.y]);worst=Math.max(worst,...G.map(q=>dist(q,O)),...O.map(q=>dist(q,G)));}
 check(`ALAA2026 part ${part} round corners`,r.historyFullyExecuted&&worst<0.2,`full=${r.historyFullyExecuted} worst=${worst.toFixed(4)}mm (limit 0.2)`);}
if(cornerFile&&fs.existsSync(cornerFile)){
 // Right-angle corners of the owner's test rectangle, trims 10/20/30/40 mm; Ri=0, Fx 50/25/75, Fy 0.
 const d2=parseMdl(fs.readFileSync(cornerFile)),cache=new Map(readCachedPreview(d2,{partId:1}).objects.map(o=>[o.objectId,o.points.map(q=>[q.x,q.y])]));
 const all=[...cache.values()].filter(p=>p.length>2).flat(),aux=[{percent:50,heightMm:0},{percent:25,heightMm:0},{percent:75,heightMm:0}],d=Math.PI/180;
 const cases=[[10,[360.169,262.658],[370.169,252.658],[370.169,262.658],[0,-90],[367.736,260.225]],[20,[70.169,242.658],[90.169,262.658],[70.169,262.658],[90,0],[75.844,256.984]],[30,[100.169,62.658],[70.169,92.658],[70.169,62.658],[180,90],[79.052,71.54]],[40,[370.169,102.658],[330.169,62.658],[370.169,62.658],[-90,180],[358.025,74.803]]];
 for(const [ru,start,end,corner,ang,split] of cases){const s=solveSmallCorner({start,end,corner,angles:ang.map(a=>a*d),auxiliaries:aux}),inner=all.filter(q=>n(q,corner)<ru*1.05&&Math.abs(q[0]-corner[0])>1e-3&&Math.abs(q[1]-corner[1])>1e-3),e=Math.max(...inner.map(q=>dist(q,s.points)));
  check(`corner test Ru=${ru}`,n(s.m,split)<0.01&&e<0.09,`split=${n(s.m,split).toFixed(4)}mm curve=${e.toFixed(4)}mm`);}
} else console.log('SKIP corner test file not given');
process.exit(failed?1:0);
