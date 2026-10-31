/** Parameter-only MDL transfer. Geometry remains the original cache until Grafis
 * performs Test run all. Never substitutes the partial LEVEL7 preview for a model.
 * Only authenticated ALAA / part002 / HN40 and the preview's bounded inputs.
 */
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
import {previewMeasuredZConstruction} from './parametric-construction-preview.mjs';
import {validateNativeScalarFormula} from './native-parameter-transfer.js';
const ensure=(v,m)=>{if(!v)throw Error(m);};
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const align=n=>Math.ceil(n/8)*8;
function check(b){const v=view(b);let total=0;for(let p=4;p<b.length;p+=2){total=(total+Math.imul(p/2+1,v.getInt16(p,true)))|0;if(total>=1024000000)total-=1024000000;}return total>>>0;}
function join(parts){const out=new Uint8Array(parts.reduce((s,b)=>s+b.length,0));let at=0;for(const b of parts){out.set(b,at);at+=b.length;}return out;}
export async function createNativeXZTransfer(document,options={}){
 // Snapshot private source and all inputs before the asynchronous verification.
 const source=serializeMdl(document),doc=parseMdl(source);
 const calculated=await previewMeasuredZConstruction(doc,options);
 const xs=readNativeXValues(doc,{partId:2,sizeKey:'__HN40_0'}).localEntries;
 const zs=readNativeZValues(doc,{partId:2}).entries;
 const replacements=new Map(),changes=[];
 const block=id=>{const rows=doc.blocks.filter(b=>b.id.join('.')===id);ensure(rows.length===1,'Ambiguous transfer block');return rows[0];};
 const xb=block('3.2.3.1'),xp=source.slice(xb.payloadOffset,xb.endOffset);
 for(const [key,value] of Object.entries(calculated.xOverrides)){
  const rows=xs.filter(x=>String(x.index)===key&&x.sizeKey==='__HN40_0');ensure(rows.length===1,'Missing exact X assignment');const old=rows[0];
  if(old.value===value)continue;
  view(xp).setFloat32(old.payloadOffset+16,value,true);
  changes.push({kind:'X',index:old.index,sizeKey:old.sizeKey,before:old.value,after:value});
 }
 if(!equal(xp,source.subarray(xb.payloadOffset,xb.endOffset)))replacements.set(xb.key,xp);
 const zp=[];
 for(const z of zs){
  const formula=calculated.zOverrides[z.index];
  if(formula===undefined||formula===z.formula){zp.push(z.rawBytes);continue;}
  ensure(!z.opaque&&z.flags===0&&z.layoutVerified&&z.geometricReferences.length===0,'Only verified scalar Z entries may be transferred');
  ensure(/^[\x20-\x7e]{1,256}$/.test(formula),'Native Z formula must be bounded ASCII');
  validateNativeScalarFormula(formula);
  const encoded=new TextEncoder().encode(formula),oldStart=24+align(z.formulaBytes.length);
  const entry=new Uint8Array(24+align(encoded.length)+z.rawBytes.length-oldStart);
  entry.set(z.rawBytes.subarray(0,24));entry.fill(32,24,24+align(encoded.length));entry.set(encoded,24);entry.set(z.rawBytes.subarray(oldStart),24+align(encoded.length));
  view(entry).setUint16(0,entry.length/8,true);view(entry).setUint16(8,encoded.length,true);
  zp.push(entry);changes.push({kind:'Z',index:z.index,recordStep:z.recordStep,before:z.formula,after:formula});
 }
 const zb=block('3.2.6.34'),zPayload=join(zp);
 if(!equal(zPayload,source.subarray(zb.payloadOffset,zb.endOffset)))replacements.set(zb.key,zPayload);
 ensure(changes.length>0,'لا توجد تغييرات في X أو Z لحفظ نسخة جديدة.');
 const blocks=doc.blocks.map(b=>{
  if(!replacements.has(b.key))return source.slice(b.offset,b.endOffset);
  const out=join([source.subarray(b.offset,b.payloadOffset),replacements.get(b.key)]);
  view(out).setUint32(4,out.length/8,true);view(out).setUint32(0,check(out),true);return out;
 });
 const bytes=join([source.subarray(0,80),...blocks,source.subarray(-8)]);
 view(bytes).setUint32(4,bytes.length/8-1,true);view(bytes).setUint32(0,check(bytes.subarray(0,80)),true);
 const edited=parseMdl(bytes);
 ensure(edited.blocks.length===doc.blocks.length,'Native block count changed');
 // Check complete preservation, even when a growing formula shifts later offsets.
 for(let i=0;i<doc.blocks.length;i++){
  const before=doc.blocks[i],after=edited.blocks[i];ensure(before.key===after.key,'Native block order changed');
  if(!replacements.has(before.key))ensure(equal(source.subarray(before.offset,before.endOffset),bytes.subarray(after.offset,after.endOffset)),'Unrelated native data changed');
 }
 const ex=readNativeXValues(edited,{partId:2}).localEntries,ez=readNativeZValues(edited,{partId:2}).entries;
 for(const x of xs){const e=ex.find(e=>e.index===x.index&&e.sizeKey===x.sizeKey);ensure(e,'Lost X assignment');const expected=x.rawEntry.slice();const c=changes.find(c=>c.kind==='X'&&c.index===x.index&&c.sizeKey===x.sizeKey);if(c)view(expected).setFloat32(16,c.after,true);ensure(equal(expected,e.rawEntry),'Unexpected X row edit');}
 for(const z of zs){const e=ez.find(e=>e.index===z.index),c=changes.find(c=>c.kind==='Z'&&c.index===z.index);ensure(e&&e.formula===(c?c.after:z.formula)&&equal(z.commentBytes,e.commentBytes)&&z.flags===e.flags&&z.recordStep===e.recordStep,'Unexpected Z metadata edit');if(!c)ensure(equal(z.rawBytes,e.rawBytes),'Unedited Z row changed');}
 return {bytes,changes,sourceSha256:calculated.sourceSha256,partId:2,sizeKey:'__HN40_0',requiresGrafisRecalculation:true,geometryRecalculated:false,allOtherBlocksByteExact:true};
}
