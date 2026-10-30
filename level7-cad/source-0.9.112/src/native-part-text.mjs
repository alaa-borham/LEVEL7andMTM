import {resolvePartText,PART_NAME_TEXT_FIELD,PART_NUMBER_TEXT_FIELD} from './native-part-text-codec.mjs';
export {resolvePartText,PART_NAME_TEXT_FIELD,PART_NUMBER_TEXT_FIELD} from './native-part-text-codec.mjs';
/** Native fixed-width F7/F8 text fields, measured in Grafis. Other fields stay opaque. */
import {serializeMdl} from './native-mdl.js';
import {readNativeMetadata} from './native-measurements.js';
import {readCachedPreview} from './native-cache-preview.js';
import {replaceOriginalBlocks} from './original-geometry-edit.mjs';
import {addOriginalLiteralText,editOriginalLiteralText} from './native-literal-text.mjs';
import {assertPartLinksPreserved} from './part-link-guard.mjs';
const need=(x,m)=>{if(!x)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),ascii=b=>String.fromCharCode(...b),enc=new TextEncoder();
function context(doc,partId){const part=readNativeMetadata(doc).parts.find(p=>p.id===partId);need(part,'Missing native part');return {partId,name:part.name};}
function records(doc,partId){const bytes=serializeMdl(doc),key=`3.${partId}.6.2`,bs=doc.blocks.filter(b=>b.id.join('.')===key);need(bs.length<=1,'Duplicate text block');if(!bs.length)return {key,raw:new Uint8Array(),rows:[]};const raw=bytes.slice(bs[0].payloadOffset,bs[0].endOffset),rows=[];for(let at=0;at<raw.length;){const q=view(raw.subarray(at)),size=q.getUint16(0,true)*8;need(size>=64&&at+size<=raw.length,'Invalid native text span');const n=q.getUint16(6,true);need(n>0&&n<=512&&56+n<=size,'Invalid native text length');rows.push({at,size,objectId:q.getUint16(10,true),template:ascii(raw.subarray(at+56,at+56+n))});at+=size;}need(new Set(rows.map(r=>r.objectId)).size===rows.length,'Duplicate text identity');return{key,raw,rows};}
function patchSource(doc,{partId,objectId,template}){const {key,raw,rows}=records(doc,partId),row=rows.find(r=>r.objectId===objectId);need(row&&row.template.length===template.length,'Native template length differs from its evaluated text');raw.set(enc.encode(template),row.at+56);return replaceOriginalBlocks(doc,new Map([[key,raw]]));}
export function readOriginalTextTemplates(doc,{partId}={}){
 const c=context(doc,partId),cache=readCachedPreview(doc,{partId}),{rows}=records(doc,partId),result=[];
 for(const row of rows){try{const text=resolvePartText(row.template,c),item=cache.objects.find(o=>o.objectId===row.objectId&&o.kind==='literal-text');need(item&&item.annotation.text===text,'Native text field cache is stale');result.push({...row,text,linked:row.template!==text||row.template.includes('{F '),annotation:item.annotation});}catch{}}
 return result;
}
export function addOriginalTextTemplate(doc,options){const {partId,text:template}=options,text=resolvePartText(template,context(doc,partId)),r=addOriginalLiteralText(doc,{...options,text});r.document=patchSource(r.document,{partId,objectId:r.objectId,template});assertPartLinksPreserved(doc,r.document);return r;}
export function editOriginalTextTemplate(doc,{partId,objectId,text:template}={}){
 const current=readOriginalTextTemplates(doc,{partId}).find(r=>r.objectId===objectId);need(current,'اختر نصًا أصليًا ذا تعريف ومخزن متوافقين.');const text=resolvePartText(template,context(doc,partId));need(template!==current.template,'لم يتغير النص.');let next=patchSource(doc,{partId,objectId,template:current.text});
 if(text!==current.text)next=editOriginalLiteralText(next,{partId,objectId,text}).document;
 next=patchSource(next,{partId,objectId,template});assertPartLinksPreserved(doc,next);return{document:next,objectId,changedPartIds:[partId]};
}
export function refreshOriginalPartTextFields(doc){
 let next=doc;const changedPartIds=[];
 for(const b of doc.blocks.filter(b=>b.id[0]===3&&b.id[2]===6&&b.id[3]===2)){
  const partId=b.id[1],c=context(next,partId);let source;try{source=records(next,partId);}catch{continue;}
  for(const row of source.rows){if(!row.template.includes(PART_NAME_TEXT_FIELD)&&!row.template.includes(PART_NUMBER_TEXT_FIELD))continue;let text;try{text=resolvePartText(row.template,c);}catch{continue;}
   const item=readCachedPreview(next,{partId}).objects.find(o=>o.objectId===row.objectId&&o.kind==='literal-text');need(item&&item.annotation.text.length===row.template.length,'تعذر تحديث النص المرتبط من مخزن غير متوافق.');if(item.annotation.text===text)continue;
   let local=patchSource(next,{partId,objectId:row.objectId,template:item.annotation.text});local=editOriginalLiteralText(local,{partId,objectId:row.objectId,text}).document;next=patchSource(local,{partId,objectId:row.objectId,template:row.template});changedPartIds.push(partId);
  }
 }
 assertPartLinksPreserved(doc,next);return{document:next,changedPartIds:[...new Set(changedPartIds)]};
}
