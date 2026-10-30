/** Research-only prefix replay. Never writes a native document or cache. */
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
import {resolveScalarXRows,calculateScalarDefinitions} from './native-alaa-z-scalars.mjs';
import {replayLinearHistory} from './linear-history-kernel.mjs';
import {replayCardinalQSLine} from './interactive-line-kernel.mjs';
const ensure=(b,m)=>{if(!b)throw Error(m);};
export async function replayEarlyALAA(doc,{xOverrides={}}={}){
 ensure(xOverrides&&typeof xOverrides==='object'&&!Array.isArray(xOverrides),'Invalid X overrides');
 const overrides=Object.fromEntries(Object.entries(xOverrides).map(([key,value])=>{ensure(['3','4','7','15'].includes(key)&&typeof value==='number'&&Number.isFinite(value)&&(key==='15'?value>=0&&value<=1000:value>0&&value<=2000),'Unsupported or invalid X override');return [key,Math.fround(value)];}));
 const bytes=serializeMdl(doc),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 ensure(sha==='468db71ba5aa19d73b56c6c3b15ce814eed96a33f47eb2103ff11d81248ea54c','Only the authenticated original ALAA design is admitted');
 const source=parseMdl(bytes),partId=2,sizeKey='__HN40_0',xt=readNativeXValues(source,{partId,sizeKey}),zt=readNativeZValues(source,{partId});
 for(const key of Object.keys(overrides))ensure(xt.localEntries.filter(e=>String(e.index)===key&&e.sizeKey===sizeKey).length===1,'Missing exact X size assignment');
 const local=xt.localEntries.map(e=>e.sizeKey===sizeKey&&Object.hasOwn(overrides,String(e.index))?{...e,value:overrides[e.index]}:e);
 const scalarInputs=[...resolveScalarXRows(local,{sizeKey}),...resolveScalarXRows(xt.globalEntries,{sizeKey,scope:'global'})];
 const values=calculateScalarDefinitions(scalarInputs,zt.entries);
 const zValues=values.filter(e=>e.status==='calculated-unverified').map(({index,value,recordStep})=>({index,value,recordStep}));
 const block=id=>{const b=source.blocks.find(b=>b.id.join('.')===id);ensure(b,'Missing block '+id);return bytes.subarray(b.payloadOffset,b.endOffset);};
 const history=block('3.2.2.0'),references=block('3.2.4.0'),objects=[],trace=[];
 const interactive=record=>{const h=history.subarray((record-1)*32,record*32),v=new DataView(h.buffer,h.byteOffset,32);const o=replayCardinalQSLine({historyRecord:h,record,parameters:block('3.2.3.'+v.getUint16(4,true)),references,objects,zValues,allowExperimentalSelectors:true});objects.push(o);trace.push({record,objectId:o.id,operation:o.operation});};
 const linear=(first,last)=>{const r=replayLinearHistory({history:history.subarray((first-1)*32,last*32),firstRecord:first,seedObjects:objects,zValues});objects.push(...r.created);trace.push(...r.trace);};
 for(const r of [1,2,3,4])interactive(r);
 // This one exact 9404 input is superseded by an identical 9604 input before
 // any consumer. Do not generalize 9404 into an executable numeric operation.
 const a=history.subarray(4*32,5*32),b=history.subarray(5*32,6*32),av=new DataView(a.buffer,a.byteOffset,32),bv=new DataView(b.buffer,b.byteOffset,32);
 ensure(av.getUint16(0,true)===197&&av.getUint16(2,true)===100&&av.getUint16(4,true)===9404&&bv.getUint16(4,true)===9604&&a.every((n,i)=>i===4||i===5||n===b[i]),'Unverified superseded input');
 trace.push({record:5,operation:'superseded-numeric-input',replacedBy:6});
 linear(6,17);for(const r of [18,19,20,21,22])interactive(r);linear(23,43);
 return {sourceSha256:sha,partId,sizeKey,xOverrides:overrides,scalarInputs,throughRecord:43,objects,trace,complete:false,canSaveMdl:false,usesCachedGeometryInputs:false,nativeCompatibilityVerified:false};
}
