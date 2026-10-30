// 0.9.112: tapered parallel (seam allowance) on curves. GRAFIS applies the first
// input at the END of the source path. Checks every object of ALAA2026.mdl part 7
// against the geometry GRAFIS stored in the file. Needs the user's model at
// L7_ALAA (not part of the repository); skipped when it is missing.
import fs from'node:fs';import assert from'node:assert/strict';
import{parseMdl}from'./LEVEL7-CAD-0.9.111-source/src/native-mdl.js';import{readCachedPreview}from'./LEVEL7-CAD-0.9.111-source/src/native-cache-preview.js';
import{createPartHistoryCalculation}from'./LEVEL7-CAD-0.9.111-source/src/part-history-engine.mjs';import{readNativeMetadata}from'./LEVEL7-CAD-0.9.111-source/src/native-measurements.js';
const file=process.env.L7_ALAA||'/home/user/LEVEL7andMTM/samples/ALAA2026.mdl';
if(!fs.existsSync(file)){console.log('SKIP model not available');process.exit(0);}
const doc=parseMdl(fs.readFileSync(file)),sizeKey=readNativeMetadata(doc).referenceSize.name,graph=createPartHistoryCalculation(doc,{sizeKey});
const toPoly=(q,poly)=>{let m=Infinity;for(let i=1;i<poly.length;i++){const a=poly[i-1],b=poly[i],L2=(b[0]-a[0])**2+(b[1]-a[1])**2||1;let t=((q[0]-a[0])*(b[0]-a[0])+(q[1]-a[1])*(b[1]-a[1]))/L2;t=Math.max(0,Math.min(1,t));m=Math.min(m,Math.hypot(q[0]-a[0]-t*(b[0]-a[0]),q[1]-a[1]-t*(b[1]-a[1])));}return poly.length===1?Math.hypot(q[0]-poly[0][0],q[1]-poly[0][1]):m;};
const part=graph.get(7),cache=new Map(readCachedPreview(doc,{partId:7}).objects.map(o=>[o.objectId,o.points.map(p=>[p.x,p.y])]));
assert(part.historyFullyExecuted);let worst=0;
for(const o of part.objects){const c=cache.get(o.id);assert(c,'object '+o.id);worst=Math.max(worst,...o.points.map(q=>toPoly(q,c)),...c.map(q=>toPoly(q,o.points)));}
assert(worst<0.01,'worst '+worst);
console.log(`PASS part 7: all ${part.objects.length} objects within ${worst.toFixed(4)} mm of GRAFIS (tapered 9/11 and 10/12 mm curve allowances)`);
