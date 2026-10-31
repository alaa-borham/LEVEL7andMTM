import {prepareEmptyNativeLinePart,isEmptyNativeLinePart} from './empty-native-line-part.mjs';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {readNativeMetadata} from './native-measurements.js';
/** Verified horizontal, single-line ASCII literal text. Dynamic fields and
 * construction-line attachments are deliberately not interpreted as literals. */
import {decodeLiteralTextPool} from './native-literal-text-codec.mjs';
import {parseMdl,serializeMdl} from './native-mdl.js';
import {replaceOriginalBlocks} from './original-geometry-edit.mjs';
import {assertPartLinksPreserved} from './part-link-guard.mjs';
import {readCachedPreview} from './native-cache-preview.js';
const need=(x,m)=>{if(!x)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const literal=s=>typeof s==='string'&&s.length>0&&s.length<=512&&/^[A-Za-z0-9 .,_+\-]+$/.test(s);
const concat=xs=>{const out=new Uint8Array(xs.reduce((n,b)=>n+b.length,0));let at=0;for(const b of xs){out.set(b,at);at+=b.length;}return out;};
const checksum=b=>{let n=0;for(let i=4;i<b.length;i+=2){n=(n+Math.imul(i/2+1,view(b).getInt16(i,true)))|0;if(n>=1024000000)n-=1024000000;}return n>>>0;};
export function addOriginalLiteralText(doc,{partId,text,x,y}={}){
 need(doc.variant==='VA'&&literal(text),'أدخل نصًا لاتينيًا بسيطًا من سطر واحد.');need([x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=999000),'Invalid text position');
 doc=prepareEmptyNativeLinePart(doc,{partId,sizeKey:readNativeMetadata(doc).referenceSize?.name});
 const sizeKey=readNativeMetadata(doc).referenceSize?.name;need(createPartHistoryCalculation(doc,{sizeKey}).get(partId).historyFullyExecuted||isEmptyNativeLinePart(doc,{partId,sizeKey}),'إضافة النص تحتاج سجل إنشاء مكتملًا أو بارتًا جديدًا.');
 const preview=readCachedPreview(doc,{partId});need(!preview.unsupported.length,'توجد عناصر غير مقروءة في البارت؛ لم تُضف هوية نص جديدة.');
 const bytes=serializeMdl(doc),get=id=>{const matches=doc.blocks.filter(b=>b.id.join('.')===id);need(matches.length===1,'Missing or ambiguous native part block');const b=matches[0];return bytes.slice(b.payloadOffset,b.endOffset);};
 const caches=doc.blocks.filter(b=>b.id[0]===3&&b.id[1]===partId&&b.id[2]===7);need(caches.length===1&&caches[0].id[3]===1,'إضافة النص متاحة لمخزن المقاس الأساسي الواحد.');
 const cacheKey=`3.${partId}.7.1`,cache=get(cacheKey),q=view(cache),count=q.getUint32(0,true),poolStart=8+40*count;need(count<9000&&q.getUint32(4,true)*8===cache.length&&poolStart<=cache.length,'Invalid native cache');
 const headerKey=`3.${partId}.1.0`,header=get(headerKey),history=get(`3.${partId}.2.0`);need(header.length===152&&history.length%32===0&&view(header).getUint32(8,true)===count*5,'Unsupported part object counts');
 const ids=Array.from({length:count},(_,i)=>q.getUint32(8+i*40,true));for(let at=0;at<history.length;at+=32){const h=view(history.subarray(at));if(h.getUint16(0,true)===113){const n=h.getUint16(4,true);need(n>=1&&n<=13,'Unsupported native deletion identity reservation');for(let i=0;i<n;i++)ids.push(h.getUint16(6+i*2,true));}}
 const objectId=Math.max(2000,...ids)+1;need(objectId<60000,'Native object identity capacity');
 const definition=new Uint8Array(56+Math.ceil(text.length/8)*8),d=view(definition);[definition.length/8,1,1,text.length,2053,objectId,0,0].forEach((n,i)=>d.setUint16(i*2,n,true));[4.8,5.6,0,.4,0,0,x,y+15.6,x+10+Math.fround(4.8)*text.length,y].forEach((n,i)=>d.setFloat32(16+i*4,n,true));definition.set(new TextEncoder().encode(text),56);
 const pool=new Uint8Array(48+Math.ceil(text.length/8)*8),p=view(pool);pool.set(definition.subarray(40,56));pool.set(definition.subarray(16,36),16);[1088,text.length,objectId,8].forEach((n,i)=>p.setUint16(36+i*2,n,true));pool.set(new TextEncoder().encode(text),48);decodeLiteralTextPool(pool);
 const row=new Uint8Array(40),r=view(row);r.setUint32(0,objectId,true);r.setUint32(12,pool.length/8,true);r.setUint32(20,66052,true);[0,3,2,1].forEach((j,i)=>r.setFloat32(24+i*4,p.getFloat32(j*4,true),true));
 const nextCache=concat([new Uint8Array(8),cache.subarray(8,poolStart),row,cache.subarray(poolStart),pool]);view(nextCache).setUint32(0,count+1,true);view(nextCache).setUint32(4,nextCache.length/8,true);view(header).setUint32(8,(count+1)*5,true);view(header).setUint32(28,count+1,true);
 const list=get('2.1.0.0'),listText=String.fromCharCode(...list);let offset=listText.indexOf('#TLIST\r\n')+8,found=0;while(offset>=8&&offset<listText.length&&!listText.slice(offset).startsWith('#')){const end=listText.indexOf('\r\n',offset);need(end>=0,'Invalid native part list');if(Number(listText.slice(offset+3,offset+6))===partId){need(Number(listText.slice(offset+37,offset+41))===count,'Part list count mismatch');list.set(new TextEncoder().encode(String(count+1).padStart(4,' ')),offset+37);found++;}offset=end+2;}need(found===1,'Missing native part list entry');
 const key=`3.${partId}.6.2`,existing=doc.blocks.filter(b=>b.id.join('.')===key);need(existing.length<=1,'Ambiguous native text definitions');let next=replaceOriginalBlocks(doc,new Map([[cacheKey,nextCache],[headerKey,header],['2.1.0.0',list],...(existing.length?[[key,concat([get(key),definition])]]:[])]));
 if(!existing.length){const prior=serializeMdl(next),anchor=next.blocks.find(b=>b.id[0]===3&&b.id[1]===partId&&(b.id[2]===6&&b.id[3]>2||b.id[2]>6));need(anchor,'Missing native annotation insertion point');const block=new Uint8Array(32+definition.length);block.set(prior.subarray(anchor.offset,anchor.payloadOffset));block.set(definition,32);[3,partId,6,2].forEach((n,i)=>view(block).setUint32(16+i*4,n,true));view(block).setUint32(4,block.length/8,true);view(block).setUint32(0,checksum(block),true);const out=concat([prior.subarray(0,anchor.offset),block,prior.subarray(anchor.offset)]);view(out).setUint32(4,(out.length-8)/8,true);view(out).setUint32(0,checksum(out.subarray(0,80)),true);next=parseMdl(out);}
 assertPartLinksPreserved(doc,next);return{document:next,objectId,changedPartIds:[partId]};
}
function stringAt(b,at){const zero=b.indexOf(0,at),end=zero<0?b.length:zero;need(end>at,'Missing native text terminator');const text=String.fromCharCode(...b.subarray(at,end));need(literal(text),'Unsupported native text encoding or dynamic fields');return text;}
export function editOriginalLiteralText(doc,{partId,objectId,text}={}){
 need(literal(text),'أدخل نصًا لاتينيًا بسيطًا من سطر واحد، حتى 512 حرفًا.');
 const bytes=serializeMdl(doc),find=id=>{const bs=doc.blocks.filter(b=>b.id.join('.')===id);need(bs.length===1,'Missing or ambiguous native text block');return bytes.slice(bs[0].payloadOffset,bs[0].endOffset);};
 const key=`3.${partId}.6.2`,source=find(key),records=[];let at=0,found=0;
 const cacheKey=`3.${partId}.7.1`,cache=find(cacheKey),q=view(cache),count=q.getUint32(0,true),rows=[],pools=[];need(q.getUint32(4,true)*8===cache.length&&8+40*count<=cache.length,'Invalid native cache');let poolAt=8+40*count,decoded;
 for(let i=0;i<count;i++){const row=cache.slice(8+40*i,48+40*i),r=view(row),length=(r.getUint32(4,true)+r.getUint32(12,true))*8;need(poolAt+length<=cache.length,'Invalid native cache span');let pool=cache.slice(poolAt,poolAt+length);poolAt+=length;
  if(r.getUint32(0,true)===objectId){need(!decoded&&r.getUint32(4,true)===0&&r.getUint32(8,true)===0&&r.getUint32(20,true)===66052,'Unsupported native text cache row');decoded=decodeLiteralTextPool(pool);need(decoded.objectId===objectId,'Text identity differs');const n=new Uint8Array(48+Math.ceil(text.length/8)*8);n.set(pool.subarray(0,48));n.set(new TextEncoder().encode(text),48);view(n).setUint16(38,text.length,true);view(n).setFloat32(8,decoded.bounds[0]+decoded.width*text.length+10,true);pool=n;r.setUint32(12,pool.length/8,true);[0,3,2,1].forEach((j,k)=>r.setFloat32(24+4*k,view(pool).getFloat32(4*j,true),true));}
  rows.push(row);pools.push(pool);
 }need(poolAt===cache.length&&decoded,'Text not present in native cache');need(decoded.text!==text,'لم يتغير النص.');
 while(at<source.length){const h=view(source.subarray(at)),length=h.getUint16(0,true)*8;need(length>=64&&at+length<=source.length,'Invalid native text definition span');let record=source.slice(at,at+length);at+=length;
  if(h.getUint16(10,true)===objectId){found++;need(h.getUint16(2,true)===1&&h.getUint16(4,true)===1&&h.getUint16(6,true)===decoded.text.length&&h.getUint16(8,true)===2053&&h.getUint32(12,true)===0&&stringAt(record,56)===decoded.text,'Unsupported native text definition or binding');need(Array.from({length:10},(_,i)=>view(record).getFloat32(16+4*i,true)).every((n,i)=>Math.abs(n-(i<5?view(pools[rows.findIndex(r=>view(r).getUint32(0,true)===objectId)]).getFloat32(16+4*i,true):i===5?0:decoded.bounds[i-6]))<.002),'Text definition/cache mismatch');
   const n=new Uint8Array(56+Math.ceil(text.length/8)*8);n.set(record.subarray(0,56));n.set(new TextEncoder().encode(text),56);view(n).setUint16(0,n.length/8,true);view(n).setUint16(6,text.length,true);view(n).setFloat32(48,decoded.bounds[0]+decoded.width*text.length+10,true);record=n;
  }records.push(record);
 }need(found===1,'Missing or duplicate native text identity');
 const concat=xs=>{const out=new Uint8Array(xs.reduce((n,b)=>n+b.length,0));let at=0;for(const b of xs){out.set(b,at);at+=b.length;}return out;};
 const nextCache=concat([new Uint8Array(8),...rows,...pools]);view(nextCache).setUint32(0,count,true);view(nextCache).setUint32(4,nextCache.length/8,true);
 const next=replaceOriginalBlocks(doc,new Map([[key,concat(records)],[cacheKey,nextCache]]));assertPartLinksPreserved(doc,next);
 return{document:next,objectId,changedPartIds:[partId],scope:'Literal annotation only; construction history, references and other parts retained byte-for-byte'};
}
