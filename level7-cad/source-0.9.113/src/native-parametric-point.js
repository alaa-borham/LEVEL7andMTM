/**
 * Separate bounded X1/Z1/point201 capability; the general native edit gate stays
 * unchanged. It recognizes only exact controlled native fixtures and their
 * parameter-only descendants through a complete normalized SHA-256 check.
 * It is not an evaluator for arbitrary native histories or ALAA constructions.
 */
import {parseMdl,serializeMdl} from './native-mdl.js';
export {getParametricPointExampleBytes,PARAMETRIC_POINT_EXAMPLE_INFO} from './native-parametric-example.js';

// Both independent stale-cache candidates passed original-program Test Run:
// changing X1 moved point80→100; changing Z1 moved point80→120. Every native
// history byte, including the stored input80 beside reference201, stayed exact.
const WRITING_VERIFIED=true;
const PART=1,POINT=2004,MAX_X=1000;
const SUPPORTED_FORMULAS=Object.freeze(['X1*2','X1*3']);
const anchors=Object.freeze([
  Object.freeze({sha256:'3bf740f1402d43d16527bd57cbffd9cd2f4844d71b69f80a397b9930cceea57d',xValue:40,formula:'X1*2',pointX:80}),
  Object.freeze({sha256:'e2c6f661ee5301ea8da8156aaa88a136699620f8df627a5271728412d9416f6b',xValue:50,formula:'X1*2',pointX:100}),
  Object.freeze({sha256:'70a2eb5e22e9ef1dc493c83bb939ee80849443641be44bebf3dd67aaf55fc1fd',xValue:50,formula:'X1*2',pointX:100}),
  Object.freeze({sha256:'559e4d5e450c8bf9dd04fe9e70bc2055ed73e98f62d854e6a1d267b0ae7682be',xValue:40,formula:'X1*3',pointX:120}),
  Object.freeze({sha256:'7ae8d8e7d7c9914208287b1b7e16f4df30a024f8e31ed549842b4fa3b312b312',xValue:50,formula:'X1*3',pointX:150})
]);
const cached=new WeakMap();
function fail(message,code='PARAMETRIC_READ_ONLY'){const error=new Error(message);error.name='NativeParametricPointError';error.code=code;throw error;}
function ensure(value,message,code){if(!value)fail(message,code);}
function v(bytes){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
function equal(a,b){return a.length===b.length&&a.every((n,i)=>n===b[i]);}
function ascii(bytes,start,length){let result='';for(let n=start;n<start+length;n++)result+=String.fromCharCode(bytes[n]);return result;}
function check(bytes,start=0,length=bytes.length){const data=v(bytes);let total=0;for(let n=4;n<length;n+=2){total=(total+Math.imul(n/2+1,data.getInt16(start+n,true)))|0;if(total>=1_024_000_000)total-=1_024_000_000;}return total>>>0;}
async function digest(bytes){ensure(globalThis.crypto?.subtle,'SHA-256 verification is unavailable.');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
function unique(blocks,id){const entries=blocks.filter(b=>b.id.join('.')===id);ensure(entries.length===1,`A unique ${id} block is required.`);return entries[0];}
function payload(bytes,b){return bytes.slice(b.payloadOffset,b.endOffset);}
function join(parts){const result=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;}
function rebuild(bytes,blocks,replacements){
  const sections=blocks.map(b=>{const body=replacements.get(b.id.join('.'));if(!body)return bytes.subarray(b.offset,b.endOffset);const out=join([bytes.subarray(b.offset,b.payloadOffset),body]),data=v(out);data.setUint32(4,out.length/8,true);data.setUint32(0,check(out),true);return out;});
  const out=join([bytes.subarray(0,80),...sections,bytes.subarray(bytes.length-8)]);v(out).setUint32(4,(out.length-8)/8,true);v(out).setUint32(0,check(out,0,80),true);return out;
}
function putFormula(bytes,formula){for(let n=0;n<4;n++)bytes[24+n]=formula.charCodeAt(n);}
function putPoint(bytes,x){const data=v(bytes);for(const offset of[152,160,200]){data.setFloat32(offset,x,true);data.setFloat32(offset+4,0,true);}}
function parseFormula(formula){ensure(typeof formula==='string'&&formula.length<=128,'Enter a supported Z1 formula of at most 128 characters.','INVALID_PARAMETER');const canonical=formula.replace(/\s+/g,'').toUpperCase();ensure(SUPPORTED_FORMULAS.includes(canonical),'The verified Z1 formulas are X1*2 and X1*3 only.','INVALID_PARAMETER');return canonical;}
function pointValue(xValue,formula){const factor=formula==='X1*2'?2:3,result=Math.fround(xValue*factor);ensure(Number.isFinite(result),'The calculated point exceeds native precision.','INVALID_PARAMETER');return result;}

function inspectLayout(doc,bytes){
  ensure(doc.variant==='VA'&&bytes.length===5584&&doc.blocks.length===14,'This document is outside the controlled X1/Z1 point family.');
  const blocks=doc.blocks;ensure(new Set(blocks.map(b=>b.id.join('.'))).size===14&&blocks.filter(b=>b.id[0]===3).every(b=>b.id[1]===PART),'The native part/block identity differs.');
  const history=unique(blocks,'3.1.2.0'),part=unique(blocks,'3.1.1.0'),x=unique(blocks,'3.1.3.1'),z=unique(blocks,'3.1.6.34'),cache=unique(blocks,'3.1.7.1'),data=v(bytes);
  ensure(history.payloadSize===480&&part.payloadSize===152&&x.payloadSize===24&&z.payloadSize===32&&cache.payloadSize===208,'Unverified native parameter block dimensions.');
  ensure(data.getUint32(part.payloadOffset+8,true)===20&&data.getUint32(part.payloadOffset+20,true)===60&&data.getUint32(part.payloadOffset+52,true)===34,'Native object/history counters or auxiliary marker differ.');
  const xp=payload(bytes,x),xv=v(xp),xValue=xv.getFloat32(16,true);
  ensure(xv.getUint32(0,true)===3&&xv.getUint16(4,true)===1&&ascii(xp,6,8)==='        '&&xp[14]===0&&xp[15]===0&&xv.getUint32(20,true)===0&&Number.isFinite(xValue)&&Math.abs(xValue)<=MAX_X,'Only the bounded default local X1 value is supported.');
  const zp=payload(bytes,z),zv=v(zp);
  ensure([4,0x0c00,1,12,4,0].every((n,i)=>zv.getUint16(i*2,true)===n)&&[12,16,20].every(offset=>zv.getUint32(offset,true)===0)&&equal(zp.subarray(28),new Uint8Array([0,32,32,32])),'The Z1 definition schema differs.');
  const formula=ascii(zp,24,4);ensure(SUPPORTED_FORMULAS.includes(formula),'The stored Z1 formula is outside the verified subset.');
  const h=history.payloadOffset+352;
  ensure([197,100,9601,201].every((n,i)=>data.getUint16(h+i*2,true)===n)&&data.getFloat32(h+8,true)===80,'The measured Z1-bound X input or its retained historical float differs.');
  const cp=payload(bytes,cache),cv=v(cp);ensure(cv.getUint32(0,true)===4&&cv.getUint32(4,true)===26,'Unverified point cache dimensions.');
  for(let n=0;n<4;n++){const at=8+n*40;ensure(cv.getUint32(at,true)===2001+n&&cv.getUint32(at+4,true)===0&&cv.getUint32(at+8,true)===0&&cv.getUint32(at+12,true)===(n===2?2:1)&&cv.getUint32(at+20,true)===(n===2?66050:66049),'Native point/line cache identity differs.');}
  const currentX=pointValue(xValue,formula);ensure([152,160,200].every(offset=>cv.getFloat32(offset,true)===currentX&&cv.getFloat32(offset+4,true)===0),'The dependent point cache is stale or inconsistent with X1/Z1.');
  return{blocks,history,part,x,z,cache,xValue,formula,currentX};
}

async function analyze(doc,bytes){
  const layout=inspectLayout(doc,bytes);
  for(const anchor of anchors){
    const x=payload(bytes,layout.x),z=payload(bytes,layout.z),cache=payload(bytes,layout.cache);v(x).setFloat32(16,anchor.xValue,true);putFormula(z,anchor.formula);putPoint(cache,anchor.pointX);
    const normalized=rebuild(bytes,layout.blocks,new Map([['3.1.3.1',x],['3.1.6.34',z],['3.1.7.1',cache]]));
    if(await digest(normalized)===anchor.sha256)return{...layout,anchor};
  }
  fail('This file is not an authenticated controlled X1/Z1 point fixture or its supported parameter edits.');
}
function sourceFor(doc){ensure(doc&&typeof doc==='object','Expected an authenticated native document.','INVALID_DOCUMENT');let promise=cached.get(doc);if(!promise){promise=analyze(doc,serializeMdl(doc));cached.set(doc,promise);}return promise;}
function publicInfo(source){
  return Object.freeze({eligible:WRITING_VERIFIED,reason:WRITING_VERIFIED?null:'Native parameter editing is awaiting the controlled causal replay checks.',partId:PART,canInspect:true,xEntries:Object.freeze([Object.freeze({index:1,value:source.xValue})]),editableXIndices:Object.freeze(WRITING_VERIFIED?[1]:[]),zEntries:Object.freeze([Object.freeze({index:1,formula:source.formula})]),editableZIndices:Object.freeze(WRITING_VERIFIED?[1]:[]),currentPoint:Object.freeze({objectId:POINT,x:source.currentX,y:0}),supportedFormulas:SUPPORTED_FORMULAS,limits:Object.freeze({minimum:-MAX_X,maximum:MAX_X}),baselineSha256:source.anchor.sha256,historyExecuted:false,scope:'Controlled local X1 / Z1 / point 2004 only'});
}

export async function inspectParametricPoint(doc,{partId}={}){
  if(partId!==PART)return Object.freeze({eligible:false,reason:'This capability is verified only for native part 1.',xEntries:Object.freeze([]),zEntries:Object.freeze([]),editableXIndices:Object.freeze([]),editableZIndices:Object.freeze([]),canInspect:false});
  try{return publicInfo(await sourceFor(doc));}catch(error){return Object.freeze({eligible:false,reason:error.message||'Native parameter provenance could not be verified.',xEntries:Object.freeze([]),zEntries:Object.freeze([]),editableXIndices:Object.freeze([]),editableZIndices:Object.freeze([]),canInspect:false});}
}
async function update(doc,{partId,index,xValue,formula}={}){
  ensure(WRITING_VERIFIED,'Native parameter editing is awaiting the controlled causal replay checks.','PARAMETRIC_VERIFICATION_PENDING');
  ensure(partId===PART&&index===1,'Only local X1 or Z1 in native part 1 is supported.');
  const bytes=serializeMdl(doc),source=await analyze(doc,bytes);
  const value=xValue===undefined?source.xValue:xValue;
  ensure(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=MAX_X,'X1 must be finite millimetres within -1000 to 1000.','INVALID_PARAMETER');
  const nextX=Math.fround(value),nextFormula=formula===undefined?source.formula:parseFormula(formula),nextPoint=pointValue(nextX,nextFormula);
  if(nextX===source.xValue&&nextFormula===source.formula)return doc;
  const x=payload(bytes,source.x),z=payload(bytes,source.z),cache=payload(bytes,source.cache);v(x).setFloat32(16,nextX,true);putFormula(z,nextFormula);putPoint(cache,nextPoint);
  const output=rebuild(bytes,source.blocks,new Map([['3.1.3.1',x],['3.1.6.34',z],['3.1.7.1',cache]])),result=parseMdl(output),verification=analyze(result,serializeMdl(result));cached.set(result,verification);await verification;return result;
}
export async function updateParametricX(doc,{partId,index,value}={}){
  ensure(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=MAX_X,'X1 must be finite millimetres within -1000 to 1000.','INVALID_PARAMETER');
  return update(doc,{partId,index,xValue:value});
}
export async function updateParametricZ(doc,{partId,index,formula}={}){return update(doc,{partId,index,formula:parseFormula(formula)});}
