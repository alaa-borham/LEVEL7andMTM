import{readCurveReplacementSelection}from'./replace-curve-kernel.mjs';
/** Native QQ definition edits. Base-point selectors and identity records remain
 * byte exact; auxiliary supports retain their relative construction semantics. */
import {serializeMdl} from './native-mdl.js';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function definitions(doc,partId){
 const bytes=serializeMdl(doc),one=k=>{const rows=doc.blocks.filter(b=>b.id.join('.')===k);need(rows.length===1,'Missing or ambiguous native definition');return bytes.subarray(rows[0].payloadOffset,rows[0].endOffset);},history=one(`3.${partId}.2.0`),out=[];
 for(let record=1;record<=history.length/32;record++){
  const h=history.subarray((record-1)*32,record*32),q=v(h);if(q.getUint16(0,true)!==101||q.getUint16(2,true)!==104||!['GraPrg_GK_QQ_c001_04','GraPrg_GK_QQ_c002_04'].includes(String.fromCharCode(...h.subarray(12))))continue;
  try{
   const parameterKey=`3.${partId}.3.${q.getUint16(4,true)}`,payload=one(parameterKey),rows=new Map(),bindings=new Map();
   for(let at=0;at<payload.length;){const raw=payload.subarray(at),p=v(raw),length=p.getUint32(0,true)*8;need(length>=24&&at+length<=payload.length,'Invalid QQ parameter span');const index=p.getInt16(4,true),key=String.fromCharCode(...raw.subarray(6,14));need(!rows.has(index+':'+key),'Duplicate QQ row');rows.set(index+':'+key,{at,value:p.getFloat32(16,true)});
    if(index===-12){const n=p.getUint32(20,true);need(n%8===0&&24+n<=length,'Invalid QQ bindings');for(let i=24;i<24+n;i+=8)bindings.set(p.getUint32(i,true),p.getUint32(i+4,true));}at+=length;
   }
   const get=i=>rows.get(i+':        ')?.value,count=get(3);need(get(0)===2&&get(2)===1&&[2,3].includes(get(4))&&get(5)===1&&Number.isInteger(count)&&count>=2&&count<=5,'Unsupported QQ family');
   const controls=[];let base=0,helper=0;
   for(let i=0;i<count;i++){
    const at=28+15*i,type=get(at);need([1,2].includes(type),'Unknown QQ support');
    const add=(index,kind,label,min,max)=>{const row=rows.get(index+':        ');need(row&&Number.isFinite(row.value),'Missing control field');if(bindings.get(index))return;const sized=[...rows].filter(([k])=>k.startsWith(index+':')&&k!==index+':        ');need(sized.every(([,r])=>r.value===row.value),'Size-dependent control field');controls.push({index,kind,label,value:row.value,min,max,at:row.at,matchingSizeOffsets:sized.map(([,r])=>r.at)});};
    if(type===1){base++;if(get(at+2)!==0)add(at+7,'angle',`اتجاه النقطة الأساسية ${base} (°)`,-60,60);}
    else{helper++;add(at+5,'fraction',`نقطة التحكم ${helper}: الموضع (%)`,.001,99.999);add(at+6,'height',`نقطة التحكم ${helper}: الارتفاع النسبي (%)`,-20,20);}
   }
   if(controls.length)out.push({partId,record,objectId:String.fromCharCode(...h.subarray(12))==='GraPrg_GK_QQ_c002_04'?readCurveReplacementSelection(one(`3.${partId}.4.0`),record).objectId:q.getUint16(6,true),parameterKey,controls,payload});
  }catch{/* Unsupported definitions never become editable by guessing fields. */}
 }
 return out.filter(d=>!out.some(later=>later.objectId===d.objectId&&later.record>d.record));
}
export function inspectOriginalCurveControls(doc,{partId,sizeKey}={}){
 try{const graph=createPartHistoryCalculation(doc,{sizeKey}),part=graph.get(partId);need(part.historyFullyExecuted,'سجل البارت لم يكتمل حسابه.');const rows=definitions(doc,partId);return{eligible:true,curves:rows.map(({payload,...d})=>({...d,controls:d.controls.map(({at,matchingSizeOffsets,...c})=>c)}))};}catch(e){return{eligible:false,curves:[],reason:e.message};}
}
export function editOriginalCurveControls(doc,{partId,record,edits,sizeKey}={}){
 need(Array.isArray(edits)&&edits.length>0&&edits.length<=12,'اختر قيمة تحكم واحدة على الأقل.');
 const definition=definitions(doc,partId).find(d=>d.record===record);need(definition,'تعريف المنحنى غير مدعوم.');const payload=definition.payload.slice(),seen=new Set();let changed=false;
 for(const edit of edits){need(edit&&Number.isInteger(edit.index)&&!seen.has(edit.index),'Duplicate or invalid control');seen.add(edit.index);const c=definition.controls.find(c=>c.index===edit.index);need(c,'هذا المعامل مرتبط أو غير مدعوم؛ لم تتغير مراجع المنحنى.');need(typeof edit.value==='number'&&Number.isFinite(edit.value)&&edit.value>=c.min&&edit.value<=c.max,'قيمة التحكم خارج النطاق المدعوم.');const value=Math.fround(edit.value);if(value===c.value)continue;changed=true;for(const at of[c.at,...c.matchingSizeOffsets])v(payload).setFloat32(at+16,value,true);}
 need(changed,'لم تتغير قيم التحكم.');const next=replaceOriginalBlocks(doc,new Map([[definition.parameterKey,payload]]));return{...commitOriginalDefinition(doc,next,{sizeKey,objectId:definition.objectId}),record,partId};
}
