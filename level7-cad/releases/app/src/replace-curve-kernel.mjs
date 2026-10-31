import{canChangeConstructionLength}from'./construction-length-kernel.mjs';
import {replayQQCurve} from './multi-anchor-curve-kernel.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function entries(bytes){const rows=[];for(let at=0;at<bytes.length;){need(at+16<=bytes.length,'Truncated replacement reference');const n=view(bytes.subarray(at)).getUint32(0,true)*8;need(n>=16&&at+n<=bytes.length,'Invalid replacement entry');rows.push(bytes.subarray(at,at+n));at+=n;}return rows;}
const join=rows=>{const out=new Uint8Array(rows.reduce((n,b)=>n+b.length,0));let at=0;for(const b of rows){out.set(b,at);at+=b.length;}return out;};
/** Replacement retains the selected object's identity. Embedded thumbnails and
 * click hints are never used as curve coordinates or calculation inputs. */
export function readCurveReplacementSelection(references,record){
 const rows=entries(references).filter(b=>view(b).getUint16(6,true)===1&&view(b).getUint16(10,true)===record),selected=rows.filter(b=>view(b).getUint16(8,true)===3&&view(b).getUint32(12,true)===101);
 need(selected.length===1,'Missing replacement target');const b=selected[0],q=view(b);
 need(b.length===40&&q.getUint16(4,true)===256&&q.getUint16(16,true)===0&&q.getUint16(20,true)===2&&q.getUint16(22,true)===255,'Unsupported replacement direction or selection');
 const objectId=q.getUint16(18,true);need(objectId>=2001&&objectId<60000&&[24,28,32,36].every(at=>Number.isFinite(q.getFloat32(at,true))),'Invalid replacement target');return{objectId,rows};
}
export function replayCurveReplacement(options){
 const {historyRecord,record,parameters,references,objects}=options,name=String.fromCharCode(...historyRecord.subarray(12));need(name==='GraPrg_GK_QQ_c002_04','Unsupported curve replacement');
 const {objectId,rows}=readCurveReplacementSelection(references,record),source=objects.find(o=>o.id===objectId&&!o.hidden);need(canChangeConstructionLength(source)&&[.0001,.08].includes(source.samplingToleranceMm),'Unsupported replacement source curve');
 const parameterCopy=parameters.slice();let displacement=0;for(const raw of entries(parameterCopy)){const q=view(raw),index=q.getInt16(4,true);if(index===31){need([0,1].includes(q.getFloat32(16,true)),'Unknown replacement displacement option');displacement=Math.max(displacement,q.getFloat32(16,true));q.setFloat32(16,0,true);}if([33,46,48].includes(index))need(q.getFloat32(16,true)===0,'Moved replacement endpoints are not supported');}
 const displacementRows=rows.filter(b=>view(b).getUint16(8,true)===3&&view(b).getUint32(12,true)===51);need(displacementRows.length===displacement,'Unknown replacement displacement reference');
 if(displacement){const b=displacementRows[0],q=view(b);need(b.length===40&&q.getUint16(16,true)===0&&q.getUint16(18,true)===objectId&&q.getUint16(20,true)===2&&q.getUint16(22,true)===255&&[24,28,32,36].every(at=>Number.isFinite(q.getFloat32(at,true))),'Unsupported replacement base line');}
 const curveRows=rows.filter(b=>[5,6].includes(view(b).getUint16(8,true)));need(curveRows.length+1+displacement===rows.length,'Unknown replacement reference');
 const call=historyRecord.slice();call.set(new TextEncoder().encode('GraPrg_GK_QQ_c001_04'),12);
 const curve=replayQQCurve({...options,historyRecord:call,parameters:parameterCopy,references:join(curveRows)});need(!curve.dependencies.includes(objectId),'Replacement endpoints must not depend on the replaced curve');
 return{...source,...curve,rasterConstruction:curve.rasterConstruction,id:objectId,replacementReservedId:curve.id,operation:'replace-curve',lastModifiedRecord:record,dependencies:[...new Set([...(source.dependencies??[]),...curve.dependencies])]};
}

/** Exact append shape admitted by the cross-part identity guard. */
export function appendedCurveReplacement(before,after){
 try{
  const eq=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
  need(after.history.length===before.history.length+32&&eq(before.history,after.history.subarray(0,before.history.length)),'Not one appended replacement');
  need(after.references.length===before.references.length+144&&eq(before.references,after.references.subarray(0,before.references.length)),'Not canonical replacement references');
  const call=after.history.subarray(-32),q=view(call),record=after.history.length/32;need(q.getUint16(0,true)===101&&q.getUint16(2,true)===104&&q.getUint16(8,true)===0&&q.getUint16(10,true)===20&&String.fromCharCode(...call.subarray(12))==='GraPrg_GK_QQ_c002_04','Not replacement call');
  const reserved=q.getUint16(6,true),suffix=after.references.subarray(before.references.length),rows=entries(suffix);need(rows.length===4,'Unknown replacement references');
  for(const [i,[length,type,key]]of [[24,5,101],[40,6,1],[40,6,2],[40,3,101]].entries()){const r=view(rows[i]);need(rows[i].length===length&&r.getUint16(6,true)===1&&r.getUint16(8,true)===type&&r.getUint16(10,true)===record&&r.getUint32(12,true)===key,'Unknown replacement suffix');}
  const creation=view(rows[0]);need(creation.getUint32(16,true)===reserved&&creation.getUint32(20,true)===0,'Unknown reserved replacement ID');
  const {objectId}=readCurveReplacementSelection(suffix,record);need(reserved>objectId&&reserved<60000,'Invalid replacement identity');return{objectId,reserved};
 }catch{return null;}
}
