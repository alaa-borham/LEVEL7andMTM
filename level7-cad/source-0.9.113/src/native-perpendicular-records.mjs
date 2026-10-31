const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),need=(ok,m)=>{if(!ok)throw Error(m);},validId=n=>Number.isInteger(n)&&n>=2001&&n<60000;
function encode({id,sourceId,start},tolerance=0){
 need([id,sourceId].every(validId)&&id!==sourceId,'Invalid perpendicular identity');
 const numeric=Array.isArray(start),point=!numeric&&start&&Object.keys(start).join(',')==='pointId',bound=!numeric&&start&&Object.keys(start).sort().join(',')==='fraction,lineId';
 need(numeric?start.length===2&&start.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6):point?validId(start.pointId)&&start.pointId!==id:bound&&validId(start.lineId)&&start.lineId!==id&&Number.isFinite(start.fraction)&&start.fraction>=-tolerance&&start.fraction<=1+tolerance,'Invalid perpendicular start');
 const raw=new Uint8Array(64),q=v(raw);[[196,101,numeric?1:point?2:3,0],[294,201,23,1,sourceId,0,id,0]].forEach((row,i)=>row.forEach((n,j)=>q.setUint16(i*32+j*2,n,true)));q.setUint32(16,18,true);
 if(numeric)start.forEach((n,i)=>q.setFloat32(24+i*4,n,true));else{q.setUint32(8,point?start.pointId:start.lineId,true);q.setUint32(12,65536,true);if(!point)q.setFloat32(28,start.fraction,true);}return raw;
}
export const encodeOriginalPerpendicularRecords=args=>encode(args);
export function readOriginalPerpendicularRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==64)return null;const q=v(raw),mode=q.getUint16(4,true),args={id:q.getUint32(44,true),sourceId:q.getUint32(40,true),start:mode===2?{pointId:q.getUint32(8,true)}:mode===3?{lineId:q.getUint32(8,true),fraction:q.getFloat32(28,true)}:[q.getFloat32(24,true),q.getFloat32(28,true)]};
 try{const expected=encode(args,1e-5);return raw.every((n,i)=>n===expected[i])?args:null;}catch{return null;}
}
export function resolvePerpendicularStart(start,objects){
 if(Array.isArray(start))return start.slice();if(start?.pointId){const p=objects.find(o=>o.id===start.pointId);need(p&&!p.hidden&&!p.geometryKind&&p.points.length===1,'Perpendicular start requires an earlier original point');return p.points[0].slice();}const o=objects.find(o=>o.id===start?.lineId);need(o&&!o.hidden&&!o.geometryKind&&o.points.length===2,'Perpendicular start requires an earlier original straight line');const[a,b]=o.points;need(Math.hypot(...b.map((n,i)=>n-a[i]))>1e-7,'Degenerate perpendicular start line');return a.map((n,i)=>Math.fround(n+(b[i]-n)*Math.fround(start.fraction)));
}
export function perpendicularFromOriginalLine(source,start){
 need(source&&!source.hidden&&!source.geometryKind&&source.points.length===2,'Perpendicular requires a visible original straight line');const [a,b]=source.points,d=b.map((n,i)=>n-a[i]),den=d.reduce((s,n)=>s+n*n,0);need(den>1e-14,'Degenerate perpendicular source');const t=start.reduce((s,n,i)=>s+(n-a[i])*d[i],0)/den,foot=a.map((n,i)=>Math.fround(n+t*d[i]));
 need(foot.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)&&Math.hypot(...foot.map((n,i)=>n-start[i]))>1e-5,'Perpendicular must have a nonzero bounded length');return [start.map(Math.fround),foot];
}
