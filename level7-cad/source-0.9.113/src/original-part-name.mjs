import {serializeMdl} from './native-mdl.js';
import {replaceOriginalBlocks} from './original-geometry-edit.mjs';
import {assertPartLinksPreserved} from './part-link-guard.mjs';
import {readOriginalTextTemplates,refreshOriginalPartTextFields,resolvePartText,PART_NAME_TEXT_FIELD} from './native-part-text.mjs';
const need=(x,m)=>{if(!x)throw Error(m);},ascii=b=>String.fromCharCode(...b),enc=new TextEncoder();
const capabilities=new WeakMap();
function inspect(doc,partId){
 need(doc?.variant==='VA'&&Number.isInteger(partId)&&partId>=1&&partId<=999,'Invalid native part');const bytes=serializeMdl(doc),get=k=>{const matches=doc.blocks.filter(b=>b.id.join('.')===k);need(matches.length===1,'Missing or ambiguous part name block');return bytes.slice(matches[0].payloadOffset,matches[0].endOffset);},key=`3.${partId}.1.0`,header=get(key);need(header.length===152,'Unsupported native part header');const name=ascii(header.subarray(101,124)).trimEnd();need(/^[\x20-\x7e]{1,23}$/.test(name),'Native name encoding not supported');
 const list=get('2.1.0.0'),text=ascii(list),start=text.indexOf('#TLIST\r\n');need(start>=0,'Missing part list');let at=start+8,offset=-1;while(at<text.length&&!text.slice(at).startsWith('#')){const end=text.indexOf('\r\n',at);need(end>=0,'Invalid part list');if(Number(text.slice(at+3,at+6))===partId){need(offset<0&&end-at>=41&&text.slice(at+9,at+32).trimEnd()===name,'Part name fields differ');offset=at+9;}at=end+2;}need(offset>=0,'Missing native part name row');
 const textBlocks=doc.blocks.filter(b=>b.id.join('.')===`3.${partId}.6.2`);need(textBlocks.length<=1,'Ambiguous native texts');let templates=[];if(textBlocks.length){const b=textBlocks[0],raw=ascii(bytes.subarray(b.payloadOffset,b.endOffset)),count=raw.split('{F 8').length-1;templates=readOriginalTextTemplates(doc,{partId}).filter(r=>r.template.includes(PART_NAME_TEXT_FIELD));need(templates.reduce((n,r)=>n+r.template.split(PART_NAME_TEXT_FIELD).length-1,0)===count,'توجد حقول اسم بارت بخيارات غير مدعومة؛ لم يتغير الاسم أو النص.');}
 return{key,header,list,offset,name,templates};
}
export function inspectOriginalPartName(doc,{partId}={}){let parts=capabilities.get(doc);if(!parts){parts=new Map();if(doc&&typeof doc==='object')capabilities.set(doc,parts);}if(parts.has(partId))return parts.get(partId);let result;try{result={eligible:true,name:inspect(doc,partId).name};}catch(e){result={eligible:false,reason:e.message};}parts.set(partId,result);return result;}
export function renameOriginalPart(doc,{partId,name}={}){
 need(typeof name==='string'&&name.trim()===name&&/^[\x20-\x7e]{1,23}$/.test(name),'اسم البارت من 1 إلى 23 حرفًا لاتينيًا أو رقمًا.');const s=inspect(doc,partId);need(name!==s.name,'لم يتغير اسم البارت.');for(const row of s.templates)resolvePartText(row.template,{partId,name});s.header.set(enc.encode(name.padEnd(23)),101);s.list.set(enc.encode(name.padEnd(23)),s.offset);let next=replaceOriginalBlocks(doc,new Map([[s.key,s.header],['2.1.0.0',s.list]]));next=refreshOriginalPartTextFields(next).document;assertPartLinksPreserved(doc,next);return{document:next,partId,changedPartIds:[partId]};
}
