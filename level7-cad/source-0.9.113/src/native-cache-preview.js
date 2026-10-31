/**
 * WORK-ONLY read-only evaluated sample preview; no native history execution.
 * Native visibility/style/curve semantics are deliberately not reconstructed.
 * This module exports no writer or editing API and never changes input bytes.
 */
import{nativeLineRoles,decodeNativePointMark,decodeNativeLineState}from'./native-line-attributes.mjs';
import {parseMdl,serializeMdl} from './native-mdl.js';
import {decodeDimensionPool,dimensionBoundsPoints} from './native-dimension-cache.mjs';
import {decodeLiteralTextPool} from './native-literal-text-codec.mjs';

const verifiedDocuments=new WeakMap();
const knownSampleFlags=new Set([66051,66049,131585,262657,328193,66050,131586,197121,197122,262658,328194,393730,4294509058,4294574594,4294771202,4294443522,4294640130,4294705666,4294836738]);
function verifiedSource(input){
  const doc=input instanceof Uint8Array?parseMdl(input):input;
  if(!doc||typeof doc!=='object')throw new TypeError('Preview expects native bytes or a production parseMdl document.');
  let source=verifiedDocuments.get(doc);
  if(!source){
    // serializeMdl authenticates the production document and returns retained
    // private bytes; mutable inspection doc.bytes cannot bypass validation.
    const bytes=serializeMdl(doc);source={bytes,blocks:doc.blocks,variant:doc.variant};
    if(source.variant!=='VA')throw new Error('This evaluated-cache variant has not been verified for preview; VA only.');
    verifiedDocuments.set(doc,source);
  }
  return source;
}

