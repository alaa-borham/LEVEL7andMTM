import{readVerticalDartPair}from'./native-dart-shortening.mjs';
import{appendedPerforation10}from'./native-perforation10.mjs';
import{appendedBartack10}from'./native-bartack10.mjs';
import{appendedButtonhole40}from'./native-buttonhole40.mjs';
import{appendedButtonhole20}from'./native-buttonhole20.mjs';
import{appendedButtonhole10}from'./native-buttonhole10.mjs';
import{appendedSeam40}from'./native-seam40.mjs';
import{appendedSeam10}from'./native-seam10.mjs';
import{appendedPatternSeam}from'./native-pattern-seam.mjs';
import{sameSymbolTypeHistory,symbolTypeSuffix}from'./native-symbol-type.mjs';
import{appendedNotchConversion,readNotchConversion}from'./native-notch-conversion.mjs';
import{sameNativeTransformHintHistory}from'./native-transform-hints.mjs';
import{readPointTurnMoveRecords}from'./native-point-turnmove-records.mjs';
import{readPointRotateRecords}from'./native-point-rotate-records.mjs';
import{readPointMirrorRecords}from'./native-point-mirror-records.mjs';
import{readPointMoveRecords}from'./native-point-move-records.mjs';
import{readOriginalReflectionRecords}from'./native-reflection-records.mjs';
import {readOriginalCurveMorphRecords} from './native-curve-morph-records.mjs';
import{appendedInteractivePartReferences}from'./interactive-insert-part-link-schema.mjs';
import{readInteractiveInsertedLine}from'./interactive-insert-line-kernel.mjs';
import{appendedRaster20References}from'./raster20-link-schema.mjs';
import{appendedChamferReferences}from'./chamfer-link-schema.mjs';
import{appendedLineCurveReferences}from'./interactive-append-link-schema.mjs';
import{decodeQSPointSelection}from'./native-qs-point-selection.mjs';
import{readLiteralPointRecords}from'./native-coordinate-point-records.mjs';
import{knownRaster20RangeChange}from'./raster20-range-schema.mjs';
import{readSequenceLineRecord}from'./native-sequence-line-record.mjs';
import{readRaster0Record}from'./native-raster0-record.mjs';
import{knownQsNumericReferenceChange,knownQsLine10DirectionChange,knownQsLine10ParameterChange}from'./qs-numeric-reference-schema.mjs';
import{readOriginalPerpendicularRecords}from'./native-perpendicular-records.mjs';
import{appendedCurveReplacement}from'./replace-curve-kernel.mjs';
import{readOriginalJoinRecord}from'./native-join-records.mjs';
import{readOriginalCutRecords,readOriginalSplitRecords}from'./native-cut-records.mjs';
import{readIntersectionNotchRecords,readCopiedNotchRecord}from'./native-intersection-notch-records.mjs';
import{knownGrainReferenceChange}from'./grain-reference-schema.mjs';
import{readEndpointNotchRecords}from'./native-endpoint-notch-records.mjs';
import{nativeLineStates,nativePointMarks}from'./native-line-attributes.mjs';
import {knownQqReferenceChange} from './qq-reference-schema.mjs';
/** Pre-mutation reference protection. Coordinates in stored previews are never
 * calculation inputs. A successful preflight is NOT full geometry validation. */
