/**
 * One bounded native capability, independent of the general history edit gate.
 * Only authenticated descendants of two byte-pinned ALAA baselines are accepted.
 * Earlier native construction stays opaque and byte-exact; it is not executed.
 * Original GRAFIS full Test Run proved one line relocation with the four-record
 * schema below. Other parts, objects, copy modes and curve edits remain unknown.
 */
import {parseMdl,serializeMdl} from './native-mdl.js';

const PART=100,OBJECT=2004,MAX_OPERATIONS=50,MAX_DELTA=1000;
const verifiedDocuments=new WeakMap();
const BASELINES=Object.freeze([
  Object.freeze({name:'ALAA original',sha256:'468db71ba5aa19d73b56c6c3b15ce814eed96a33f47eb2103ff11d81248ea54c',records:46,bytes:3343608,points:Object.freeze([Object.freeze({x:0,y:3}),Object.freeze({x:0,y:35})])}),
  Object.freeze({name:'ALAA native translated',sha256:'b31d15e44a7ef0b31d5191e6db683b3fbccdeea7c62804f3295554bc9122db2e',records:50,bytes:3343736,points:Object.freeze([Object.freeze({x:10,y:23}),Object.freeze({x:10,y:55})])})
]);

function fail(message,code='LINE_TRANSLATION_READ_ONLY'){const error=new Error(message);error.name='NativeLineTranslationError';error.code=code;throw error;}
function ensure(value,message,code){if(!value)fail(message,code);}
function view(bytes){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
function equal(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function ascii(bytes,offset,length){let text='';for(let i=offset;i<offset+length;i++)text+=String.fromCharCode(bytes[i]);return text;}
function check(bytes,start=0,length=bytes.length){const v=view(bytes);let sum=0;for(let r=4;r<length;r+=2){sum=(sum+Math.imul(r/2+1,v.getInt16(start+r,true)))|0;if(sum>=1_024_000_000)sum-=1_024_000_000;}return sum>>>0;}
async function digest(bytes){ensure(globalThis.crypto?.subtle,'SHA-256 verification is unavailable.');const result=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');}
function unique(blocks,id){const matches=blocks.filter(b=>b.id.join('.')===id);ensure(matches.length===1,`A unique ${id} block is required.`);return matches[0];}
function payload(bytes,block){return bytes.slice(block.payloadOffset,block.endOffset);}
function join(parts){const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){output.set(p,at);at+=p.length;}return output;}
function rebuildBlock(bytes,block,body){ensure(body.length%8===0,'Unaligned native payload.');const out=join([bytes.subarray(block.offset,block.payloadOffset),body]),v=view(out);v.setUint32(4,out.length/8,true);v.setUint32(0,check(out),true);return out;}
function rebuild(bytes,blocks,replacements){
  const out=join([bytes.subarray(0,80),...blocks.map(b=>replacements.has(b.id.join('.'))?rebuildBlock(bytes,b,replacements.get(b.id.join('.'))):bytes.subarray(b.offset,b.endOffset)),bytes.subarray(bytes.length-8)]),v=view(out);
  v.setUint32(4,(out.length-8)/8,true);v.setUint32(0,check(out,0,80),true);return out;
}

function inspectLayout(bytes,blocks){
  ensure(blocks.length===975&&new Set(blocks.map(b=>b.id.join('.'))).size===975,'Native block identities are outside the pinned family.');
  const history=unique(blocks,'3.100.2.0'),part=unique(blocks,'3.100.1.0'),list=unique(blocks,'2.1.0.0'),cache=unique(blocks,'3.100.7.1');
  const v=view(bytes),records=history.payloadSize/32;
  ensure(Number.isInteger(records)&&records>=46&&records<=50+4*MAX_OPERATIONS&&part.payloadSize===152,'Native history length is outside this capability.');
  ensure(v.getUint32(part.payloadOffset,true)===1&&v.getUint32(part.payloadOffset+8,true)===75&&v.getUint32(part.payloadOffset+20,true)===records*4,'Native part counters disagree.');
  const text=ascii(bytes,list.payloadOffset,list.payloadSize),marker='#TLIST\r\n',markerAt=text.indexOf(marker);
  ensure(markerAt>=0&&markerAt===text.lastIndexOf(marker),'A unique part-list section is required.');
  const tableAt=markerAt+marker.length,lines=text.slice(tableAt).split('\r\n'),end=lines.findIndex(line=>line.startsWith('#'));
  ensure(end===102&&lines.slice(0,end).every(row=>row.length===72),'Unverified multipart list layout.');
  const candidates=lines.slice(0,end).filter(row=>row.slice(0,9)==='   100   ');ensure(candidates.length===1,'Part 100 list identity is ambiguous.');
  const row=candidates[0],rowAt=text.indexOf(row,tableAt);
  ensure(/^ *\d+$/.test(row.slice(32,37))&&Number(row.slice(32,37))===records&&Number(row.slice(37,41))===15&&row.slice(41,53)==='            '&&row.slice(53)==='ID=FFFF572A01DBEE73','Native part-list counters or identity differ.');
  ensure(cache.payloadSize===1984&&v.getUint32(cache.payloadOffset,true)===15&&v.getUint32(cache.payloadOffset+4,true)===248,'Unverified target cache dimensions.');
  const ids=new Set();let pool=cache.payloadOffset+8+40*15,target=null;
  for(let i=0;i<15;i++){
    const at=cache.payloadOffset+8+i*40,id=v.getUint32(at,true),extra=v.getUint32(at+4,true),samples=v.getUint32(at+12,true);
    ensure(!ids.has(id)&&[0,2].includes(extra)&&samples>0&&samples<=100000&&pool+8*(samples+extra)<=cache.endOffset,'Unverified cache identity or sample boundary.');ids.add(id);
    if(id===OBJECT){
      ensure(extra===0&&samples===2&&v.getUint32(at+8,true)===0&&v.getUint32(at+20,true)===66050,'Only the proven plain straight line can be moved.');
      const points=Array.from({length:2},(_,j)=>({x:v.getFloat32(pool+j*8,true),y:v.getFloat32(pool+j*8+4,true)}));
      ensure(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'Invalid target coordinates.');
      const bounds=[Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))];
      ensure(bounds.every((n,j)=>n===v.getFloat32(at+24+j*4,true)),'Target cache bounds are stale or unverified.');
      target={rowOffset:at-cache.payloadOffset,poolOffset:pool-cache.payloadOffset,points};
    }
    pool+=8*(samples+extra);
  }
  ensure(pool===cache.endOffset&&target,'Target or complete sample-pool boundary is missing.');
  return{history,part,list,cache,records,rowOffset:rowAt+32,target};
}

