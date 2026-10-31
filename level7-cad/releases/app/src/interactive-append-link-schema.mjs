import{readInteractiveInsertedLine}from'./interactive-insert-line-kernel.mjs';
import{decodeQSPointSelection}from'./native-qs-point-selection.mjs';
import{readInteractiveInsertedPoint}from'./interactive-insert-point-kernel.mjs';
const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),eq=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
/** A single new QS10/QQ10 call may add references; existing references and
 * parameter blocks remain exact. Geometry execution is checked by commit. */
export function appendedLineCurveReferences(a,b){
 try{
  if(b.history.length!==a.history.length+32||!eq(a.history,b.history.subarray(0,a.history.length))||!eq(a.references,b.references.subarray(0,a.references.length)))return false;
  const raw=b.history.subarray(a.history.length),q=v(raw),name=String.fromCharCode(...raw.subarray(12)),line=name==='GraPrg_GK_QS_c001_02',curve=name==='GraPrg_GK_QQ_c001_04';
  const point=name==='GraPrg_GK_TO_c004_02',insertLine=name==='GraPrg_GK_TO_c003_03';if(!line&&!curve&&!point&&!insertLine)return false;const id=q.getUint16(6,true),index=q.getUint16(4,true),record=b.history.length/32;
  if(q.getUint16(0,true)!==101||q.getUint16(2,true)!==104||q.getUint16(8,true)!==0||q.getUint16(10,true)!==20||id<2001||id>=60000)return false;
  const key=`3.${a.partId}.3.${index}`;if(a.parameters.has(key)||!b.parameters.has(key)||b.parameters.size!==a.parameters.size+1||[...a.parameters].some(([k,p])=>!eq(p,b.parameters.get(k)??new Uint8Array())))return false;
  const suffix=b.references.subarray(a.references.length);if(point||insertLine){if(suffix.length!==64)return false;const plan=(insertLine?readInteractiveInsertedLine:readInteractiveInsertedPoint)({historyRecord:raw,record,parameters:b.parameters.get(key),references:suffix});return plan.sourcePartId<a.partId&&plan.mappings[0].objectId===id;}if(suffix.length!==(line?144:104))return false;
  for(const[at,size,type,pick]of [[0,24,5,101],[24,40,6,1],[64,line?80:40,line?7:6,2]]){const r=v(suffix.subarray(at,at+size));if(r.getUint32(0,true)*8!==size||r.getUint16(4,true)!==0||r.getUint16(6,true)!==1||r.getUint16(8,true)!==type||r.getUint16(10,true)!==record||r.getUint32(12,true)!==pick)return false;}
  if(v(suffix).getUint32(16,true)!==id||v(suffix).getUint32(20,true)!==0)return false;
  if(line){decodeQSPointSelection(suffix.subarray(24,64));const direction=suffix.subarray(64),d=v(direction);if(d.getUint32(16,true)!==1||!direction.subarray(20,76).every(n=>n===0)||!Number.isFinite(d.getFloat32(76,true))||Math.abs(d.getFloat32(76,true))>3600)return false;}
  else for(const at of[24,64]){const pick=suffix.subarray(at,at+40),p=v(pick),mode=p.getUint16(16,true),flags=p.getUint16(18,true);if(p.getUint32(20,true)!==0||!pick.subarray(32).every(n=>n===0))return false;if(mode===7&&flags===0){if(![24,28].every(i=>Number.isFinite(p.getFloat32(i,true))&&Math.abs(p.getFloat32(i,true))<=1e6))return false;}else if(mode===2&&flags===512){const source=p.getUint32(24,true),f=p.getFloat32(28,true);if(source<2001||source>=60000||!Number.isFinite(f)||f<0||f>1)return false;}else return false;}
  return true;
 }catch{return false;}
}
