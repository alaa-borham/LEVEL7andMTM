/** Intersection-based notches on independently constructed paths.
 * Mouse-pick hints never supply coordinates. Unresolved/ambiguous intersections
 * fail before any object is committed. */
const ensure=(ok,m)=>{if(!ok)throw Error(m);};
import {uniqueConstructionIntersection} from './construction-intersections.mjs';
import {directionAtFraction} from './curve-direction-kernel.mjs';
const view=b=>{ensure(b instanceof Uint8Array&&b.length===32,'Invalid notch record');return new DataView(b.buffer,b.byteOffset,32);};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const families=['qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1','qq-one-natural-end-v1','qq-two-relative-end-v1','qq-two-auxiliary-v1','construction-cut-v1','construction-join-v1','construction-offset-v1'];
function path(o){
 ensure(o,'Missing notch source');
 ensure(!o.geometryKind||o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm)&&families.includes(o.directionPolyline?.family),'Unsupported notch path');
 const p=o.geometryKind?o.directionPolyline.points:o.points;
 ensure(p?.length>=2&&p.length<=8192&&p.every(p=>p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)),'Invalid notch path');
 return p;
}
function straight(o){
 const p=path(o),a=p[0],b=p.at(-1),d=b.map((x,k)=>x-a[k]),length=distance(a,b);ensure(length>.0001,'Degenerate notch direction');let previous=-1;
 for(const q of p){const t=q.reduce((s,x,k)=>s+(x-a[k])*d[k],0)/length**2;ensure(t>=previous-.000001&&t>=-.000001&&t<=1.000001&&Math.abs(cross(q.map((x,k)=>x-a[k]),d))/length<.0001,'Notch direction must be straight');previous=t;}
 return {a,b,d,length};
}
export function uniqueNotchIntersection(lineObject,pathObject,{finiteLine=true}={}){
 const l=straight(lineObject),p=path(pathObject),hits=[];let arc=0;
 for(let i=1;i<p.length;i++){
  const a=p[i-1],d=p[i].map((x,k)=>x-a[k]),length=Math.hypot(...d);ensure(length>1e-9,'Degenerate notch segment');
  const offset=a.map((x,k)=>x-l.a[k]),den=cross(l.d,d);
  if(Math.abs(den)<=1e-12*l.length*length){ensure(Math.abs(cross(offset,l.d))/l.length>.0001,'Coincident notch operands');arc+=length;continue;}
  const t=cross(offset,d)/den,u=cross(offset,l.d)/den;
  if(u>=-.0001/length&&u<=1+.0001/length&&(!finiteLine||t>=-.0001/l.length&&t<=1+.0001/l.length)){
   const point=l.a.map((x,k)=>Math.fround(x+t*l.d[k])),at=arc+Math.max(0,Math.min(1,u))*length;
   if(!hits.some(h=>distance(h.point,point)<.0002&&Math.abs(h.at-at)<.0002))hits.push({point,at});
  }arc+=length;
 }
 ensure(hits.length===1,hits.length?'Ambiguous notch intersection':'No notch intersection');return hits[0].point;
}
export function replayIntersectionNotch({records,record,objects}){
 ensure(records?.length===3,'Missing notch group');const [a,b,c]=records.map(view),op=a.getUint16(0,true),source=a.getUint32(8,true),other=a.getUint16(12,true);
 ensure(op%100===96&&op>=196&&a.getUint16(2,true)===op-95&&a.getUint32(4,true)===5&&a.getUint16(14,true)===1&&a.getUint32(16,true)===34&&records[0].subarray(20,28).every(x=>x===0),'Unsupported notch selection');
 ensure(Number.isFinite(a.getFloat32(28,true))&&Math.abs(a.getFloat32(28,true))<=10000,'Invalid notch pick');
 const flag=b.getUint16(10,true),end=b.getFloat32(28,true);
 ensure(b.getUint16(0,true)===op+99&&b.getUint16(2,true)===op+5&&b.getUint32(4,true)===2&&b.getUint16(8,true)===source&&[65280,65535].includes(flag)&&b.getUint32(12,true)===0&&b.getUint32(16,true)===15&&b.getUint32(20,true)===0&&b.getFloat32(24,true)===180&&end===(flag===65535?1:0),'Unsupported notch direction');
 const id=c.getUint16(10,true),length=c.getFloat32(28,true);
 ensure(c.getUint16(0,true)===op+112&&c.getUint16(2,true)===op+105&&c.getUint32(4,true)===1&&c.getUint16(8,true)===0&&records[2].subarray(12,28).every(x=>x===0),'Unsupported notch creation');
 ensure(id>0&&!objects.some(o=>o.id===id)&&Number.isFinite(length)&&length>0&&length<=100,'Invalid notch id or length');
 const origin=objects.find(o=>o.id===source),target=objects.find(o=>o.id===other);ensure(source!==other,'Identical notch operands');let line,point;
 if(origin?.geometryKind){const p=path(origin),q=path(target),hit=uniqueConstructionIntersection(p,q,{extendA:[0,1]});point=hit.point;line=straight({points:end===1?p.slice(-2):p.slice(0,2)});}
 else {line=straight(origin);point=uniqueNotchIntersection(origin,target,{finiteLine:false});}const sign=end===1?-1:1;
 const points=[point,point.map((x,k)=>Math.fround(x+sign*length*line.d[k]/line.length))];
 return {id,points,record:record+2,operation:'intersection-notch',dependencies:[source,other]};
}
export function replayCopiedNotch({historyRecord,record,objects}){
 const v=view(historyRecord),op=v.getUint16(0,true),sourceId=v.getUint16(6,true),targetId=v.getUint16(8,true),id=v.getUint16(10,true);
 ensure(op>=408&&op%100===8&&v.getUint16(2,true)===op-4&&v.getUint16(4,true)===0&&historyRecord.subarray(12).every(x=>x===0),'Unsupported copied notch');
 const source=objects.find(o=>o.id===sourceId),target=objects.find(o=>o.id===targetId);
 ensure(source?.operation==='intersection-notch'&&id>0&&!objects.some(o=>o.id===id)&&sourceId!==targetId,'Missing or duplicate copied notch');
 const origin=uniqueNotchIntersection(source,target,{finiteLine:false}),delta=source.points[1].map((x,k)=>x-source.points[0][k]);
 return {id,record,points:[origin,origin.map((x,k)=>Math.fround(x+delta[k]))],operation:'copied-notch',dependencies:[sourceId,targetId]};
}