function translationRecords(dx,dy,priorRecords){
  const out=new Uint8Array(128),v=view(out),headers=[[197,100,1901,0],[297,200,1902,0],[319,321,0,0],[419,440,OBJECT,2]];
  headers.forEach((h,j)=>h.forEach((n,i)=>v.setUint16(j*32+i*2,n,true)));
  v.setFloat32(8,dx,true);v.setFloat32(40,dy,true);v.setFloat32(72,dx,true);v.setFloat32(76,dy,true);
  v.setUint32(104,OBJECT,true);v.setUint32(108,0xffff0000,true);v.setUint32(112,0x00010001,true);v.setUint32(116,priorRecords+3,true);return out;
}
function movePoints(points,dx,dy,{requireMovement=false}={}){
  const moved=points.map(p=>({x:Math.fround(p.x+dx),y:Math.fround(p.y+dy)}));
  ensure(moved.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=1_000_000&&Math.abs(p.y)<=1_000_000),'Translated coordinates exceed the supported range.','INVALID_TRANSLATION');
  if(requireMovement)ensure(moved.every((p,i)=>(dx===0||p.x!==points[i].x)&&(dy===0||p.y!==points[i].y)),'The requested movement is too small for native coordinate precision.','INVALID_TRANSLATION');
  return moved;
}
function putPoints(body,layout,points){const v=view(body);points.forEach((p,j)=>{v.setFloat32(layout.poolOffset+j*8,p.x,true);v.setFloat32(layout.poolOffset+j*8+4,p.y,true);});const xs=points.map(p=>p.x),ys=points.map(p=>p.y);[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].forEach((n,j)=>v.setFloat32(layout.rowOffset+24+j*4,n,true));}
function setCount(bytes,layout,count){const part=payload(bytes,layout.part),list=payload(bytes,layout.list);view(part).setUint32(20,count*4,true);const field=String(count).padStart(5,' ');ensure(field.length===5,'Native record counter overflow.');for(let i=0;i<5;i++)list[layout.rowOffset+i]=field.charCodeAt(i);return{part,list};}

