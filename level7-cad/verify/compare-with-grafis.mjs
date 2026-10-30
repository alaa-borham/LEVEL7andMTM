// Compares the geometry LEVEL7 and MTM computes for every part of an MDL with the
// geometry GRAFIS stored in the same file (base size). Usage:
//   node compare-with-grafis.mjs file.mdl   (paths to the source in the imports)
import fs from 'node:fs';
import {parseMdl} from '/home/user/work/dev/src/native-mdl.js';
import {readCachedPreview} from '/home/user/work/dev/src/native-cache-preview.js';
import {createPartHistoryCalculation} from '/home/user/work/dev/src/part-history-engine.mjs';
import {readNativeMetadata} from '/home/user/work/dev/src/native-measurements.js';
const doc=parseMdl(fs.readFileSync(process.argv[2]));const sizeKey=readNativeMetadata(doc).referenceSize?.name;
const graph=createPartHistoryCalculation(doc,{sizeKey});
const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// distance from point to polyline
const toPoly=(p,poly)=>{let m=Infinity;for(let i=1;i<poly.length;i++){const a=poly[i-1],b=poly[i],L2=(b[0]-a[0])**2+(b[1]-a[1])**2||1;let t=((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/L2;t=Math.max(0,Math.min(1,t));m=Math.min(m,d(p,[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]));}return poly.length===1?d(p,poly[0]):m;};
const rows=[];let parts=0;const ALL=[];
for(let pid=1;pid<=200;pid++){let p;try{p=graph.get(pid);}catch{continue;}if(!p)continue;let cache;try{cache=readCachedPreview(doc,{partId:pid});}catch{cache=null;}
 if(!cache||!cache.objects?.length)continue;parts++;
 const cmap=new Map(cache.objects.map(o=>[o.objectId,o.points.map(q=>[q.x,q.y])]));
 let n=0,ok=0,worst=0,missing=0;
 for(const o of p.objects??[]){const c=cmap.get(o.id);if(!c){missing++;continue;}n++;
  // symmetric: every computed point near cached polyline and vice versa
  const e=Math.max(...o.points.map(q=>toPoly(q,c)),...c.map(q=>toPoly(q,o.points)));if(e<0.05)ok++;worst=Math.max(worst,e);ALL.push([pid,o.id,o.operation,e]);}
 rows.push({pid,full:p.historyFullyExecuted,cachedInputs:p.usesCachedGeometryInputs,computed:p.objects?.length??0,cached:cache.totalObjects,compared:n,matching:ok,worst:+worst.toFixed(3),notInCache:missing});}
const t=rows.reduce((a,r)=>({c:a.c+r.compared,m:a.m+r.matching}),{c:0,m:0});
console.log(JSON.stringify({parts:rows.length,totalCompared:t.c,totalMatching:t.m,fullParts:rows.filter(r=>r.full).length,cachedInputParts:rows.filter(r=>r.cachedInputs).length},null,0));
for(const r of rows.filter(r=>r.compared!==r.matching||!r.full).slice(0,25))console.log(JSON.stringify(r));
fs.writeFileSync('/tmp/cmp-result.json',JSON.stringify(rows,null,1));
for(const t of [0.01,0.05,0.1,0.2,0.5,1,5])console.log('<',t,'mm:',ALL.filter(a=>a[3]<t).length,'/',ALL.length);
const ops={};for(const a of ALL.filter(a=>a[3]>=0.2)){ops[a[2]]=(ops[a[2]]||0)+1;}console.log('over 0.2mm by operation',JSON.stringify(ops));
console.log(JSON.stringify(ALL.filter(a=>a[3]>=0.2).slice(0,12)));
