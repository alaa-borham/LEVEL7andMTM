/** Arc-length endpoint deformation of computed construction segments.
 * Source identity and the opposite endpoint are preserved. No display-cache
 * coordinates, cursor positions or recorded transformation matrices are inputs. */
import {constructionPoints} from './parallel-path-kernel.mjs';
const ensure=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function moveConstructionEndpoint(points,target,endpoint){
 ensure(Array.isArray(points)&&points.length>=2&&points.length<=8192&&points.every(p=>p.length===2&&p.every(Number.isFinite)),'Invalid deformation path');ensure([0,1].includes(endpoint)&&target?.length===2&&target.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6),'Invalid deformation endpoint');
 const p=endpoint?points.toReversed():points.map(p=>p.slice()),arc=[0];for(let i=1;i<p.length;i++){const length=Math.hypot(...p[i].map((x,k)=>x-p[i-1][k]));ensure(length>1e-7,'Degenerate deformation segment');arc.push(arc.at(-1)+length);}const length=arc.at(-1),delta=target.map((x,k)=>x-p[0][k]);ensure(length>1e-7&&length<=1e6&&Math.hypot(...delta)<=10000,'Deformation outside bounded range');
 const out=p.map((q,i)=>q.map((x,k)=>Math.fround(x+(1-arc[i]/length)*delta[k])));out[0]=target.map(Math.fround);ensure(out.every((p,i)=>p.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)&&(!i||Math.hypot(...p.map((x,k)=>x-out[i-1][k]))>1e-7)),'Collapsed or unbounded deformation');return endpoint?out.toReversed():out;
}
export function replayEndpointMorph({records,record,objects}){
 ensure(records?.length===3&&records.every(b=>b instanceof Uint8Array&&b.length===32),'Incomplete endpoint deformation group');const[a,b,c]=records.map(view);
 ensure(a.getUint16(0,true)===196&&a.getUint16(2,true)===101&&a.getUint16(4,true)===3&&a.getUint16(6,true)===0&&a.getUint32(12,true)===65536&&a.getUint32(16,true)===44&&records[0].subarray(20,28).every(x=>x===0),'Unsupported deformation target selector');const fraction=a.getFloat32(28,true);ensure(fraction===0||fraction===1,'Only endpoint deformation targets are verified');
 const id=b.getUint16(6,true);ensure(b.getUint16(0,true)===218&&b.getUint16(2,true)===201&&b.getUint16(4,true)===2&&b.getUint16(8,true)===id&&b.getUint16(10,true)===1&&records[1].subarray(12,20).every(x=>x===0)&&b.getUint32(28,true)===0,'Unsupported endpoint deformation consumer');
 ensure(c.getUint16(0,true)===318&&c.getUint16(2,true)===301&&c.getUint16(4,true)===10000&&[0,1].includes(c.getUint16(6,true))&&[0,0xff6b0000].includes(c.getUint32(8,true))&&records[2].subarray(12,20).every(x=>x===0)&&c.getUint32(28,true)===0,'Unsupported deformation terminator');
 const context=[b.getUint32(20,true),b.getUint32(24,true)];ensure((context[0]===0&&context[1]===0||context[0]===65536&&context[1]===0xffed0003)&&context.every((x,i)=>x===c.getUint32(20+i*4,true)),'Unknown deformation context');
 const source=objects.find(o=>o.id===id),targetId=a.getUint32(8,true),target=objects.find(o=>o.id===targetId);ensure(source&&target&&source.geometryKind==='sampled-curve','Missing computed deformation source/target');const construction=constructionPoints(source),p=source.samplingToleranceMm===.0001?source.points:construction,position=(fraction?target.points.at(-1):target.points[0]).slice();ensure(target.points.length===2||target.geometryKind==='sampled-curve','Unsupported deformation target geometry');
 const points=moveConstructionEndpoint(p,position,c.getUint16(6,true));return{...source,points,lastModifiedRecord:record+2,operation:'move-curve-endpoint',dependencies:[...new Set([...(source.dependencies??[]),targetId])],geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-morph-v1',points:points.map(p=>p.slice())}};
}