export function readCachedPreview(input,{partId,sizeId=1}={}){
  if(!Number.isInteger(partId)||partId<1||!Number.isInteger(sizeId)||sizeId<1)throw new Error('Part and cache size IDs must be positive integers.');
  const source=verifiedSource(input),matches=source.blocks.filter(block=>block.id[0]===3&&block.id[1]===partId&&block.id[2]===7&&block.id[3]===sizeId);
  if(matches.length!==1)throw new Error('A unique evaluated cache is required for read-only preview.');
  const block=matches[0],v=new DataView(source.bytes.buffer,source.bytes.byteOffset+block.payloadOffset,block.payloadSize);
  if(v.byteLength<8)throw new Error('Truncated evaluated cache.');
  const count=v.getUint32(0,true),pool=8+40*count;
  if(v.getUint32(4,true)*8!==v.byteLength||pool>v.byteLength)throw new Error('Evaluated cache table/count/length is inconsistent.');
  const table=[];let end=pool;
  for(let index=0;index<count;index++){
    const offset=8+index*40,extra=v.getUint32(offset+4,true),samples=v.getUint32(offset+12,true),span=(extra+samples)*8;
    if(extra!==0&&extra!==2)throw new Error('Evaluated cache extra-slot layout has not been verified.');
    if(!Number.isSafeInteger(span)||span>v.byteLength-end)throw new Error('Evaluated sample span exceeds declared cache.');
    table.push({index,objectId:v.getUint32(offset,true),flags:v.getUint32(offset+20,true),sampleCount:samples,extraSlotCount:extra,offset,coordinatesOffset:end+extra*8});end+=span;
  }
  if(end!==v.byteLength)throw new Error('Evaluated object/sample pool does not end at its declared boundary.');
  const objects=[],unsupported=[],reserved=[];
  for(const entry of table){
    const klass=entry.flags&255;
    if(entry.flags===66052&&entry.extraSlotCount===0&&v.getUint32(entry.offset+8,true)===0){
      try{const annotation=decodeLiteralTextPool(new Uint8Array(v.buffer,v.byteOffset+entry.coordinatesOffset,entry.sampleCount*8));const expected=[annotation.bounds[0],annotation.bounds[3],annotation.bounds[2],annotation.bounds[1]];if(annotation.objectId!==entry.objectId||!expected.every((n,i)=>n===v.getFloat32(entry.offset+24+4*i,true)))throw Error('Text cache identity or bounds differ');objects.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,kind:'literal-text',annotation,points:[{x:expected[0],y:expected[1]},{x:expected[2],y:expected[3]}]});}catch(error){unsupported.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,reason:error.message});}
      continue;
    }
    // Inactive native point storage is never exposed as drawing geometry.
    if(entry.flags===4294574593&&entry.extraSlotCount===0&&entry.sampleCount===1){
      const x=v.getFloat32(entry.coordinatesOffset,true),y=v.getFloat32(entry.coordinatesOffset+4,true);
      if(Number.isFinite(x)&&Number.isFinite(y)&&[x,y,x,y].every((n,i)=>n===v.getFloat32(entry.offset+24+i*4,true))){reserved.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,kind:'inactive-point-slot'});continue;}
    }
    if(entry.flags===66054&&entry.extraSlotCount===0&&v.getUint32(entry.offset+8,true)===0){
      try{
        const dimension=decodeDimensionPool(new Uint8Array(v.buffer,v.byteOffset+entry.coordinatesOffset,entry.sampleCount*8)),pairs=dimensionBoundsPoints(dimension),expected=[Math.min(...pairs.map(p=>p[0])),Math.min(...pairs.map(p=>p[1])),Math.max(...pairs.map(p=>p[0])),Math.max(...pairs.map(p=>p[1]))];
        if(!expected.every((n,i)=>n===v.getFloat32(entry.offset+24+4*i,true)))throw Error('Dimension bounds differ from its typed primitives.');
        objects.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,kind:'dimension',points:pairs.map(([x,y])=>({x,y})),dimension});
      }catch(error){unsupported.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,reason:error.message});}
      continue;
    }
    if(!knownSampleFlags.has(entry.flags)||!((klass===1&&(entry.sampleCount===1||entry.flags===66049&&entry.sampleCount>=2&&entry.sampleCount<=401))||(klass===2&&entry.sampleCount>=2)||(klass===3&&entry.flags===66051&&entry.extraSlotCount===2&&entry.sampleCount>=4&&entry.sampleCount<=4096&&entry.sampleCount%2===0&&[2,0,5,1,2,0,0,0,101,0,0,0,0,0,0,0].every((n,i)=>v.getUint8(entry.coordinatesOffset-16+i)===n)))){unsupported.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,reason:'Native object class, style flags or sample count are not decoded for preview.'});continue;}
    const points=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,valid=true;
    for(let index=0;index<entry.sampleCount;index++){
      const offset=entry.coordinatesOffset+index*8,x=v.getFloat32(offset,true),y=v.getFloat32(offset+4,true);
      if(!Number.isFinite(x)||!Number.isFinite(y)){valid=false;break;}
      points.push({x,y});minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    const expected=[minX,minY,maxX,maxY];
    if(!valid||!expected.every((value,index)=>value===v.getFloat32(entry.offset+24+index*4,true))){unsupported.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,reason:'Sample coordinates/extents do not match this preview grammar.'});continue;}
    const role=nativeLineRoles.find(r=>r.id===decodeNativeLineState(entry.flags));
    objects.push({index:entry.index,objectId:entry.objectId,flags:entry.flags,...(role?{lineRole:role.key,lineRoleColor:role.color}:{}),...(decodeNativePointMark(entry.flags)!==null?{pointMark:decodeNativePointMark(entry.flags)}:{}),kind:klass===3?'segment-pairs':klass===1?(entry.sampleCount===1?'point':'point-sequence'):'sample-path',...((entry.flags&65535)===514&&[1,2,3,4,5,6].includes(entry.flags>>>16)?{lineStyle:entry.flags>>>16}:{}),points});
  }
  return{partId,sizeId,readOnly:true,historyExecuted:false,cachePayloadBytes:v.byteLength,totalObjects:count,objects,unsupported,reserved,warnings:['Straight segments connect stored evaluated samples; native curve definitions are not reconstructed.','Stored cache may be stale; unknown construction history is not replayed or used to verify these samples.','Native visibility, line style, grain-arrow decorations and other display flags are not interpreted.','No editing, save transformation, construction replay or cross-part dependency support is enabled.']};
}
