import{parseExperimentalExpression}from'./native-n38-expression.js';
/** Stored parameter edits for every part with a verified VA table layout.
 * No history execution or cache updates. Grafis must recalculate the result.
 */
import {applyNativeXTableOperations} from './native-x-table-operations.js';
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
import {validateScalarFormula} from './native-alaa-z-scalars.mjs';
const ensure=(v,m)=>{if(!v)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),align=n=>Math.ceil(n/8)*8;
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function join(parts){const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let at=0;for(const b of parts){out.set(b,at);at+=b.length;}return out;}
function check(b){const v=view(b);let total=0;for(let p=4;p<b.length;p+=2){total=(total+Math.imul(p/2+1,v.getInt16(p,true)))|0;if(total>=1024000000)total-=1024000000;}return total>>>0;}
export function parameterKey(p){return p.kind==='XTABLE'?`XTABLE:${p.serial}`:p.kind==='X'?`X:${p.scope==='global'?0:p.partId}:${p.scope}:${p.index}:${p.sizeKey}`:`Z:${p.partId}:${p.index}`;}
export function validateNativeScalarFormula(formula){
 const compiled=validateScalarFormula(formula);
 // Grafis rejected (95)+1 during the native all-part test; 95+1 succeeded.
 // Keep grouping of actual operations, but reject unverified single-operand groups.
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='group')ensure(node.value.type==='binary','Grafis لا يقبل الأقواس حول معامل منفرد هنا؛ اكتب 95+1 بدل (95)+1.');for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
 walk(compiled.ast);return compiled;
}
export function canEditNativeScalarEntry(entry){return !!entry&&!entry.opaque&&entry.layoutVerified&&!entry.geometricReferences.length&&(entry.flags===0||entry.flags===0x0c00&&entry.recordStep===1&&entry.commentBytes?.length===0);}
function createNativeValueTransfer(document,edits){
 const source=serializeMdl(document),doc=parseMdl(source);ensure(doc.variant==='VA','Only verified VA parameter tables are supported.');
 ensure(Array.isArray(edits)&&edits.length>0&&edits.length<=10000,'A bounded, nonempty parameter edit list is required.');
 const replacements=new Map(),changes=[],seen=new Set(),zs=new Map(),xs=new Map();
 const block=id=>{const rows=doc.blocks.filter(b=>b.id.join('.')===id);ensure(rows.length===1,'Missing or ambiguous parameter table.');return rows[0];};
 for(const item of edits){
  ensure(item&&['X','Z'].includes(item.kind)&&Number.isInteger(item.partId)&&item.partId>0&&item.partId<=999&&Number.isInteger(item.index),'Invalid parameter identity.');
  const p={...item},key=parameterKey(p);ensure(!seen.has(key),'Duplicate parameter edit.');seen.add(key);
  if(p.kind==='X'){
   ensure(p.scope==='local'||p.scope==='global','Invalid X scope.');ensure(typeof p.value==='number'&&Number.isFinite(p.value)&&Math.abs(p.value)<=1e9,'X must be a finite value within ±1e9.');
   if(!xs.has(p.partId))xs.set(p.partId,readNativeXValues(doc,{partId:p.partId}));const table=xs.get(p.partId),rows=p.scope==='local'?table.localEntries:table.globalEntries;
   const entry=rows.find(e=>e.index===p.index&&e.sizeKey===p.sizeKey);ensure(entry,'Exact X index and size assignment is unavailable.');
   const value=Math.fround(p.value);if(value===entry.value)continue;
   const b=block(p.scope==='global'?'2.3.0.0':`3.${p.partId}.3.1`),payload=replacements.get(b.key)??source.slice(b.payloadOffset,b.endOffset);view(payload).setFloat32(entry.payloadOffset+16,value,true);replacements.set(b.key,payload);changes.push({...p,value,before:entry.value});
  }else{
   if(!zs.has(p.partId))zs.set(p.partId,readNativeZValues(doc,{partId:p.partId}).entries);const entries=zs.get(p.partId),entry=entries.find(e=>e.index===p.index);
   ensure(canEditNativeScalarEntry(entry),'Geometric or opaque Z definitions cannot be edited as scalar formulas.');
   if(entry.flags===0x0c00){const parsed=parseExperimentalExpression(p.formula);ensure(parsed.text.length<=64,'N38 formula exceeds64 bytes.');}const compiled=validateNativeScalarFormula(p.formula);ensure(!compiled.process.length,'AB/GL require original geometric references and cannot be added here.');
   for(const name of compiled.references.filter(n=>n.startsWith('Z'))){const index=Number(name.slice(1)),position=entries.findIndex(e=>e.index===index);ensure(position>=0&&position<entries.indexOf(entry)&&entries[position].recordStep<=entry.recordStep,'Z formula contains a missing, self or later reference.');}
   if(p.formula===entry.formula)continue;changes.push({...p,before:entry.formula});
  }
 }
 for(const[partId,entries]of zs){const b=block(`3.${partId}.6.34`),payload=join(entries.map(entry=>{
  const change=changes.find(p=>p.kind==='Z'&&p.partId===partId&&p.index===entry.index);if(!change)return entry.rawBytes;
  const text=new TextEncoder().encode(change.formula),tail=24+align(entry.formulaBytes.length),out=new Uint8Array(24+align(text.length)+entry.rawBytes.length-tail);out.set(entry.rawBytes.subarray(0,24));out.fill(32,24,24+align(text.length));out.set(text,24);out.set(entry.rawBytes.subarray(tail),24+align(text.length));view(out).setUint16(0,out.length/8,true);view(out).setUint16(8,text.length,true);return out;
 }));if(!equal(payload,source.subarray(b.payloadOffset,b.endOffset)))replacements.set(b.key,payload);}
 ensure(changes.length,'لا توجد تغييرات لحفظها.');
 const blocks=doc.blocks.map(b=>{if(!replacements.has(b.key))return source.slice(b.offset,b.endOffset);const out=join([source.subarray(b.offset,b.payloadOffset),replacements.get(b.key)]);view(out).setUint32(4,out.length/8,true);view(out).setUint32(0,check(out),true);return out;});
 const bytes=join([source.subarray(0,80),...blocks,source.subarray(-8)]);view(bytes).setUint32(4,bytes.length/8-1,true);view(bytes).setUint32(0,check(bytes.subarray(0,80)),true);const edited=parseMdl(bytes);
 ensure(edited.blocks.length===doc.blocks.length,'Block count changed.');
 for(let i=0;i<doc.blocks.length;i++){const a=doc.blocks[i],b=edited.blocks[i];ensure(a.key===b.key,'Block order changed.');if(!replacements.has(a.key))ensure(equal(source.subarray(a.offset,a.endOffset),bytes.subarray(b.offset,b.endOffset)),'Unrelated data changed.');}
 for(const[partId,table]of xs){const result=readNativeXValues(edited,{partId});for(const scope of ['global','local'])for(const x of table[scope+'Entries']){const e=result[scope+'Entries'].find(e=>e.index===x.index&&e.sizeKey===x.sizeKey),c=changes.find(p=>p.kind==='X'&&p.scope===scope&&(scope==='global'||p.partId===partId)&&p.index===x.index&&p.sizeKey===x.sizeKey),expected=x.rawEntry.slice();if(c)view(expected).setFloat32(16,c.value,true);ensure(e&&equal(expected,e.rawEntry),'Unexpected X row mutation.');}}
 for(const[partId,entries]of zs){const result=readNativeZValues(edited,{partId}).entries;for(const z of entries){const e=result.find(e=>e.index===z.index),c=changes.find(p=>p.kind==='Z'&&p.partId===partId&&p.index===z.index);ensure(e,'Lost Z row.');if(!c)ensure(equal(z.rawBytes,e.rawBytes),'Unedited Z row changed.');else{const expected=z.rawBytes.subarray(2,8),actual=e.rawBytes.subarray(2,8);ensure(equal(expected,actual)&&e.formula===c.formula&&equal(z.commentBytes,e.commentBytes)&&equal(z.rawBytes.subarray(24+align(z.formulaBytes.length)),e.rawBytes.subarray(24+align(e.formulaBytes.length))),'Z metadata changed.');}}}
 return{bytes,changes,requiresGrafisRecalculation:true,geometryRecalculated:false};
}

export function createNativeParameterTransfer(document,edits){
 ensure(Array.isArray(edits)&&edits.length>0&&edits.length<=10000,'A bounded nonempty edit list is required');
 const structural=edits.filter(e=>e.kind==='XTABLE'),values=edits.filter(e=>e.kind!=='XTABLE');
 if(!structural.length)return createNativeValueTransfer(document,values);
 const table=applyNativeXTableOperations(document,structural,{formulaEdits:values});
 if(!values.length)return table;
 const result=createNativeValueTransfer(table.document,values);return {...result,changes:[...table.changes,...result.changes]};
}
