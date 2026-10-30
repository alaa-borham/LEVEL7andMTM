import{canChangeConstructionLength}from'./construction-length-kernel.mjs';
import {buildOriginalCurve10Definition} from './original-curve10-create.mjs';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {serializeMdl} from './native-mdl.js';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
import {constructionPoints} from './parallel-path-kernel.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
/** Appends a native QQ replacement, preserving the old result ID for descendants. */
export function replaceOriginalCurve(doc,{partId,sizeKey,objectId,...options}={}){
 const source=createPartHistoryCalculation(doc,{sizeKey}).get(partId).objects.find(o=>o.id===objectId&&!o.hidden);need(canChangeConstructionLength(source)&&[.0001,.08].includes(source.samplingToleranceMm),'اختر منحنى أصليًا مدعومًا للاستبدال.');
 for(const pick of [options.origin,options.final])need(pick?.lineId!==objectId,'لا يمكن ربط طرف المنحنى البديل بالمنحنى الذي سيُستبدل.');const points=constructionPoints(source);need(points.length>=3,'مسار المنحنى غير مدعوم.');
 const r=buildOriginalCurve10Definition(doc,{partId,sizeKey,...options}),bytes=serializeMdl(r.document),one=k=>{const b=r.document.blocks.find(b=>b.id.join('.')===k);need(b,'Missing replacement block');return bytes.slice(b.payloadOffset,b.endOffset);},history=one(`3.${partId}.2.0`),header=one(`3.${partId}.1.0`),references=one(`3.${partId}.4.0`),list=one('2.1.0.0');history.set(new TextEncoder().encode('GraPrg_GK_QQ_c002_04'),history.length-20);
 const selection=new Uint8Array(40),q=view(selection);[5,0,256,1,3,r.record,101,0,0,objectId,2,255].forEach((n,i)=>q.setUint16(i*2,n,true));const a=points[0],b=points[1];q.setFloat32(24,.25,true);q.setFloat32(28,a[0]+(b[0]-a[0])*.25,true);q.setFloat32(32,a[1]+(b[1]-a[1])*.25,true);q.setFloat32(36,Math.hypot(...b.map((n,k)=>n-a[k]))*.25,true);
 const newRefs=new Uint8Array(references.length+40);newRefs.set(references);newRefs.set(selection,references.length);view(header).setUint32(8,view(header).getUint32(8,true)-5,true);view(header).setUint32(36,newRefs.length/8,true);
 const text=String.fromCharCode(...list);let at=text.indexOf('#TLIST\r\n')+8,found=0;need(at>=8,'Missing part list');while(at<text.length&&!text.slice(at).startsWith('#')){const end=text.indexOf('\r\n',at);need(end>=0,'Invalid part list');if(Number(text.slice(at+3,at+6))===partId){list.set(new TextEncoder().encode(String(Number(text.slice(at+37,at+41))-1).padStart(4,' ')),at+37);found++;}at=end+2;}need(found===1,'Ambiguous part list');
 const next=replaceOriginalBlocks(r.document,new Map([[`3.${partId}.2.0`,history],[`3.${partId}.1.0`,header],[`3.${partId}.4.0`,newRefs],['2.1.0.0',list]]));return{...commitOriginalDefinition(doc,next,{sizeKey,objectId}),curveId:objectId,reservedId:r.curveId,record:r.record};
}
