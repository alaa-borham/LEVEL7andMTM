import{constructionLength,canChangeConstructionLength}from'./construction-length-kernel.mjs';
import{constructionPoints}from'./parallel-path-kernel.mjs';
import {serializeMdl} from './native-mdl.js';
import {inspectOriginalLengthTools} from './original-length-tools.mjs';
import {trailingLinkedDrawingGroups,readStableLengthRecords} from './native-linked-point-records.mjs';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);};
function historyOf(doc,partId){const bytes=serializeMdl(doc),rows=doc.blocks.filter(b=>b.id.join('.')===`3.${partId}.2.0`);need(rows.length===1,'تعريف البارت مكرر أو غير موجود.');return bytes.slice(rows[0].payloadOffset,rows[0].endOffset);}
export function inspectOriginalLengthEdits(doc,{partId,sizeKey}={}){
 const cap=inspectOriginalLengthTools(doc,{partId,sizeKey}),history=historyOf(doc,partId),groups=trailingLinkedDrawingGroups(history),edits=[];
 for(let i=0;i<groups.length;i++){const g=groups[i];if(g.kind!=='length'||groups.slice(i+1).some(h=>h.id===g.id)||!cap.paths.some(p=>p.id===g.id))continue;
  const prefix=replaceOriginalBlocks(doc,new Map([[`3.${partId}.2.0`,history.slice(0,g.at)]])),model=createPartHistoryCalculation(prefix,{sizeKey}).get(partId),source=model.objects.find(o=>o.id===g.id);if(!model.historyFullyExecuted||!source||(source.geometryKind?!canChangeConstructionLength(source):source.points.length!==2))continue;
  const beforeLength=constructionLength(source.geometryKind?constructionPoints(source):source.points);if(beforeLength<=1e-7)continue;
  const bindings=model.scalarRows.filter(z=>z.status==='calculated-unverified'&&z.index>0&&z.index<=65335&&z.recordStep<=g.at/32&&Number.isFinite(z.value)&&Math.abs(z.value)<=10000&&(!g.absolute||z.value>0)).map(({index,value})=>({index,value}));
  if(g.zIndex&&!bindings.some(z=>z.index===g.zIndex))continue;
  edits.push({...g,record:g.at/32+1,beforeLength,bindings,currentLength:cap.paths.find(p=>p.id===g.id).length});
 }return{edits};
}
export function editOriginalLengthDefinition(doc,{partId,sizeKey,objectId,record,value,zIndex=null}={}){
 const g=inspectOriginalLengthEdits(doc,{partId,sizeKey}).edits.find(g=>g.id===objectId&&g.record===record);need(g,'تعريف الطول غير متاح أو تغير موضعه؛ أعد اختيار الخط.');
 let delta,stored;if(g.zIndex){need(value===undefined&&Number.isInteger(zIndex)&&zIndex!==g.zIndex,'اختر معامل Z آخر مع الحفاظ على نوع الربط.');const z=g.bindings.find(z=>z.index===zIndex);need(z,'معامل Z غير متاح قبل تعريف الطول.');delta=g.absolute?z.value-g.beforeLength:z.value;stored=0;
 }else{need(zIndex===null&&typeof value==='number'&&Number.isFinite(value),'أدخل زيادة أو نقصانًا عدديًا مع الحفاظ على نوع التعريف.');stored=Math.fround(value);need(stored!==g.delta&&Math.abs(stored)<=10000,'لم تتغير الزيادة أو تجاوزت النطاق المدعوم.');delta=stored;}
 const length=g.beforeLength+delta;need(Number.isFinite(delta)&&Math.abs(delta)<=1e6&&length>1e-7&&length<=1e6,'التعديل يلغي طول الخط أو يتجاوز النطاق المدعوم.');
 const history=historyOf(doc,partId),raw=history.subarray(g.at,g.end),v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);if(g.zIndex)v.setUint16(6,zIndex+200,true);else v.setFloat32(8,stored,true);
 const decoded=readStableLengthRecords(raw);need(decoded&&decoded.id===g.id&&!!decoded.absolute===!!g.absolute&&decoded.fromStart===g.fromStart&&!!decoded.zIndex===!!g.zIndex,'تغير نوع تعريف الطول أو هويته؛ لم يُطبق التعديل.');
 const next=replaceOriginalBlocks(doc,new Map([[`3.${partId}.2.0`,history]]));return{...commitOriginalDefinition(doc,next,{sizeKey,objectId}),length,delta,zIndex:g.zIndex?zIndex:null,absolute:!!g.absolute,fromStart:g.fromStart,record};
}
