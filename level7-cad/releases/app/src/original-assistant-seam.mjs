/** Native assistant standard allowance for a new axis-aligned Rectangle10.
 * Creates four referenced cutting sides; keeps the four source IDs as seams.
 * No individual/tapered allowances or arbitrary corner rules are implied. */
import {serializeMdl} from './native-mdl.js';
import {findOriginalAssistantContour} from './original-assistant-contour.mjs';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
import {assertPartLinksPreserved} from './part-link-guard.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function inspectOriginalAssistantSeam(doc,options={}){
 const plan=findOriginalAssistantContour(doc,options),model=createPartHistoryCalculation(doc,options).get(options.partId);
 need(model.objects.length===5&&model.historyRecords===9&&model.trace.length===6&&model.trace[0].operation==='native-point-line-group'&&model.trace[1].operation==='interactive-rectangle10'&&model.trace.slice(2).every(t=>t.operation==='connected-cut'),'السماحية القياسية متاحة لمستطيل أصلي جديد بعد غلق حدوده فقط.');
 const sides=plan.sourceIds.map(id=>model.objects.find(o=>o.id===id));need(sides.every(o=>o.shapeConstruction?.baseDirection===0&&o.shapeConstruction?.firstObjectId===2002)&&plan.sourceIds.every(id=>id>=2002&&id<=2005)&&model.objects[0].id===2001,'تعريف المستطيل يحتاج تخطيط المعرّفات والاتجاه المختبر.');
 return {...plan,sourceIds:[plan.chain.at(-1).id,...plan.chain.slice(0,-1).map(p=>p.id)],targetIds:[2006,2007,2008,2009]};
}
function append(doc,{partId,sizeKey,raw,newId}){
 const bytes=serializeMdl(doc),one=k=>{const b=doc.blocks.filter(b=>b.id.join('.')===k);need(b.length===1,'Missing or ambiguous allowance block');return bytes.slice(b[0].payloadOffset,b[0].endOffset);};
 const history=one(`3.${partId}.2.0`),header=one(`3.${partId}.1.0`),cache=one(`3.${partId}.7.1`),count=view(cache).getUint32(0,true),nextHistory=new Uint8Array(history.length+raw.length);nextHistory.set(history);nextHistory.set(raw,history.length);
 need(header.length===152&&history.length%32===0&&raw.length%32===0&&nextHistory.length<=4096*32&&view(header).getUint32(20,true)*8===history.length&&view(header).getUint32(8,true)===count*5,'Invalid allowance native counts');
 view(header).setUint32(20,nextHistory.length/8,true);if(newId)view(header).setUint32(8,(count+1)*5,true);
 const list=one('2.1.0.0'),text=String.fromCharCode(...list),marker=text.indexOf('#TLIST\r\n');need(marker>=0,'Missing allowance part list');let at=marker+8,found=0;
 while(at<text.length&&!text.slice(at).startsWith('#')){const end=text.indexOf('\r\n',at);need(end>=0,'Invalid allowance part list');if(Number(text.slice(at+3,at+6))===partId){need(Number(text.slice(at+32,at+37))===history.length/32&&Number(text.slice(at+37,at+41))===count,'Allowance list counts differ');for(const[offset,n,width]of [[32,nextHistory.length/32,5],[37,count+(newId?1:0),4]])list.set(new TextEncoder().encode(String(n).padStart(width,' ')),at+offset);found++;}at=end+2;}
 need(found===1,'Ambiguous allowance part');const next=replaceOriginalBlocks(doc,new Map([[`3.${partId}.2.0`,nextHistory],[`3.${partId}.1.0`,header],['2.1.0.0',list]]));
 return commitOriginalDefinition(doc,next,{sizeKey,objectId:newId??2002,...(newId?{newLine:{partId,objectId:newId}}:{})}).document;
}
export function addOriginalAssistantStandardSeam(doc,{partId,sizeKey,objectId=2002,allowance=10,lineAllowances={}}={}){
 need(typeof allowance==='number'&&Number.isFinite(allowance)&&allowance>=.1&&allowance<=100,'أدخل سماحية موحدة بين 0.1 و100 مم.');
 const options={partId,sizeKey,objectId},plan=inspectOriginalAssistantSeam(doc,options);
 need(lineAllowances&&typeof lineAllowances==='object'&&!Array.isArray(lineAllowances)&&Object.keys(lineAllowances).every(k=>plan.sourceIds.includes(Number(k))),'اختر أحد حدود المستطيل الأصلية للسماحية الفردية.');
 const distances=plan.sourceIds.map(id=>{const pair=lineAllowances[id]??[allowance,allowance];need(Array.isArray(pair)&&pair.length===2&&pair.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=.1&&n<=100),'أدخل سماحية البداية والنهاية بين 0.1 و100 مم.');return pair.map(Math.fround);});let next=doc;
 for(let i=0;i<4;i++){const raw=new Uint8Array(96),q=view(raw),op=197+300*i;[[op,op-97,402,0],[op+100,op+3,403,0],[op+107,op+109,0,plan.sourceIds[i],65535,plan.targetIds[i]]].forEach((values,r)=>values.forEach((n,k)=>q.setUint16(32*r+2*k,n,true)));q.setFloat32(8,distances[i][0],true);q.setFloat32(40,distances[i][1],true);q.setFloat32(80,1,true);next=append(next,{partId,sizeKey,raw,newId:plan.targetIds[i]});}
 const states=new Uint8Array(64),entries=plan.sourceIds.flatMap((id,i)=>[[plan.targetIds[i],1],[id,249]]);let n=0;
 for(let r=0;r<2;r++){const q=view(states.subarray(r*32)),offset=r?4:6,capacity=r?7:6;q.setUint16(0,1317+100*r,true);q.setUint16(2,1303+100*r,true);if(!r)q.setUint16(4,8,true);for(let i=0;i<capacity&&n<entries.length;i++,n++){q.setUint16(offset+4*i,entries[n][0],true);q.setUint16(offset+4*i+2,entries[n][1],true);}}
 next=append(next,{partId,sizeKey,raw:states});
 for(let i=0;i<4;i++){const raw=new Uint8Array(32),q=view(raw),a=plan.targetIds[i],b=plan.targetIds[(i+1)%4];[105+100*i,101+100*i,0,a,0,b,4,0,a,b].forEach((n,k)=>q.setUint16(2*k,n,true));q.setFloat32(20,1,true);next=append(next,{partId,sizeKey,raw});}
 const impact=assertPartLinksPreserved(doc,next);need(!impact.unresolvedReferences.length,'تعذّر التحقق من روابط البارتات بعد السماحية.');
 return {document:next,partId,sizeKey,sourceIds:plan.sourceIds,targetIds:plan.targetIds,allowance:Math.fround(allowance),lineAllowances:Object.fromEntries(plan.sourceIds.map((id,i)=>[id,distances[i]])),recalculationOrder:impact.recalculationOrder,fullIndependentGeometry:false};
}