async function analyze(doc,bytes){
  ensure(doc.variant==='VA','Native translation is verified for VA only.');
  const blocks=doc.blocks,layout=inspectLayout(bytes,blocks),v=view(bytes);
  for(const baseline of BASELINES){
    const operations=(layout.records-baseline.records)/4;
    if(!Number.isInteger(operations)||operations<0||operations>MAX_OPERATIONS||bytes.length!==baseline.bytes+128*operations)continue;
    let points=baseline.points.map(p=>({...p})),valid=true;
    for(let n=0;n<operations;n++){
      const at=layout.history.payloadOffset+(baseline.records+n*4)*32,dx=v.getFloat32(at+8,true),dy=v.getFloat32(at+40,true);
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>MAX_DELTA||Math.abs(dy)>MAX_DELTA||(dx===0&&dy===0)||!equal(bytes.subarray(at,at+128),translationRecords(dx,dy,baseline.records+n*4))){valid=false;break;}
      try{points=movePoints(points,dx,dy,{requireMovement:true});}catch{valid=false;break;}
    }
    if(!valid||!points.every((p,i)=>p.x===layout.target.points[i].x&&p.y===layout.target.points[i].y))continue;
    const {part,list}=setCount(bytes,layout,baseline.records),cache=payload(bytes,layout.cache);putPoints(cache,layout.target,baseline.points);
    const restored=rebuild(bytes,blocks,new Map([['3.100.1.0',part],['2.1.0.0',list],['3.100.2.0',bytes.subarray(layout.history.payloadOffset,layout.history.payloadOffset+baseline.records*32)],['3.100.7.1',cache]]));
    if(await digest(restored)!==baseline.sha256)continue;
    return{baseline,operations,layout,points,blocks};
  }
  fail('This file is not an unchanged supported ALAA baseline or a verified sequence of its line translations.');
}
function cachedAnalysis(doc){
  if(!doc||typeof doc!=='object')fail('Expected an authenticated native document.','INVALID_DOCUMENT');
  let result=verifiedDocuments.get(doc);
  if(!result){const bytes=serializeMdl(doc);result=analyze(doc,bytes);verifiedDocuments.set(doc,result);}
  return result;
}
function publicInfo(source){
  const objects=Object.freeze([Object.freeze({objectId:OBJECT,kind:'line',points:Object.freeze(source.points.map(p=>Object.freeze({...p})))})]);
  return Object.freeze({eligible:source.operations<MAX_OPERATIONS,reason:source.operations<MAX_OPERATIONS?null:'The limit of 50 appended translations has been reached.',partId:PART,capability:'single-native-line-translation',objects,operationsAdded:source.operations,maxOperations:MAX_OPERATIONS,remainingOperations:MAX_OPERATIONS-source.operations,baselineSha256:source.baseline.sha256,historyExecuted:false});
}

export async function inspectLineTranslation(doc,{partId}={}){
  if(partId!==PART)return Object.freeze({eligible:false,reason:'Native line translation is currently verified only for part 100.',objects:Object.freeze([]),historyExecuted:false});
  try{return publicInfo(await cachedAnalysis(doc));}catch(error){return Object.freeze({eligible:false,reason:error.message||'Native translation provenance could not be verified.',objects:Object.freeze([]),historyExecuted:false});}
}

export async function appendLineTranslation(doc,{partId,objectId,dx,dy}={}){
  ensure(partId===PART&&objectId===OBJECT,'Only part 100, native object 2004 is supported.');
  ensure([dx,dy].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=MAX_DELTA),'dx and dy must be finite millimetres within -1000 to 1000.','INVALID_TRANSLATION');
  dx=Math.fround(dx);dy=Math.fround(dy);ensure(dx!==0||dy!==0,'Enter a nonzero displacement.','INVALID_TRANSLATION');
  // Fresh serialization authenticates input and ignores mutable doc.bytes. Each
  // mutation rechecks the full normalized provenance, even after inspection.
  const bytes=serializeMdl(doc),source=await analyze(doc,bytes),{layout,blocks}=source;
  ensure(source.operations<MAX_OPERATIONS,'The limit of 50 appended translations has been reached.');
  const points=movePoints(source.points,dx,dy,{requireMovement:true}),history=join([bytes.subarray(layout.history.payloadOffset,layout.history.endOffset),translationRecords(dx,dy,layout.records)]),{part,list}=setCount(bytes,layout,layout.records+4),cache=payload(bytes,layout.cache);
  putPoints(cache,layout.target,points);
  const output=rebuild(bytes,blocks,new Map([['3.100.1.0',part],['2.1.0.0',list],['3.100.2.0',history],['3.100.7.1',cache]])),result=parseMdl(output);
  // Authenticate the exact serialized result through the same reopened-file
  // gate. No trusted-memory exception can admit an unverified saved document.
  const verification=analyze(result,serializeMdl(result));verifiedDocuments.set(result,verification);await verification;return result;
}
