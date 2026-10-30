import {serializeMdl} from './native-mdl.js';
import {readNativeMetadata} from './native-measurements.js';
import {inspectOriginalCurveControls} from './original-curve-controls.mjs';
import {inspectCurveConstruction} from './curve-construction-controls.mjs';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
const need=(x,m)=>{if(!x)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function layout(doc,{partId,record,sizeKey}){
 need(sizeKey===readNativeMetadata(doc).referenceSize?.name,'تغيير نقاط التعريف متاح للمقاس الأساسي فقط.');const d=inspectOriginalCurveControls(doc,{partId,sizeKey}).curves.find(d=>d.record===record);need(d,'تعريف المنحنى غير مدعوم.');const bytes=serializeMdl(doc),blocks=doc.blocks.filter(b=>b.id.join('.')===d.parameterKey);need(blocks.length===1,'Ambiguous QQ block');const hb=doc.blocks.find(b=>b.id.join('.')===`3.${partId}.2.0`),history=bytes.subarray(hb.payloadOffset,hb.endOffset),parameter=Number(d.parameterKey.split('.').at(-1));let uses=0;for(let at=0;at<history.length;at+=32){const h=view(history.subarray(at,at+32));if(h.getUint16(0,true)===101&&h.getUint16(4,true)===parameter)uses++;}need(uses===1,'تعريف المعاملات مشترك بين خطوات أخرى؛ لم يُغيّر عدد النقاط.');need(String.fromCharCode(...history.subarray((record-1)*32+12,record*32))!=='GraPrg_GK_QQ_c002_04','إضافة نقاط مساعدة إلى المنحنى البديل تحتاج تحققًا إضافيًا.');const payload=bytes.slice(blocks[0].payloadOffset,blocks[0].endOffset),v=view(payload),rows=new Map(),bindings=[];
 for(let at=0;at<payload.length;){const n=v.getUint32(at,true)*8,index=v.getInt16(at+4,true),key=String.fromCharCode(...payload.subarray(at+6,at+14));need(n>=24&&at+n<=payload.length,'Invalid QQ row');const k=index+':'+key;need(!rows.has(k),'Duplicate QQ row');rows.set(k,{at,index,key});if(index===-12){const count=v.getUint32(at+20,true);need(count%8===0&&24+count<=n,'Invalid QQ bindings');for(let k=24;k<24+count;k+=8){need(v.getUint32(at+k+4,true)===0,'إضافة وحذف النقاط ذات المعاملات المرتبطة لم يُدعما بعد.');bindings.push({at:at+k,index:v.getUint32(at+k,true)});}}at+=n;}
 const get=index=>{const r=rows.get(index+':        ');need(r,'Missing QQ scalar');return v.getFloat32(r.at+16,true);},count=get(3);need(get(0)===2&&get(2)===1&&get(4)===2&&get(5)===1&&[2,3,4].includes(count),'نوع بناء المنحنى غير مدعوم لتغيير عدد النقاط.');need([13,14,20,21].every(i=>get(i)===0),'امتدادات المنحنى الخاصة لا تدعم تغيير عدد النقاط بعد.');
 const last=28+15*(count-1);need(get(28)===1&&get(29)===1&&get(last)===1&&get(last+1)===2,'Unknown anchor arrangement');for(let i=1;i<count-1;i++)need(get(28+i*15)===2,'Only free auxiliary points may be changed');
 const allowed=new Set([13,14,20,21,32,33,34,39,40,...[4,5,6,11,12].map(i=>last+i)]);need(bindings.length===14&&new Set(bindings.map(b=>b.index)).size===14&&bindings.every(b=>allowed.has(b.index)),'Unknown QQ binding layout');
 // The two-point solver admits this plain relative-tangent profile. Other
 // final-helper deletions remain blocked rather than changing reference modes.
 const plain=[get(30),get(last+2)].every(x=>x===500)&&[32,33,34,39,40,last+4,last+5,last+6,last+11,last+12].every(i=>get(i)===0);
 const model=inspectCurveConstruction(doc,{partId,record,sizeKey});
 return {d,payload,v,rows,bindings,count,last,plain,model,get};
}
export function inspectCurvePointOperations(doc,options){try{const x=layout(doc,options);return{insert:x.count<4&&(x.count>2||x.plain),delete:x.count>3||x.count===3&&x.plain,maxHelpers:2,reason:x.count===3&&!x.plain?'حذف آخر نقطة مساعدة لهذا النوع لم يُدعم بعد.':''};}catch(e){return{insert:false,delete:false,reason:e.message};}}
export function changeOriginalCurvePoints(doc,{partId,record,sizeKey,type,fraction,height=0,helperIndex}={}){
 const x=layout(doc,{partId,record,sizeKey}),{v,rows,count,last}=x;need(['insert','delete'].includes(type),'Unknown point operation');const nextCount=count+(type==='insert'?1:-1);let slot;
 if(type==='insert'){need(count<4&&(count>2||x.plain),'هذا المنحنى لا يقبل نقطة مساعدة إضافية في النطاق الحالي.');need(Number.isFinite(fraction)&&fraction>0&&fraction<100&&Number.isFinite(height)&&Math.abs(height)<=20,'أدخل موضعًا داخل المنحنى وارتفاعًا بين -20 و20 بالمائة.');fraction=Math.fround(fraction);height=Math.fround(height);need(fraction>0&&fraction<100,'الموضع قريب جدًا من نهاية المنحنى.');need(x.model.helpers.every(h=>Math.abs(h.fraction-fraction)>.001),'النقطة قريبة جدًا من نقطة مساعدة موجودة.');slot=1+x.model.helpers.filter(h=>h.fraction<fraction).length;
 }else{need(Number.isInteger(helperIndex)&&helperIndex>=0&&helperIndex<count-2,'اختر نقطة مساعدة حرة لحذفها.');need(count>3||count===3&&x.plain,'حذف آخر نقطة مساعدة لهذا النوع غير مدعوم؛ لم يتغير التعريف.');slot=helperIndex+1;}
 const keys=index=>[...rows.values()].filter(r=>r.index===index).map(r=>r.key).sort(),write=(index,key,value)=>{const r=rows.get(index+':'+key);need(r,'Missing target QQ row');v.setFloat32(r.at+16,value,true);},copy=(from,to)=>{need(JSON.stringify(keys(from))===JSON.stringify(keys(to)),'Size-row sets differ');for(const key of keys(from))write(to,key,v.getFloat32(rows.get(from+':'+key).at+16,true));};
 if(type==='insert'){
  for(let k=0;k<15;k++)for(const key of keys(28+count*15+k))need(v.getUint32(rows.get((28+count*15+k)+':'+key).at+16,true)===0,'Inactive QQ slot is not empty');
  for(let i=count-1;i>=slot;i--)for(let k=0;k<15;k++)copy(28+i*15+k,28+(i+1)*15+k);
  for(let k=0;k<15;k++)for(const key of keys(28+slot*15+k))write(28+slot*15+k,key,k===0?2:k===5?fraction:k===6?height:0);
 }else{
  for(let i=slot;i<count-1;i++)for(let k=0;k<15;k++)copy(28+(i+1)*15+k,28+i*15+k);
  for(let k=0;k<15;k++)for(const key of keys(last+k))write(last+k,key,0);
 }
 for(const key of keys(3))write(3,key,nextCount);for(const b of x.bindings)if(b.index>=last&&b.index<last+15)v.setUint32(b.at,b.index+(type==='insert'?15:-15),true);
 const next=replaceOriginalBlocks(doc,new Map([[x.d.parameterKey,x.payload]]));const result=commitOriginalDefinition(doc,next,{sizeKey,objectId:x.d.objectId});return{...result,partId,record,type,helperIndex:type==='insert'?slot-1:helperIndex};
}

