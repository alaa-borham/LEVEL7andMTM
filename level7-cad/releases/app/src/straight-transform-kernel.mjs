/** Bounded research decoding of straight-line cut and axial reflection.
 * Derives transforms from constructed geometry, never recorded cached matrices.
 */
import {straightLineIntersection} from './geometric-z-kernel.mjs';
import {uniqueConstructionIntersection,intersectConstructionPaths} from './construction-intersections.mjs';
const ensure=(b,m)=>{if(!b)throw Error(m);};
const view=bytes=>{ensure(bytes instanceof Uint8Array&&bytes.length===32,'Invalid transform record');return new DataView(bytes.buffer,bytes.byteOffset,32);};
const line=points=>{ensure(points?.length===2&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)),'Invalid straight transform geometry');const[a,b]=points,dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;ensure(n>1e-14,'Degenerate transform axis');return{a,b,dx,dy,n};};
export function reflectStraightLine(points,axis){
 line(points);const {a,dx,dy,n}=line(axis);
 return points.map(p=>{const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n;const q=[2*(a[0]+t*dx)-p[0],2*(a[1]+t*dy)-p[1]];ensure(q.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6),'Unbounded reflection');return q.map(Math.fround);});
}
export function splitStraightLine({axisRecord,targetRecord,record,objects}){
 const a=view(axisRecord),v=view(targetRecord),op=v.getUint16(0,true),id=v.getUint16(6,true),newId=v.getUint16(12,true);
 ensure(a.getUint16(0,true)===103&&a.getUint16(2,true)===105&&a.getUint16(4,true)===0&&axisRecord.subarray(8).every(x=>x===0),'Unsupported split axis');
 ensure(op>=203&&op%100===3&&v.getUint16(2,true)===op+15&&v.getUint16(4,true)===0&&v.getUint16(8,true)===0&&v.getUint16(10,true)===id&&v.getUint16(14,true)===0,'Unsupported split fields');
 ensure(Number.isFinite(v.getFloat32(16,true))&&v.getFloat32(16,true)>=0&&v.getFloat32(16,true)<=1&&targetRecord.subarray(20).every(x=>x===0),'Unknown split hint or tail');
 const axis=objects.find(o=>o.id===a.getUint16(6,true)),source=objects.find(o=>o.id===id);ensure(axis&&source&&axis.id!==id&&newId>0&&!objects.some(o=>o.id===newId),'Unsupported split operands');
 if(source.geometryKind){
  const p=constructionCurve(source),hit=axis.geometryKind?uniqueConstructionIntersection(p,constructionCurve(axis),{extendB:[0,1]}):curveLineHit(p,axis.points),segment=hit.i??hit.segment,point=hit.point;
  ensure(Math.hypot(...point.map((x,k)=>x-p[0][k]))>.0001&&Math.hypot(...point.map((x,k)=>x-p.at(-1)[k]))>.0001,'Split must lie inside the target');
  return [[...p.slice(0,segment+1),point],[point,...p.slice(segment+1)]].map((raw,i)=>{const points=raw.filter((q,j)=>!j||Math.hypot(...q.map((x,k)=>x-raw[j-1][k]))>.0001).map(q=>q.slice());ensure(points.length>=2,'Collapsed split curve');return{...source,id:i?newId:id,record:i?record:source.record,lastModifiedRecord:record,points,dependencies:i?[id,axis.id]:[...(source.dependencies??[]),axis.id],operation:i?'split-curve-end':'split-curve-start',...(points.length>2?{geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-cut-v1',points:points.map(q=>q.slice())}}:{geometryKind:undefined,directionPolyline:undefined,samplingToleranceMm:undefined})};});
 }
 const g=line(source.points);const point=axis.geometryKind?curveLineHit(constructionCurve(axis),source.points).point:straightLineIntersection(axis.points,source.points).map(Math.fround),t=((point[0]-g.a[0])*g.dx+(point[1]-g.a[1])*g.dy)/g.n;ensure(t>1e-7&&t<1-1e-7,'Split must lie inside the target');
 const dependencies=[...(source.dependencies??[]),axis.id];return [{...source,points:[source.points[0].slice(),point],lastModifiedRecord:record,dependencies,operation:'split-line-start'},{...source,id:newId,points:[point.slice(),source.points[1].slice()],record,lastModifiedRecord:record,dependencies:[id,axis.id],operation:'split-line-end'}];
}
function reflectPreviewCurve(source,axis){
 ensure(source.geometryKind==='sampled-curve'&&[.0001,.08].includes(source.samplingToleranceMm)&&source.points.length>=3&&source.points.length<=8192,'Unsupported reflected curve representation');
 const {a,dx,dy,n}=line(axis);
 return source.points.map(p=>{ensure(Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6),'Invalid reflected curve point');const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n;const q=[2*(a[0]+t*dx)-p[0],2*(a[1]+t*dy)-p[1]];ensure(q.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6),'Unbounded reflection');return q.map(Math.fround);});
}
// Native construction curves are polygonal. Only computed construction segments
// are eligible here; display caches and the mouse-pick hint are never geometry.
function constructionCurve(o){
 ensure(o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm),'Unsupported cut curve representation');
 const p=o.directionPolyline;
 ensure(p&&['qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1','qq-one-natural-end-v1','qq-two-relative-end-v1','qq-two-auxiliary-v1','construction-cut-v1','construction-morph-v1','construction-join-v1','construction-offset-v1','round-corner-v1','construction-length-v1'].includes(p.family),'Missing computed cut construction segments');
 ensure(p.points.length>=3&&p.points.length<=8192&&p.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)),'Invalid cut construction segments');
 return p.points;
}
function curveLineHit(curve,straight,{extendAxis=false,extensionEnd=null}={}){
 const l=line(straight),hits=[],cross=(a,b)=>a[0]*b[1]-a[1]*b[0];let traversed=0;
 for(let i=0;i<curve.length-1;i++){
  const a=curve[i],b=curve[i+1],d=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...d);ensure(length>1e-9,'Degenerate cut curve segment');const startDistance=traversed;traversed+=length;
  const e=[l.dx,l.dy],den=cross(d,e),offset=[l.a[0]-a[0],l.a[1]-a[1]];
  if(Math.abs(den)<=1e-12*length*Math.sqrt(l.n)){ensure(Math.abs(cross(offset,e))/Math.sqrt(l.n)>.0001,'Coincident cut curve segment');continue;}
  const t=cross(offset,e)/den;
  // Float32 native coordinates can put a shared endpoint a few microns outside.
  if(t<-.0001/length||t>1+.0001/length)continue;
  const u=Math.max(0,Math.min(1,t)),p=a.map((x,k)=>Math.fround(x+u*d[k])),arcDistance=startDistance+u*length;
  if(!hits.some(h=>Math.abs(h.arcDistance-arcDistance)<.0002&&Math.hypot(...p.map((x,k)=>x-h.point[k]))<.0002))hits.push({point:p,arcDistance,segment:i});
 }
 // When the reference curve ends before a straight target, Grafis continues
 // its terminal construction segment as a ray. Interior segments are never
 // extrapolated. A finite intersection takes precedence over these rays.
 if(!hits.length&&extendAxis){
  for(const [i,start] of [[0,true],[curve.length-2,false]]){
   if(extensionEnd!==null&&Number(start?0:1)!==extensionEnd)continue;
   const a=curve[i],b=curve[i+1],d=[b[0]-a[0],b[1]-a[1]],e=[l.dx,l.dy],den=cross(d,e);
   if(Math.abs(den)<=1e-12*Math.hypot(...d)*Math.sqrt(l.n))continue;
   const t=cross([l.a[0]-a[0],l.a[1]-a[1]],e)/den;
   if(start?t>=0:t<=1)continue;
   const point=a.map((x,k)=>Math.fround(x+t*d[k]));
   ensure(point.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6),'Unbounded curve extension');
   hits.push({point,segment:i,extended:true});
  }
 }
 ensure(hits.length===1,hits.length?'Ambiguous curve cut intersection':'No curve cut intersection');return hits[0];
}
export function applyStraightCut({axisRecord,targetRecord,record,objects}){
 const a=view(axisRecord),v=view(targetRecord);
 ensure(a.getUint16(0,true)===103&&a.getUint16(2,true)===105&&a.getUint16(4,true)===0,'Unsupported cut axis operation');
 for(let i=8;i<32;i++)ensure(a.getUint8(i)===0,'Unknown cut axis field');
 const h=v.getUint16(0,true);ensure(h>=203&&h%100===3&&v.getUint16(2,true)===h+16&&v.getUint16(4,true)===0,'Unsupported straight cut operation');
 const id=v.getUint16(6,true),endpoint=v.getUint16(8,true);ensure([1,2].includes(endpoint)&&v.getUint16(10,true)===id&&v.getUint32(12,true)===0,'Unsupported cut endpoint');
 ensure(Number.isFinite(v.getFloat32(16,true))&&v.getFloat32(16,true)>=0&&v.getFloat32(16,true)<=1,'Invalid cut pick hint');for(let i=20;i<32;i++)ensure(v.getUint8(i)===0,'Unknown cut field');
 const axis=objects.find(o=>o.id===a.getUint16(6,true)),target=objects.find(o=>o.id===id);ensure(axis&&target&&axis.id!==target.id,'Missing/invalid cut operands');
 if(axis.geometryKind||target.geometryKind){
  const curve=constructionCurve(target.geometryKind?target:axis);
  let hit;
  if(axis.geometryKind&&target.geometryKind){const intersection=uniqueConstructionIntersection(curve,constructionCurve(axis),{extendA:[endpoint===2?0:1],extendB:[0,1]});hit={point:intersection.point,segment:intersection.i};}
  else hit=curveLineHit(curve,target.geometryKind?axis.points:target.points,{extendAxis:!!axis.geometryKind||!!target.geometryKind,extensionEnd:target.geometryKind?(endpoint===2?0:1):null});
  let points;
  if(target.geometryKind){
   points=endpoint===2?[hit.point,...curve.slice(hit.segment+1)]:[...curve.slice(0,hit.segment+1),hit.point];
   points=points.filter((p,i)=>!i||Math.hypot(...p.map((x,k)=>x-points[i-1][k]))>.0001).map(p=>[...p]);
   ensure(points.length>=2,'Cut would collapse the curve');
  }else{points=target.points.map(p=>[...p]);points[endpoint===2?0:1]=hit.point;line(points);}
  return {...target,points,lastModifiedRecord:record,dependencies:[...(target.dependencies??[]),axis.id],operation:target.geometryKind?'curve-cut':'straight-cut-by-curve',...(target.geometryKind?points.length>2?{samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-cut-v1',points:points.map(p=>[...p])}}:{geometryKind:undefined,directionPolyline:undefined,samplingToleranceMm:undefined}:{})};
 }
 line(axis.points);line(target.points);
 const p=straightLineIntersection(axis.points,target.points).map(Math.fround),points=target.points.map(p=>p.slice());points[endpoint===2?0:1]=p;
 return {...target,points,lastModifiedRecord:record,dependencies:[...(target.dependencies??[]),axis.id],operation:'straight-cut'};
}
export function applyStraightReflection({axisRecord,axisRecordNumber,targetRecord,record,objects}){
 const a=view(axisRecord),v=view(targetRecord),h=v.getUint16(0,true);
 ensure(a.getUint16(0,true)%100===19&&a.getUint16(2,true)===128&&a.getUint16(6,true)===0,'Unsupported reflection axis operation');
 ensure(h>=219&&h%100===19&&[140,240].includes(v.getUint16(2,true))&&v.getUint16(6,true)===2,'Unsupported reflection target operation');
 ensure(v.getUint16(12,true)===0&&v.getUint16(14,true)===65535&&v.getUint16(16,true)===4&&v.getUint16(18,true)===8&&v.getUint16(20,true)===axisRecordNumber&&v.getUint32(24,true)===0,'Unknown reflection target fields');
 ensure(v.getUint32(28,true)===a.getUint32(28,true),'Reflection context differs from axis');
 const sourceId=v.getUint16(4,true),id=v.getUint16(8,true),mode=v.getUint16(10,true),axisId=a.getUint16(4,true);
 ensure(mode===0&&id===sourceId||mode===65535&&id!==sourceId,'Unknown reflection copy mode');
 const source=objects.find(o=>o.id===sourceId),axis=objects.find(o=>o.id===axisId);ensure(source&&axis&&(sourceId!==axisId||mode===65535),'Missing/invalid reflection operands');
 ensure(mode===0||!objects.some(o=>o.id===id),'Duplicate reflected object');
 let axisPoints=axis.points;
 if(axis.geometryKind){
  ensure(a.getUint32(24,true)===0,'Unknown reflection axis field');
  const points=constructionCurve(axis),fraction=a.getFloat32(28,true);ensure(Number.isFinite(fraction)&&fraction>=0&&fraction<=1,'Invalid reflection curve fraction');
  const lengths=points.slice(1).map((p,i)=>Math.hypot(...p.map((x,k)=>x-points[i][k])));ensure(lengths.every(n=>n>1e-7),'Degenerate reflection segment');let distance=fraction*lengths.reduce((s,n)=>s+n,0),i=0;
  while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];
  // The selected computed construction segment defines the infinite tangent
  // axis. Recorded display positions and direction vectors are not inputs.
  if(i<lengths.length-1&&Math.abs(distance-lengths[i])<.0001){const u=points[i+1].map((x,k)=>x-points[i][k]),w=points[i+2].map((x,k)=>x-points[i+1][k]);ensure(Math.abs(u[0]*w[1]-u[1]*w[0])<1e-7*lengths[i]*lengths[i+1],'Ambiguous reflection tangent at corner');}
  axisPoints=[points[i],points[i+1]];
 }
 if(source.geometryKind)return {id,points:reflectPreviewCurve(source,axisPoints),record:mode===0?source.record:record,lastModifiedRecord:record,dependencies:[sourceId,axisId],operation:mode===0?'curve-reflect':'curve-reflect-copy',geometryKind:'sampled-curve',samplingToleranceMm:source.samplingToleranceMm,nativePolylineParity:false,...(source.directionPolyline?{directionPolyline:{family:source.directionPolyline.family,points:reflectPreviewCurve({...source,points:source.directionPolyline.points},axisPoints)}}:{})};
 return {...source,id,points:reflectStraightLine(source.points,axisPoints),record:mode===0?source.record:record,lastModifiedRecord:record,dependencies:[...new Set([...(source.dependencies??[]),sourceId,axisId])],operation:mode===0?'straight-reflect':'straight-reflect-copy'};
}
/** Bounded native two-object connection: shared curve ends, or a curve start
 * and a straight end meeting at one finite intersection. */
export function applyConnectedCut({historyRecord,record,objects}){
 const v=view(historyRecord),op=v.getUint16(0,true),aId=v.getUint16(6,true),bId=v.getUint16(10,true),mode=v.getUint16(12,true);
 ensure(op>=105&&op%100===5&&v.getUint16(2,true)===op-4&&v.getUint16(4,true)===0&&v.getUint16(8,true)===0&&[0,65535].includes(v.getUint16(14,true))&&v.getUint16(16,true)===aId&&v.getUint16(18,true)===bId,'Unsupported connected-cut fields');
 ensure(Number.isFinite(v.getFloat32(20,true))&&v.getFloat32(20,true)>=0&&v.getFloat32(20,true)<=10000,'Invalid connected-cut pick');for(let i=24;i<32;i++)ensure(historyRecord[i]===0,'Unknown connected-cut tail');
 const a=objects.find(o=>o.id===aId),b=objects.find(o=>o.id===bId);ensure(a&&b,'Missing connected-cut operands');
 const ends={4:[1,0],5:[0,0],6:[1,1],7:[0,1]}[mode];ensure(ends,'Unknown connected endpoint mode');
 if(aId===bId){ensure(mode===6&&a.geometryKind&&v.getUint16(14,true)===65535&&v.getFloat32(20,true)<=1,'Unsupported self-connection');constructionCurve(a);return[{...a,lastModifiedRecord:record,operation:'same-end-selection'}];}
 const ap=ends[0]?a.points.at(-1):a.points[0],bp=ends[1]?b.points.at(-1):b.points[0];
 const shared=Math.hypot(...ap.map((x,k)=>x-bp[k]))<.0001;
 if(shared&&v.getUint16(14,true)===65535&&mode===6&&a.geometryKind&&b.geometryKind){
  const p=constructionCurve(a),q=constructionCurve(b),end=p.at(-1);ensure(p.length<=401&&q.length<=401&&Math.hypot(...end.map((x,k)=>x-q.at(-1)[k]))<.0001,'Only already-shared curve ends are verified');
  // Both explicitly selected ends already coincide. Other intersections do
  // not choose a replacement endpoint; keep the existing identities/geometry.
  return [a,b].map(o=>({...o,lastModifiedRecord:record,operation:'shared-curve-end',dependencies:[...(o.dependencies??[]),o===a?bId:aId]}));
 }
 if(shared&&mode===5&&v.getUint16(14,true)===0&&a.geometryKind&&b.geometryKind){
  const p=constructionCurve(a),q=constructionCurve(b),same=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]))<.0001;let common=0;while(common+1<Math.min(p.length,q.length)&&same(p[common+1],q[common+1]))common++;
  if(common>=2){ensure(common<p.length-1&&common<q.length-1,'Connection would erase an entire coincident path');const left=p.slice(common),right=q.slice(common),hits=intersectConstructionPaths(left,right);ensure(hits.length===1&&same(hits[0].point,left[0])&&same(hits[0].point,right[0]),'Ambiguous remaining connection after common prefix');return[a,b].map((o,i)=>{const points=(i?right:left).map(p=>p.slice());return{...o,points,lastModifiedRecord:record,operation:'trim-common-selected-prefix',dependencies:[...(o.dependencies??[]),i?a.id:b.id],...(points.length>2?{geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-cut-v1',points:points.map(p=>p.slice())}}:{geometryKind:undefined,directionPolyline:undefined,samplingToleranceMm:undefined})};});}
 }
 if(shared)return [a,b].map(o=>({...o,lastModifiedRecord:record,operation:'connect-shared-ends',dependencies:[...(o.dependencies??[]),o===a?bId:aId]}));
 return connectComputedEnds({a,b,ends,record,pickFraction:v.getUint16(14,true)===0?v.getFloat32(20,true):null});

}

export function connectComputedEnds({a,b,ends,record,pickFraction=null,allowOppositeStraight=false,allowReversedTerminal=false}){
 const p=a.geometryKind?constructionCurve(a):a.points,q=b.geometryKind?constructionCurve(b):b.points;
 ensure(p.length>=2&&q.length>=2&&p.length<=801&&q.length<=801,'Connection segment bound');
 // Native Grafis collapses very short straight supports before intersections.
 // The exact collapse threshold is not established: conservatively refuse
 // supports shorter than0.08mm, rather than extrapolating a native point as a line.
 for(const [o,rows]of[[a,p],[b,q]])if(!o.geometryKind)ensure(Math.hypot(...rows[1].map((x,k)=>x-rows[0][k]))>=.08,'Straight intersection support below conservative0.08mm bound');
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],hits=[],lengths=p.slice(1).map((q,i)=>Math.hypot(...q.map((x,k)=>x-p[i][k]))),total=lengths.reduce((a,b)=>a+b,0),otherLengths=q.slice(1).map((x,i)=>Math.hypot(...x.map((n,k)=>n-q[i][k]))),otherTotal=otherLengths.reduce((a,b)=>a+b,0);
 // A straight support is infinite even when moving the selected endpoint
 // past its opposite endpoint. Curves retain their selected terminal branch.
 // An offset miter can reverse its short terminal segment. Explicit contour
 // joining then uses that selected support in both directions; ordinary curve
 // connections retain their directed rays and all ambiguity/extension guards.
 const allowed=(t,i,n,end)=>allowOppositeStraight&&n===2||allowReversedTerminal&&(end===0&&i===0||end===1&&i===n-2)||t>=-1e-7&&t<=1+1e-7||end===0&&i===0&&t<0||end===1&&i===n-2&&t>1;
 for(let i=0;i<p.length-1;i++)for(let j=0;j<q.length-1;j++){
  const d=p[i+1].map((x,k)=>x-p[i][k]),e=q[j+1].map((x,k)=>x-q[j][k]),o=q[j].map((x,k)=>x-p[i][k]),dn=Math.hypot(...d),en=Math.hypot(...e),den=cross(d,e);ensure(dn>1e-7&&en>1e-7,'Degenerate connected segment');
  if(Math.abs(den)<1e-12*dn*en){if(Math.abs(cross(o,d))/dn<=.0001){const ta=(o[0]*d[0]+o[1]*d[1])/dn**2,tb=ta+(e[0]*d[0]+e[1]*d[1])/dn**2,extensionA=allowOppositeStraight&&p.length===2||ends[0]===0&&i===0||ends[0]===1&&i===p.length-2,extensionB=allowOppositeStraight&&q.length===2||ends[1]===0&&j===0||ends[1]===1&&j===q.length-2;ensure(!extensionA&&!extensionB&&(Math.max(ta,tb)<-1e-7||Math.min(ta,tb)>1+1e-7),'Coincident connected segments');}continue;}
  const t=cross(o,e)/den,u=cross(o,d)/den;if(!allowed(t,i,p.length,ends[0])||!allowed(u,j,q.length,ends[1]))continue;
  const point=p[i].map((x,k)=>x+t*d[k]);ensure(point.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6),'Unbounded connection');
  ensure(Math.max(Math.max(0,-t,t-1)*dn,Math.max(0,-u,u-1)*en)<=10000,'Connection extension bound');
  if(!hits.some(h=>Math.hypot(...h.point.map((x,k)=>x-point[k]))<.0002)){const fraction=(lengths.slice(0,i).reduce((a,b)=>a+b,0)+t*lengths[i])/total;const otherArc=otherLengths.slice(0,j).reduce((a,b)=>a+b,0)+u*otherLengths[j];hits.push({point,i,j,pickPosition:ends[0]===1?fraction:1-fraction,firstDistance:Math.abs((ends[0]===1?1-fraction:fraction)*total),secondDistance:Math.abs(ends[1]===1?otherTotal-otherArc:otherArc)});}
 }
 if(!hits.length&&!allowOppositeStraight&&(p.length===2||q.length===2))return connectComputedEnds({a,b,ends,record,pickFraction,allowOppositeStraight:true,allowReversedTerminal});
 let hit;const dominant=hits.filter(h=>hits.every(q=>q===h||q.firstDistance-h.firstDistance>.05*total&&q.secondDistance>=h.secondDistance-.0002));if(hits.length>1&&dominant.length===1)hit=dominant[0];else if(hits.length>1&&Number.isFinite(pickFraction)&&pickFraction>=0&&pickFraction<=1){
  // A stored pick can certify a single branch only when alternatives are
  // separated by at least5% of the first path's arc length. Small/tied branch
  // differences remain unsupported; mouse coordinates never become geometry.
  const ranked=hits.map(h=>({hit:h,error:Math.abs(h.pickPosition-pickFraction)})).sort((a,b)=>a.error-b.error);ensure(ranked[0].error<=.05&&ranked[1].error-ranked[0].error>.05,'Ambiguous connected intersection');hit=ranked[0].hit;
 }else{ensure(hits.length===1,hits.length?'Ambiguous connected intersection':'No connected intersection');hit=hits[0];}const point=hit.point.map(Math.fround);
 return [a,b].map((o,k)=>{const old=k?q:p,segment=k?hit.j:hit.i;let points=ends[k]===0?[point,...old.slice(segment+1)]:[...old.slice(0,segment+1),point];points=points.filter((v,i)=>!i||Math.hypot(...v.map((x,k)=>x-points[i-1][k]))>.0001).map(p=>p.slice());ensure(points.length>=2,'Collapsed connected path');const curved=points.length>2;return {...o,points,lastModifiedRecord:record,operation:'connect-computed-ends',dependencies:[...(o.dependencies??[]),k?a.id:b.id],...(curved?{geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-cut-v1',points:points.map(p=>p.slice())}}:{geometryKind:undefined,directionPolyline:undefined,samplingToleranceMm:undefined})};});
}


