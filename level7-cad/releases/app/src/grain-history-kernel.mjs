/** Bounded 100 mm native FL grain marker, anchored to a computed path.
 * The two marker objects are computed from construction references, not caches.
 * Other marker lengths, variants and reference families remain unsupported. */
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
import {constructionPoints} from './parallel-path-kernel.mjs';
import {pointOnConstructionCurve} from './curve-direction-kernel.mjs';
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function entries(bytes){ensure(bytes instanceof Uint8Array,'Missing grain data');const out=[];for(let at=0;at<bytes.length;){ensure(at+16<=bytes.length,'Truncated grain entry');const n=view(bytes).getUint32(at,true)*8;ensure(n>=16&&at+n<=bytes.length,'Invalid grain entry');out.push(bytes.subarray(at,at+n));at+=n;ensure(out.length<=10000,'Grain entry bound');}return out;}
export function replayGrainMarker({historyRecord,record,parameters,references,objects}){
 const h=view(historyRecord);ensure(historyRecord.length===32&&h.getUint16(0,true)===101&&h.getUint16(2,true)===104&&String.fromCharCode(...historyRecord.subarray(12)).replace(/\0+$/,'')==='GraPrg_GK_FL_c001_00','Unsupported grain construction');
 const defaults=new Map(),seen=new Set(),overrides=[];
 for(const row of entries(parameters)){const v=view(row),index=v.getInt16(4,true),key=String.fromCharCode(...row.subarray(6,14));ensure(!seen.has(index+':'+key),'Duplicate grain parameter');seen.add(index+':'+key);
  if(index===-12){ensure(row.length===88&&v.getUint32(16,true)===0&&v.getUint32(20,true)===64,'Unknown grain bindings');for(let i=0;i<8;i++)ensure(v.getUint32(24+i*8,true)===12+i&&v.getUint32(28+i*8,true)===0,'Bound grain parameters are unsupported');}
  else if(index>=0){ensure(index<=25&&row.length>=24,'Unknown grain parameter');const value=v.getFloat32(16,true);ensure(Number.isFinite(value),'Invalid grain parameter');if(key==='        ')defaults.set(index,value);else overrides.push({index,value});}
 }
 for(const {index,value}of overrides)ensure(value===defaults.get(index),'Unsupported grain size override');
 for(let i=0;i<=25;i++)ensure(i===14?Number.isFinite(defaults.get(i))&&Math.abs(defaults.get(i))<=10000:defaults.get(i)===(i===4?1:i===12?100:0),'Unsupported grain variant or length');
 const rows=entries(references).filter(row=>view(row).getUint16(6,true)===1&&view(row).getUint16(10,true)===record);ensure(rows.length===3,'Unknown grain references');const find=type=>{const found=rows.filter(row=>view(row).getUint16(8,true)===type);ensure(found.length===1,'Ambiguous grain reference');return found[0];};
 const pr=find(6),dr=find(7),cr=find(5),p=view(pr),d=view(dr),c=view(cr);
 ensure(pr.length===40&&p.getUint32(12,true)===1&&p.getUint16(16,true)===2&&p.getUint16(18,true)===512&&p.getUint32(20,true)===0&&p.getUint16(26,true)===0&&pr.subarray(32).every(x=>x===0),'Unsupported grain anchor');
 ensure(dr.length===80&&d.getUint32(12,true)===2&&d.getUint32(16,true)===1&&dr.subarray(20,76).every(x=>x===0),'Unsupported grain direction');
 ensure(cr.length===24&&c.getUint32(12,true)===101&&c.getUint32(20,true)===0,'Unsupported grain creation');
 const source=objects.find(o=>o.id===p.getUint16(24,true)),fraction=p.getFloat32(28,true),angle=d.getFloat32(76,true),id=c.getUint32(16,true);
 ensure(source&&Number.isFinite(fraction)&&fraction>=0&&fraction<=1,'Unsupported grain source');ensure(Number.isFinite(angle)&&Math.abs(angle)<=360&&id>0&&id<65535&&!objects.some(o=>o.id===id||o.id===id+1),'Invalid grain output');
 const path=constructionPoints(source),length=path.slice(1).reduce((s,p,i)=>s+Math.hypot(...p.map((x,k)=>x-path[i][k])),0),distance=fraction*length+defaults.get(14);
 ensure(distance>=0&&distance<=length,'Grain shift outside source path');
 const origin=pointOnConstructionCurve(path,distance,true),u=[Math.cos(angle*Math.PI/180),Math.sin(angle*Math.PI/180)],normal=[-u[1],u[0]],at=(length,width=0)=>origin.map((x,k)=>Math.fround(x+length*u[k]+width*normal[k]));
 const points=[at(1),at(89),at(89,2.97),at(100),at(89,-2.97),at(89)];ensure(points.flat().every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6),'Unbounded grain geometry');
 return [{id,record,points:[origin,at(1)],dependencies:[source.id],operation:'grain-marker-anchor',nativeDisplayState:253},{id:id+1,record,points,dependencies:[id],operation:'grain-marker-arrow',nativeDisplayState:253,geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'grain-marker-v1',points:points.map(p=>p.slice())}}];
}
