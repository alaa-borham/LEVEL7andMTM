/** Experimental mathematical AB/GL calculation at an explicit history boundary.
 * Native rounding and selector semantics remain subject to differential tests.
 * Never writes MDL; unknown selectors and ambiguous intersections are rejected.
 */
import {constructionPoints} from './parallel-path-kernel.mjs';
import {pointOnConstructionCurve} from './curve-direction-kernel.mjs';
const ensure=(b,m)=>{if(!b)throw Error(m);};
const finite=n=>{ensure(Number.isFinite(n)&&Math.abs(n)<=1e6,'Invalid geometric coordinate');return n;};
const xy=p=>{ensure(Array.isArray(p)&&p.length===2,'Invalid point');return p.map(finite);};
function line(points){ensure(points?.length===2,'Only straight lines are supported');const [a,b]=points.map(xy),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);ensure(length>1e-7,'Degenerate measured line');return{a,b,dx,dy,length};}
export function straightLineIntersection(first,second){
 const a=line(first),b=line(second),cross=a.dx*b.dy-a.dy*b.dx;
 ensure(Math.abs(cross)>1e-10*a.length*b.length,'Parallel or ambiguous line intersection');
 const t=((b.a[0]-a.a[0])*b.dy-(b.a[1]-a.a[1])*b.dx)/cross;
 return [finite(a.a[0]+t*a.dx),finite(a.a[1]+t*a.dy)];
}
/** Unique intersection with a bounded, independently constructed QQ polyline.
 * Multiple intersections are rejected until native branch selection is decoded.
 * The straight operand is extended, as in straightLineIntersection. */
export function uniqueLinePolylineIntersection(first,points){
 const a=line(first);ensure(Array.isArray(points)&&points.length>=3&&points.length<=401,'Invalid construction polyline');points.forEach(xy);
 const intersections=[];
 for(let i=1;i<points.length;i++){
  const b=line([points[i-1],points[i]]),cross=a.dx*b.dy-a.dy*b.dx,offset=[b.a[0]-a.a[0],b.a[1]-a.a[1]];
  if(Math.abs(cross)<=1e-10*a.length*b.length){ensure(Math.abs(offset[0]*a.dy-offset[1]*a.dx)>1e-7*a.length,'Coincident or ambiguous curve intersection');continue;}
  const u=(offset[0]*a.dy-offset[1]*a.dx)/cross;if(u< -1e-8||u>1+1e-8)continue;
  const t=(offset[0]*b.dy-offset[1]*b.dx)/cross,p=[finite(a.a[0]+t*a.dx),finite(a.a[1]+t*a.dy)];
  if(!intersections.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=1e-5))intersections.push(p);
 }
 ensure(intersections.length===1,intersections.length?'Ambiguous curve intersection':'Missing curve intersection');return intersections[0];
}
function operandIntersection(first,second){
 if(!first.geometryKind&&!second.geometryKind)return straightLineIntersection(first.points,second.points);
 ensure(!first.geometryKind&&second.geometryKind==='sampled-curve','Unsupported intersection operand order');
 ensure(['qq-one-natural-end-v1','qq-two-relative-end-v1'].includes(second.directionPolyline?.family),'Unsupported construction curve family');
 return uniqueLinePolylineIntersection(first.points,second.directionPolyline.points);
}
export function evaluateGeometricZ({definition,objects,throughRecord}){
 ensure(Number.isInteger(throughRecord)&&throughRecord>=0&&definition.recordStep===throughRecord+1,'Geometry must be from immediately before the Z record boundary');
 ensure(Array.isArray(objects)&&objects.length<=10000,'Invalid bounded geometry');const map=new Map();
 for(const o of objects){ensure(Number.isInteger(o.id)&&o.id>0&&!map.has(o.id),'Invalid or duplicate object');ensure(Number.isInteger(o.record)&&o.record<=throughRecord,'Missing or future construction position');map.set(o.id,o);}
 const dependencies=[];
 const object=id=>{const o=map.get(id);ensure(o,'Missing geometric operand '+id);dependencies.push(id);return o;};
 const refs=definition.geometricReferences;ensure(Array.isArray(refs),'Missing geometric references');
 const decode=bytes=>{ensure(bytes instanceof Uint8Array&&bytes.length===12,'Invalid geometric reference span');return new DataView(bytes.buffer,bytes.byteOffset,12);};
 let value;
 if(definition.formula==='GL'){
  ensure(definition.flags===0xcc00&&refs.length===1,'Unsupported length definition');const v=decode(refs[0]);
  for(let i=2;i<12;i++)ensure(v.getUint8(i)===0,'Unknown line length selector');value=line(object(v.getUint16(0,true)).points).length;
 }else{
  ensure(definition.formula==='AB'&&definition.flags===0x4c00&&refs.length===2,'Unsupported geometric formula');
  const points=refs.map(bytes=>{const v=decode(bytes),o=object(v.getUint16(0,true)),mode=v.getUint16(2,true);
   if(mode===1){ensure(v.getUint32(4,true)===0&&v.getUint32(8,true)===0&&!o.geometryKind&&o.points.length===1,'Unsupported geometric point reference');return xy(o.points[0]);}
   if(mode===2){ensure(v.getUint32(4,true)===0,'Unsupported endpoint flags');const t=v.getFloat32(8,true);ensure(Number.isFinite(t)&&t>=0&&t<=1,'Unsupported endpoint fraction');if(t===0||t===1){if(o.geometryKind)constructionPoints(o);else line(o.points);return xy(t?o.points.at(-1):o.points[0]);}const p=constructionPoints(o),length=p.slice(1).reduce((s,q,i)=>s+Math.hypot(...q.map((x,k)=>x-p[i][k])),0);return xy(pointOnConstructionCurve(p,t*length,true));}
   ensure(mode===6&&v.getUint16(6,true)===0,'Unsupported geometric point selector');const hint=v.getFloat32(8,true);ensure(Number.isFinite(hint)&&hint>=0&&hint<=1,'Invalid intersection selection hint');
   // Two nonparallel straight lines have exactly one intersection; the stored
   // curve branch hint does not select between multiple solutions in this case.
   return operandIntersection(o,object(v.getUint16(4,true)));
  });value=Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);
 }
 return {index:definition.index,recordStep:definition.recordStep,formula:definition.formula,value:finite(value),dependencies:[...new Set(dependencies)],status:'experimental-geometric-value',nativeCompatibilityVerified:false,canSaveMdl:false};
}