import {serializeMdl,parseMdl} from './native-mdl.js';
import {readInheritanceGroup} from './part-inheritance-kernel.mjs';
import {readInsertedPart} from './insert-part-kernel.mjs';
import{readInteractiveInsertedPoint}from'./interactive-insert-point-kernel.mjs';
import {trailingLinkedDrawingStart,trailingLinkedDrawingGroups,readLinkedPointRecords,readStableLengthRecords,readStableOffsetRecords} from './native-linked-point-records.mjs';
const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),eq=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const need=(ok,m)=>{if(!ok)throw Error(m);},empty=new Uint8Array();
function snapshot(document){
 const bytes=serializeMdl(document),doc=parseMdl(bytes),blocks=new Map();
 for(const b of doc.blocks){const key=b.id.join('.');need(!blocks.has(key),'Duplicate block in reference preflight');blocks.set(key,bytes.subarray(b.payloadOffset,b.endOffset));}
 const ids=[...new Set(doc.blocks.filter(b=>b.id[0]===3).map(b=>b.id[1]))],parts=new Map(),edges=[],uncertain=[];
 need(ids.length<=999,'Reference preflight part limit');
 const add=edge=>{if(!edges.some(e=>JSON.stringify(e)===JSON.stringify(edge)))edges.push(edge);};
 for(const partId of ids){
  const get=(f,i)=>blocks.get(`3.${partId}.${f}.${i}`)??empty,history=get(2,0),header=get(1,0),references=get(4,0);
  need(history.length%32===0&&history.length/32<=100000,'Invalid reference preflight history');
  const parameters=new Map([...blocks].filter(([key])=>{const id=key.split('.').map(Number);return id[0]===3&&id[1]===partId&&(id[2]===3||id[2]===6&&id[3]===34);}));
  const part={partId,header,history,references,parameters,identity:header.length>=84?Array.from(header.subarray(76,84)).join(','):null};parts.set(partId,part);
  for(let record=1;record<=history.length/32;record++){
   const raw=history.subarray((record-1)*32,record*32),h=v(raw);
   if(h.getUint16(0,true)===112&&h.getUint16(2,true)===101){
    try{const plan=readInheritanceGroup(history,record);for(const m of plan.mappings)add({...m,targetPartId:partId,record});record=plan.lastRecord;}
    catch(error){uncertain.push({partId,record,reason:error.message});}
   }else if(h.getUint16(0,true)===101&&String.fromCharCode(...raw.subarray(12))==='GraPrg_GK_TO_c007_00'){
    try{readNotchConversion({historyRecord:raw,record,parameters:get(3,h.getUint16(4,true)),references});}catch(error){uncertain.push({partId,record,reason:error.message});}
   }else if(h.getUint16(0,true)===101&&String.fromCharCode(...raw.subarray(12)).startsWith('GraPrg_GK_TO_')){
    try{const decode=String.fromCharCode(...raw.subarray(12))==='GraPrg_GK_TO_c003_03'?readInteractiveInsertedLine:String.fromCharCode(...raw.subarray(12))==='GraPrg_GK_TO_c004_02'?readInteractiveInsertedPoint:readInsertedPart,plan=decode({historyRecord:raw,record,parameters:get(3,h.getUint16(4,true)),references});for(const m of plan.mappings)add({...m,sourcePartId:plan.sourcePartId,targetPartId:partId,record});}
    catch(error){uncertain.push({partId,record,reason:error.message});}
   }
  }
  for(let at=0;at<references.length;){
   need(at+16<=references.length,'Truncated reference table');const r=v(references.subarray(at)),length=r.getUint32(0,true)*8;need(length>=16&&at+length<=references.length,'Invalid reference span');
   if(length===40&&r.getUint16(4,true)===256&&r.getUint16(6,true)===1&&r.getUint16(8,true)===3){
    const sourcePartId=r.getUint16(16,true),sourceObjectId=r.getUint16(18,true);
    if(sourcePartId&&sourcePartId!==partId){need(sourcePartId<=999&&sourceObjectId>=2001,'Invalid external object identity');add({sourcePartId,sourceObjectId,targetPartId:partId,record:r.getUint16(10,true),objectId:null});}
   }at+=length;
  }
 }
 return{parts,edges,uncertain,globalX:blocks.get('2.3.0.0')??empty};
}
function numericOnly(before,after){
 if(before.length!==after.length)return false;
 const groups=trailingLinkedDrawingGroups(before),offsetPositions=new Set(groups.filter((g,i)=>g.kind==='offset'&&!groups.slice(i+1).some(h=>h.id===g.id)).map(g=>g.at));
 const lengthPositions=new Set(trailingLinkedDrawingGroups(before).filter(g=>g.kind==='length').map(g=>g.at));
 for(let at=0;at<before.length;at+=32){if(offsetPositions.has(at)){const a=before.subarray(at,at+96),b=after.subarray(at,at+96);if(!eq(a,b)){const x=readStableOffsetRecords(a),y=readStableOffsetRecords(b);if(!x||!y||x.id!==y.id||x.side!==y.side)return false;at+=64;continue;}}const a=before.subarray(at,at+32),b=after.subarray(at,at+32);if(eq(a,b))continue;
  if(lengthPositions.has(at)){const x=readStableLengthRecords(before.subarray(at,at+64)),y=readStableLengthRecords(after.subarray(at,at+64));if(x&&y&&x.id===y.id&&x.fromStart===y.fromStart&&!!x.absolute===!!y.absolute&&!!x.zIndex===!!y.zIndex){at+=32;continue;}}
  const iA=readIntersectionNotchRecords(before.subarray(at,at+96)),iB=readIntersectionNotchRecords(after.subarray(at,at+96));if(iA&&iB&&['id','sourceId','targetId','end','pick'].every(k=>iA[k]===iB[k])){at+=64;continue;}
  const notchA=readEndpointNotchRecords(before.subarray(at,at+96)),notchB=readEndpointNotchRecords(after.subarray(at,at+96));if(notchA&&notchB&&['id','sourceId','endpoint','mode','directionSourceId','directionFraction'].every(k=>notchA[k]===notchB[k])){at+=64;continue;}
  const first=readLinkedPointRecords(before.subarray(at,at+64)),second=readLinkedPointRecords(after.subarray(at,at+64));
  const literalA=readLiteralPointRecords(before.subarray(at,at+64)),literalB=readLiteralPointRecords(after.subarray(at,at+64));
  if(literalA&&literalB&&literalA.id===literalB.id){at+=32;continue;}
  if(first?.type==='fraction'&&second?.type==='fraction'&&first.id===second.id&&first.sourceId===second.sourceId){at+=32;continue;}
  const h=v(a);if(h.getUint16(0,true)%100!==97||![9601,9602,9603,9604].includes(h.getUint16(4,true))||h.getUint16(6,true)!==0||!eq(a.subarray(0,8),b.subarray(0,8))||!eq(a.subarray(12),b.subarray(12))||!Number.isFinite(v(b).getFloat32(8,true)))return false;
 }return true;
}
function removedLiteralIds(before,after){
 if(after.length>=before.length||!eq(after,before.subarray(0,after.length)))return null;
 const suffix=before.subarray(after.length),ids=[];try{const inherited=readInheritanceGroup(suffix,1);if(inherited.lastRecord*32===suffix.length)return inherited.mappings.map(m=>m.objectId);}catch{};if(suffix.length===64){const perp=readOriginalPerpendicularRecords(suffix);if(perp)return[perp.id];const split=readOriginalSplitRecords(suffix);if(split)return[split.newId];}if(suffix.length===32){const converted=readSequenceLineRecord(suffix);if(converted)return[converted.id];const raster=readRaster0Record(suffix);if(raster)return[raster.id];const n=readCopiedNotchRecord(suffix);if(n)return[n.id];}if(suffix.length===96){const n=readEndpointNotchRecords(suffix);if(n)return[n.id];const i=readIntersectionNotchRecords(suffix);if(i)return[i.id];}
 for(let at=0;at<suffix.length;){const raw=suffix.subarray(at);if(raw.length<8)return null;const h=v(raw),fraction=h.getUint16(0,true)===196&&h.getUint16(4,true)===3,distance=h.getUint16(0,true)===197&&h.getUint16(4,true)===9604;
  if(fraction||distance){const size=fraction?64:96;if(raw.length<size)return null;const expected=new Uint8Array(size),e=v(expected),offset=fraction?0:32,id=h.getUint32(size-20,true),source=h.getUint32(offset+8,true),number=h.getFloat32(fraction?28:8,true),mode=h.getUint32(offset+16,true);if(id<2001||id>=60000||source<2001||source>=60000||id===source||!Number.isFinite(number)||(fraction?number<0||number>1:number<0||number>1e6)||! (fraction?mode===18:[18,0xffff0012].includes(mode)))return null;
   const headers=fraction?[[196,101,3,0],[294,201,1,0]]:[[197,100,9604,0],[296,201,10,0],[394,301,1,0]];headers.forEach((row,i)=>row.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));e.setUint32(offset+8,source,true);e.setUint32(offset+12,fraction?65536:0,true);e.setUint32(offset+16,mode,true);e.setFloat32(fraction?28:8,number,true);e.setUint32(size-20,id,true);if(!eq(expected,raw.subarray(0,size)))return null;ids.push(id);at+=size;continue;
  }
  const point=h.getUint16(0,true)===197,size=point?128:96;if(raw.length<size)return null;
  const expected=new Uint8Array(size),e=v(expected),headers=point?[[197,100,9601,0],[297,200,9602,0],[396,301,12,0],[494,401,1,0]]:[[196,101,2,0],[296,201,2,0],[394,301,2,0]];
  headers.forEach((row,i)=>row.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));
  const id=h.getUint32(point?108:76,true);if(id<2001||id>=65535)return null;
  if(point){for(const offset of[8,40]){const n=h.getFloat32(offset,true);if(!Number.isFinite(n))return null;e.setFloat32(offset,n,true);}e.setUint32(80,18,true);e.setUint32(108,id,true);}
  else{e.setUint32(8,h.getUint32(8,true),true);e.setUint32(12,65536,true);e.setUint32(16,18,true);e.setUint32(40,h.getUint32(40,true),true);e.setUint32(44,65536,true);e.setUint32(48,19,true);e.setUint32(76,id,true);}
  if(!eq(expected,raw.subarray(0,size)))return null;ids.push(id);at+=size;
 }return ids;
}
function removedStableOffsets(before,after){
 if(after.length>=before.length||!eq(after,before.subarray(0,after.length)))return false;
 const suffix=before.subarray(after.length);if(suffix.length%96)return false;
 for(let at=0;at<suffix.length;at+=96){const raw=suffix.subarray(at,at+96),q=v(raw),expected=new Uint8Array(96),e=v(expected),id=q.getUint16(70,true);
  if(id<2001||id>=65535)return false;[[197,100,402,0],[297,200,403,0],[104,206,0,id,65535,id]].forEach((h,i)=>h.forEach((x,j)=>e.setUint16(i*32+j*2,x,true)));
  for(const offset of[8,40]){const n=q.getFloat32(offset,true);if(!Number.isFinite(n)||Math.abs(n)>1000)return false;e.setFloat32(offset,n,true);}const side=q.getFloat32(80,true);if(![1,-1].includes(side))return false;e.setFloat32(80,side,true);e.setFloat32(88,q.getFloat32(40,true),true);if(!eq(raw,expected))return false;
 }return true;
}
function stableOffsetBeforeLinkedTail(a,b){
 if(a.length>b.length)return stableOffsetBeforeLinkedTail(b,a);
 if(b.length!==a.length+96)return false;
 for(const at of[...trailingLinkedDrawingGroups(a).map(g=>g.at),a.length]){if(!eq(a.subarray(0,at),b.subarray(0,at))||!eq(a.subarray(at),b.subarray(at+96)))continue;const raw=b.subarray(at,at+96);if(removedStableOffsets(raw,empty)&&at===trailingLinkedDrawingStart(a,v(raw).getUint16(70,true)))return true;}return false;
}
function removedStableConnection(a,b){if(a.length!==b.length+32||!eq(b,a.subarray(0,b.length)))return false;const raw=a.subarray(b.length),q=v(raw),first=q.getUint16(6,true),second=q.getUint16(10,true),pick=q.getFloat32(20,true);return q.getUint16(0,true)===105&&q.getUint16(2,true)===101&&q.getUint16(4,true)===0&&q.getUint16(8,true)===0&&first>=2001&&first<60000&&second>=2001&&second<60000&&first!==second&&[4,5,6,7].includes(q.getUint16(12,true))&&q.getUint16(14,true)===65535&&q.getUint16(16,true)===first&&q.getUint16(18,true)===second&&Number.isFinite(pick)&&pick>=0&&pick<=10000&&raw.subarray(24).every(n=>n===0);}
function removedStableJoin(before,after){return before.length===after.length+32&&eq(after,before.subarray(0,after.length))&&!!readOriginalJoinRecord(before.subarray(after.length));}
function removedDartShortening(a,b){
 if(a.history.length!==b.history.length+96||!eq(b.history,a.history.subarray(0,b.history.length))||!eq(a.references,b.references)||a.parameters.size!==b.parameters.size||[...a.parameters].some(([k,p])=>!eq(p,b.parameters.get(k)??empty)))return false;
 const raw=a.history.subarray(b.history.length),q=v(raw),amount=q.getFloat32(8,true);
 try{return q.getUint16(0,true)===197&&q.getUint16(2,true)===100&&q.getUint16(4,true)===1105&&q.getUint16(6,true)===0&&Number.isFinite(amount)&&amount!==0&&Math.abs(amount)<=500&&raw.subarray(12,32).every(n=>n===0)&&!!readVerticalDartPair(raw.subarray(32,64),raw.subarray(64,96));}catch{return false;}
}
function removedPointTurnMove(a,b){return a.length===b.length+192&&eq(b,a.subarray(0,b.length))&&!!readPointTurnMoveRecords(a.subarray(b.length),b.length/32+1);}
function removedPointRotate(a,b){return a.length===b.length+160&&eq(b,a.subarray(0,b.length))&&!!readPointRotateRecords(a.subarray(b.length),b.length/32+1);}
function removedPointMirror(a,b){return a.length===b.length+128&&eq(b,a.subarray(0,b.length))&&!!readPointMirrorRecords(a.subarray(b.length),b.length/32+1);}
function removedPointMove(a,b){return a.length===b.length+128&&eq(b,a.subarray(0,b.length))&&!!readPointMoveRecords(a.subarray(b.length),b.length/32+1);}
function removedStableReflection(before,after){return before.length===after.length+64&&eq(after,before.subarray(0,after.length))&&!!readOriginalReflectionRecords(before.subarray(after.length),after.length/32+1);}
function removedStableCuts(before,after){if(after.length>=before.length||!eq(after,before.subarray(0,after.length)))return false;const raw=before.subarray(after.length);return raw.length===64&&!!readOriginalCutRecords(raw);}
function stableSplitBeforeLinkedTail(a,b){if(a.length>b.length)return stableSplitBeforeLinkedTail(b,a);if(b.length!==a.length+64)return false;for(const at of[...trailingLinkedDrawingGroups(a).map(g=>g.at),a.length]){if(!eq(a.subarray(0,at),b.subarray(0,at))||!eq(a.subarray(at),b.subarray(at+64)))continue;const r=readOriginalSplitRecords(b.subarray(at,at+64));if(r&&at===trailingLinkedDrawingStart(a,r.targetId))return true;}return false;}
function stableCutBeforeLinkedTail(a,b){if(a.length>b.length)return stableCutBeforeLinkedTail(b,a);if(b.length!==a.length+64)return false;for(const at of[...trailingLinkedDrawingGroups(a).map(g=>g.at),a.length]){if(!eq(a.subarray(0,at),b.subarray(0,at))||!eq(a.subarray(at),b.subarray(at+64)))continue;const r=readOriginalCutRecords(b.subarray(at,at+64));if(r&&at===trailingLinkedDrawingStart(a,r.targetId))return true;}return false;}
function removedStableLengths(a,b){if(b.length>=a.length||!eq(b,a.subarray(0,b.length)))return false;const suffix=a.subarray(b.length);if(suffix.length%64)return false;for(let at=0;at<suffix.length;at+=64)if(!readStableLengthRecords(suffix.subarray(at,at+64)))return false;return true;}
function stableLengthBeforeLinkedTail(a,b){if(a.length>b.length)return stableLengthBeforeLinkedTail(b,a);if(b.length!==a.length+64)return false;for(const at of [...trailingLinkedDrawingGroups(a).map(g=>g.at),a.length]){if(!eq(a.subarray(0,at),b.subarray(0,at))||!eq(a.subarray(at),b.subarray(at+64)))continue;const r=readStableLengthRecords(b.subarray(at,at+64));if(r&&at===trailingLinkedDrawingStart(a,r.id))return true;}return false;}
function appendedShapeReferences(a,b){
 if(appendedSeam10(a,b)||appendedPatternSeam(a,b)||appendedButtonhole10(a,b)||appendedButtonhole20(a,b)||(appendedBartack10(a,b)||appendedPerforation10(a,b))||appendedButtonhole40(a,b)||appendedSeam40(a,b))return true;
 if(appendedNotchConversion(a,b))return true;
 if(appendedChamferReferences(a,b))return true;
 if(appendedInteractivePartReferences(a,b))return true;
 if(appendedLineCurveReferences(a,b))return true;
 if(appendedRaster20References(a,b))return true;
 if(b.history.length!==a.history.length+32||!eq(a.history,b.history.subarray(0,a.history.length))||![104,144].includes(b.references.length-a.references.length)||!eq(a.references,b.references.subarray(0,a.references.length)))return false;
 const raw=b.history.subarray(a.history.length),q=v(raw),name=String.fromCharCode(...raw.subarray(12)),ten=name.includes('_c001_'),id=q.getUint16(6,true),index=q.getUint16(4,true),record=b.history.length/32;
 if(q.getUint16(0,true)!==101||q.getUint16(2,true)!==104||q.getUint16(8,true)!==0||q.getUint16(10,true)!==20||!['GraPrg_GK_KR_c001_01','GraPrg_GK_KR_c002_01','GraPrg_GK_RE_c001_01','GraPrg_GK_RE_c002_01','GraPrg_GK_FL_c001_00','GraPrg_GK_QS_c002_01'].includes(name)||id<2001||id>=59997)return false;
 const key='3.'+a.partId+'.3.'+index;if(a.parameters.has(key)||!b.parameters.has(key)||b.parameters.size!==a.parameters.size+1||[...a.parameters].some(([k,p])=>!eq(p,b.parameters.get(k)??empty)))return false;
 const suffix=b.references.subarray(a.references.length);if(suffix.length!==(ten?144:104))return false;const spans=[[0,24,5,101],[24,40,6,1],[64,ten?80:40,ten?7:6,2]];for(const[at,size,type,pick]of spans){const r=v(suffix.subarray(at,at+size));if(r.getUint32(0,true)*8!==size||r.getUint16(4,true)!==0||r.getUint16(6,true)!==1||r.getUint16(8,true)!==type||r.getUint16(10,true)!==record||r.getUint32(12,true)!==pick)return false;}
 if(name==='GraPrg_GK_QS_c002_01'){try{decodeQSPointSelection(suffix.subarray(24,64));decodeQSPointSelection(suffix.subarray(64,104));}catch{return false;}}
 return v(suffix).getUint32(16,true)===id&&v(suffix).getUint32(20,true)===0;
}
function removedPathDeletion(a,b){if(a.length<=b.length||(a.length-b.length)%32||(a.length-b.length)/32>128||!eq(b,a.subarray(0,b.length)))return false;const ids=new Set();for(let at=b.length;at<a.length;at+=32){const raw=a.subarray(at,at+32),q=v(raw),id=q.getUint16(4,true);if(q.getUint16(0,true)!==113||q.getUint16(2,true)!==100||id<2001||id>=60000||![1,2].includes(q.getUint16(6,true))||!raw.subarray(8).every(n=>n===0)||ids.has(id))return false;ids.add(id);}return true;}
function removedCurveMorph(a,b){return a.length===b.length+96&&eq(a.subarray(0,b.length),b)&&!!readOriginalCurveMorphRecords(a.subarray(b.length));}
function removedLineStyles(a,b){if(a.length<=b.length||!eq(b,a.subarray(0,b.length)))return false;const raw=a.subarray(b.length);if(raw.length<32||raw.length%32)return false;const n=v(raw).getUint16(4,true);if(n<1||n>128||raw.length/32!==Math.ceil(Math.max(0,n-6)/7)+1)return false;let i=0;for(let r=0;r<raw.length/32;r++){const row=raw.subarray(r*32,r*32+32),q=v(row),offset=r?4:6,capacity=r?7:6;if(q.getUint16(0,true)!==117+r*100||q.getUint16(2,true)!==103+r*100)return false;let used=offset;for(let j=0;j<capacity&&i<n;j++,i++){const id=q.getUint16(offset+4*j,true),style=q.getUint16(offset+4*j+2,true);if(id<2001||id>=60000||!(nativeLineStates.includes(style)||nativePointMarks.some(s=>s.id===style)))return false;used=offset+4*j+4;}if(!row.subarray(used).every(n=>n===0))return false;}return i===n;}
export function inspectPartLinkImpact(beforeDocument,afterDocument){
 const before=snapshot(beforeDocument),after=snapshot(afterDocument),changed=[];
 const globalChanged=!eq(before.globalX,after.globalX);
 for(const[id,p]of before.parts){const next=after.parts.get(id);if(globalChanged||!next||p.identity!==next.identity||!eq(p.history,next.history)||!eq(p.references,next.references)||p.parameters.size!==next.parameters.size||[...p.parameters].some(([key,value])=>!eq(value,next.parameters.get(key)??empty)))changed.push(id);}
 const affected=new Set(),visiting=new Set(),visited=new Set(),order=[];
 function walk(id){if(visiting.has(id))throw Error('Cyclic part references');if(visited.has(id))return;visiting.add(id);for(const edge of after.edges.filter(e=>e.sourcePartId===id)){affected.add(edge.targetPartId);walk(edge.targetPartId);}visiting.delete(id);visited.add(id);order.unshift(id);}
 for(const id of changed)walk(id);
 const risks=[],curveReferenceEdits=[],definitionEdits=[];
 for(const edge of before.edges){const candidates=after.edges.filter(e=>e.targetPartId===edge.targetPartId&&e.record===edge.record&&e.objectId===edge.objectId);if(candidates.length&&!candidates.some(e=>e.sourcePartId===edge.sourcePartId&&e.sourceObjectId===edge.sourceObjectId))risks.push({partId:edge.targetPartId,reason:'Existing object link would be retargeted',directParts:[edge.targetPartId],sourceObjectIds:[edge.sourceObjectId]});}
 for(const id of changed){
  const previous=before.parts.get(id),next=after.parts.get(id),refs=after.edges.filter(e=>e.sourcePartId===id),curveEdit=next&&!eq(previous.references,next.references)?(knownQqReferenceChange(previous,next)||knownQsNumericReferenceChange(previous,next)||knownQsLine10DirectionChange(previous,next)||knownGrainReferenceChange(previous,next)||knownRaster20RangeChange(previous,next)):null;if(curveEdit)curveReferenceEdits.push(curveEdit);const definitionEdit=next?knownQsLine10ParameterChange(previous,next):null;if(definitionEdit)definitionEdits.push(definitionEdit);if(!refs.length)continue;
  const prefix=next&&next.history.length>=previous.history.length&&eq(previous.history,next.history.subarray(0,previous.history.length)),offsetBeforePoints=next&&(stableOffsetBeforeLinkedTail(previous.history,next.history)||stableLengthBeforeLinkedTail(previous.history,next.history)||stableCutBeforeLinkedTail(previous.history,next.history)||stableSplitBeforeLinkedTail(previous.history,next.history));
  const replacement=next&&appendedCurveReplacement(previous,next),undoReplacementCandidate=next&&appendedCurveReplacement(next,previous),undoReplacement=undoReplacementCandidate&&refs.every(e=>e.sourceObjectId!==undoReplacementCandidate.reserved);
  const undoCircle=next&&appendedShapeReferences(next,previous)&&refs.every(e=>{const raw=previous.history.subarray(-32),id=v(raw).getUint16(6,true),count=(appendedInteractivePartReferences(next,previous)?.mappings.length+1||null)??appendedRaster20References(next,previous)?.count??(['GraPrg_GK_QS_c002_01','GraPrg_GK_QS_c001_02','GraPrg_GK_QQ_c001_04','GraPrg_GK_TO_c004_02','GraPrg_GK_TO_c003_03','GraPrg_GK_TO_c007_00','GraPrg_GK_NA_c001_00','GraPrg_GK_NA_c004_00','GraPrg_GK_SY_c001_01'].includes(String.fromCharCode(...raw.subarray(12)))?1:['GraPrg_GK_NA_c003_00','GraPrg_GK_SY_c007_00'].includes(String.fromCharCode(...raw.subarray(12)))?2:String.fromCharCode(...raw.subarray(12))==='GraPrg_GK_NA_c002_01'?4:String.fromCharCode(...raw.subarray(12)).includes('_FL_')?2:String.fromCharCode(...raw.subarray(12)).includes('_RE_')?4:3);return e.sourceObjectId<id||e.sourceObjectId>=id+count;});
  let reason=null;const conversion=prefix&&next.history.length===previous.history.length+32?(readRaster0Record(next.history.subarray(-32))||readSequenceLineRecord(next.history.subarray(-32))):null;if(conversion?.id===conversion?.sourceId&&conversion&&refs.some(e=>e.sourceObjectId===conversion.id))reason='Conversion would change the class of an object referenced by another part';const joined=prefix&&next.history.length===previous.history.length+32?readOriginalJoinRecord(next.history.subarray(previous.history.length)):null;if(joined&&refs.some(e=>(joined.sourceIds??[joined.firstId,joined.secondId]).some(id=>id!==joined.retainedId&&id===e.sourceObjectId)))reason='Join would remove an object referenced by another part';
  if(!next||previous.identity!==next.identity)reason='Referenced part identity would be removed or replaced';
  else if(next.history.length<previous.history.length){const removed=removedLiteralIds(previous.history,next.history);if(stableSplitBeforeLinkedTail(previous.history,next.history)){const added=trailingLinkedDrawingGroups(previous.history).filter(g=>g.kind==='split'&&!trailingLinkedDrawingGroups(next.history).some(n=>n.kind==='split'&&n.newId===g.newId)).map(g=>g.newId);if(refs.some(e=>added.includes(e.sourceObjectId)))reason='Undo would remove a split object required by linked parts';}if(!reason&&!symbolTypeSuffix(next.history,previous.history)&&!removedLineStyles(previous.history,next.history)&&!removedPathDeletion(previous.history,next.history)&&!undoCircle&&!undoReplacement&&!offsetBeforePoints&&!removedStableOffsets(previous.history,next.history)&&!removedStableLengths(previous.history,next.history)&&!removedStableReflection(previous.history,next.history)&&!removedPointMove(previous.history,next.history)&&!removedPointMirror(previous.history,next.history)&&!removedPointRotate(previous.history,next.history)&&!removedPointTurnMove(previous.history,next.history)&&!removedStableCuts(previous.history,next.history)&&!removedStableJoin(previous.history,next.history)&&!removedDartShortening(previous,next)&&!removedStableConnection(previous.history,next.history)&&!removedCurveMorph(previous.history,next.history)&&(!removed||refs.some(e=>removed.includes(e.sourceObjectId))))reason='Undo would remove construction steps required by linked parts';}
  else if(!prefix&&!offsetBeforePoints&&!sameNativeTransformHintHistory(previous.history,next.history)&&!sameSymbolTypeHistory(previous.history,next.history)&&!numericOnly(previous.history,next.history))reason='Linked construction change cannot prove stable object identities';
  else if(!eq(previous.references,next.references)&&!curveEdit&&!appendedShapeReferences(previous,next)&&!replacement&&!undoReplacement&&!undoCircle)reason='Linked geometric references would change';
  if(next&&(symbolTypeSuffix(previous.history,next.history)||symbolTypeSuffix(next.history,previous.history)||!eq(previous.history,next.history)&&sameSymbolTypeHistory(previous.history,next.history))&&(!eq(previous.references,next.references)||previous.parameters.size!==next.parameters.size||[...previous.parameters].some(([k,p])=>!eq(p,next.parameters.get(k)??empty))))reason='Symbol type change cannot conceal parameter or selector changes';
  if(reason)risks.push({partId:id,reason,sourceObjectIds:[...new Set(refs.map(e=>e.sourceObjectId))],directParts:[...new Set(refs.map(e=>e.targetPartId))]});
 }
 // Unknown TO/112 encodings cannot prove an existing link safe to rewrite.
 const structural=changed.some(id=>{const a=before.parts.get(id),b=after.parts.get(id);return !b||a.identity!==b.identity||!eq(a.references,b.references)||a.history.length>b.history.length&&stableSplitBeforeLinkedTail(a.history,b.history)||!(b.history.length>=a.history.length&&eq(a.history,b.history.subarray(0,a.history.length)))&&!stableOffsetBeforeLinkedTail(a.history,b.history)&&!stableLengthBeforeLinkedTail(a.history,b.history)&&!stableCutBeforeLinkedTail(a.history,b.history)&&!stableSplitBeforeLinkedTail(a.history,b.history)&&!sameNativeTransformHintHistory(a.history,b.history)&&!numericOnly(a.history,b.history);});
 if(structural&&(before.uncertain.length||after.uncertain.length))risks.push({partId:null,reason:'Some inter-part references are not decoded; structural mutation cannot be verified',directParts:[...new Set([...before.uncertain,...after.uncertain].map(e=>e.partId))],sourceObjectIds:[]});
 return{...(curveReferenceEdits.length?{curveReferenceEdits}:{}),...(definitionEdits.length?{definitionEdits}:{}),safe:risks.length===0,changedPartIds:changed,affectedPartIds:[...affected].sort((a,b)=>a-b),recalculationOrder:order,risks,unresolvedReferences:structuredClone([...before.uncertain,...after.uncertain]),fullGeometryValidated:false};
}
export function assertPartLinksPreserved(before,after){
 const impact=inspectPartLinkImpact(before,after);if(!impact.safe){const ids=[...new Set([...impact.affectedPartIds,...impact.risks.flatMap(r=>r.directParts)])].sort((a,b)=>a-b);
  const error=Error(`لم يُطبّق التعديل: قد يزيل عناصر مرتبطة ببارتات أخرى أو يغيّر هويتها. البارتات المتأثرة: ${ids.map(id=>String(id).padStart(3,'0')).join('، ')}. المراجع لم تتغير.`);error.code='LINKED_PART_MUTATION';error.impact=impact;throw error;
 }return impact;
}