/** Endpoint-origin notch: an absolute direction or the reverse source tangent. */
export function replayEndpointNotch({records,record,objects}){
 ensure(records?.length===3,'Missing endpoint notch group');const[a,b,c]=records.map(view),op=a.getUint16(0,true),sourceId=a.getUint32(8,true),end=a.getFloat32(28,true);
 ensure(op>=196&&op%100===96&&[op-95,101].includes(a.getUint16(2,true))&&a.getUint32(4,true)===3&&a.getUint32(12,true)===65536&&a.getUint32(16,true)===34&&records[0].subarray(20,28).every(n=>n===0)&&[0,1].includes(end),'Unsupported endpoint notch selection');
 const source=objects.find(o=>o.id===sourceId),points=path(source),origin=(end?points.at(-1):points[0]).slice(),mode=b.getUint32(4,true);
 ensure(b.getUint16(0,true)===op+99&&b.getUint16(2,true)===a.getUint16(2,true)+100&&b.getUint32(12,true)===0&&b.getUint32(16,true)===15&&b.getUint32(20,true)===0,'Unsupported endpoint notch direction');
 let angle,dependencies=[sourceId];
 if(mode===1){ensure(b.getUint32(8,true)===0&&b.getFloat32(28,true)===0,'Unknown absolute notch fields');angle=b.getFloat32(24,true);ensure(Number.isFinite(angle)&&Math.abs(angle)<=360,'Invalid absolute notch angle');}
 else {ensure(mode===2&&b.getUint16(10,true)===0&&b.getFloat32(24,true)===0,'Unsupported tangent notch direction');const directionId=b.getUint16(8,true),direction=objects.find(o=>o.id===directionId);angle=directionAtFraction(path(direction),b.getFloat32(28,true))+180;dependencies.push(directionId);}
 const id=c.getUint16(10,true),length=c.getFloat32(28,true);ensure(c.getUint16(0,true)===op+112&&c.getUint16(2,true)===a.getUint16(2,true)+200&&c.getUint32(4,true)===1&&c.getUint16(8,true)===0&&records[2].subarray(12,28).every(n=>n===0)&&id>0&&!objects.some(o=>o.id===id)&&Number.isFinite(length)&&length>0&&length<=100,'Unsupported endpoint notch creation');
 const radians=angle*Math.PI/180,tip=origin.map((x,k)=>Math.fround(x+length*[Math.cos(radians),Math.sin(radians)][k]));ensure(tip.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6),'Unbounded endpoint notch');
 return{id,record:record+2,points:[origin,tip],operation:'endpoint-notch',dependencies:[...new Set(dependencies)]};
}

