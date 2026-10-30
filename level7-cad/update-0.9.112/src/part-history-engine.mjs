import{shortenVerticalDart,readVerticalDartPair}from'./native-dart-shortening.mjs';
import{replayPerforation10,PERFORATION10_MACRO}from'./native-perforation10.mjs';
import{BARTACK10_MACRO,replayBartack10}from'./native-bartack10.mjs';
import{BUTTONHOLE40_MACRO,replayButtonhole40}from'./native-buttonhole40.mjs';
import{BUTTONHOLE20_MACRO,replayButtonhole20}from'./native-buttonhole20.mjs';
import{BUTTONHOLE10_MACRO,replayButtonhole10}from'./native-buttonhole10.mjs';
import{replaySeam40,SEAM40_MACRO}from'./native-seam40.mjs';
import{replaySeam10}from'./native-seam10.mjs';
import{patternSeamMacro,replayPatternSeam}from'./native-pattern-seam.mjs';
import{readSymbolTypeRecord,replaySymbolType}from'./native-symbol-type.mjs';
import{readNotchConversion,replayNotchConversion}from'./native-notch-conversion.mjs';
import{readPointTurnMoveRecords,replayPointTurnMove}from'./native-point-turnmove-records.mjs';
import{readPointRotateRecords,replayPointRotate}from'./native-point-rotate-records.mjs';
import{readPointMirrorRecords,replayPointMirror}from'./native-point-mirror-records.mjs';
import{readPointMoveRecords,replayPointMove}from'./native-point-move-records.mjs';
import {replayCircularCorner} from './circular-corner-kernel.mjs';
import{readInteractiveInsertedLine,isInteractiveInsertPath}from'./interactive-insert-line-kernel.mjs';
import{replayRaster20}from'./interactive-raster20-kernel.mjs';
import{readSequenceLineRecord,sequenceLinePoints}from'./native-sequence-line-record.mjs';
import{readRaster0Record,raster0Points}from'./native-raster0-record.mjs';
import{readOriginalPerpendicularRecords,perpendicularFromOriginalLine,resolvePerpendicularStart}from'./native-perpendicular-records.mjs';
import{replayCurveReplacement}from'./replace-curve-kernel.mjs';
import{changeConstructionLength}from'./construction-length-kernel.mjs';
import{replayQSLine20}from'./interactive-line20-kernel.mjs';
import{nativeLineStates,nativePointMarks}from'./native-line-attributes.mjs';
import{readCoordinatePointRecords,readLiteralPointRecords}from'./native-coordinate-point-records.mjs';
import{readReferenceLineRecords,readLinkedPointRecords}from'./native-linked-point-records.mjs';
import{evaluatePointPosition}from'./native-point-position.mjs';
import {readInsertedPart} from './insert-part-kernel.mjs';
import{readInteractiveInsertedPoint}from'./interactive-insert-point-kernel.mjs';
import {replayCircle10,replayCircle20,replayRectangle} from './interactive-shapes-kernel.mjs';
import {replayRoundCorner} from './round-corner-kernel.mjs';
import {replayChamferCorner} from './chamfer-corner-kernel.mjs';
import {replayEndpointMorph} from './endpoint-morph-kernel.mjs';
import {replayInPlaceParallel} from './in-place-parallel-kernel.mjs';
import {standardSizeContext} from './standard-size-catalog.js';
import {replayEndpointNotch,replayIntersectionNotch,replayCopiedNotch} from './notch-history-kernel.mjs';
import {replayContourOffset} from './contour-offset-kernel.mjs';
import {replayGrainMarker} from "./grain-history-kernel.mjs";
import {applyParallelPath,constructionPoints} from './parallel-path-kernel.mjs';
import {joinComputedObjects} from './construction-polyline-kernel.mjs';
/** Experimental generic contiguous-prefix replay. Cached geometry is never an input.
 * Stops at the first unsupported operation: returned objects are historical, not
 * a substitute for the final design. No native MDL writer is exposed here. */
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
import {resolveScalarXRows,calculateScalarDefinitions} from './native-alaa-z-scalars.mjs';
import {replayCardinalQSLine} from './interactive-line-kernel.mjs';
import {replayQQCurve} from './multi-anchor-curve-kernel.mjs';
import {replayLinearHistory,pointAtDistance} from './linear-history-kernel.mjs';
import {evaluateGeometricZ} from './geometric-z-kernel.mjs';
import {splitStraightLine,applyStraightCut,applyStraightReflection,applyConnectedCut} from './straight-transform-kernel.mjs';
import {readInheritanceGroup,moveInheritedLine} from './part-inheritance-kernel.mjs';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const clone=objects=>objects.map(o=>({...o,points:o.points.map(p=>[...p]),dependencies:[...(o.dependencies??[])]}));
function runPartPrefix(bytes,doc,{partId,sizeKey,resolveParent}){
 ensure(Number.isInteger(partId)&&doc.blocks.some(b=>b.id[0]===3&&b.id[1]===partId),'Unknown part');
 const block=(family,index,required=true)=>{const b=doc.blocks.filter(b=>b.id.join('.')===`3.${partId}.${family}.${index}`);ensure(b.length<=1,'Ambiguous construction block');ensure(!required||b.length===1,'Missing construction block');return b.length?bytes.subarray(b[0].payloadOffset,b[0].endOffset):null;};
 const history=block(2,0,false),references=block(4,0,false)??new Uint8Array();
 ensure(!history||history.length%32===0&&history.length/32<=4096,'Invalid bounded construction history');
 const count=history?.length/32||0,xt=readNativeXValues(doc,{partId}),definitions=readNativeZValues(doc,{partId}).entries;
 const inputs=[...resolveScalarXRows(xt.localEntries,{sizeKey,sizeContext:standardSizeContext(doc)}),...resolveScalarXRows(xt.globalEntries,{sizeKey,scope:'global',sizeContext:standardSizeContext(doc)})];
 let objects=[],throughRecord=0,linear=null,axis=null,stopped=null,dartAmount=20;const measurements=new Map(),measurementErrors=[],trace=[],sourcePartIds=new Set();
 const at=n=>history.subarray((n-1)*32,n*32);
 const calculate=()=>calculateScalarDefinitions(inputs,definitions.map(d=>measurements.has(d.index)?{...d,formula:String(measurements.get(d.index).value),referenceCount:0}:({...d,referenceCount:d.opaque?1:d.geometricReferences.length})),{allowStoredTrailingDivision:true});
 let scalarRows=calculate();
 const zValues=()=>scalarRows.filter(r=>r.status==='calculated-unverified').map(({index,recordStep,value})=>({index,recordStep,value}));
 const measure=record=>{let changed=false;for(const definition of definitions.filter(d=>d.recordStep===record&&(d.geometricReferences.length||['AB','GL'].includes(d.formula)))){
  try{ensure(!definition.opaque,'Opaque geometric definition');measurements.set(definition.index,evaluateGeometricZ({definition,objects,throughRecord:record-1}));changed=true;}
  catch(e){measurementErrors.push({index:definition.index,recordStep:record,reason:e.message});}
 }if(changed)scalarRows=calculate();};
 const put=o=>{const i=objects.findIndex(p=>p.id===o.id);if(i<0)objects.push(o);else objects[i]=o;};
 for(let record=1;record<=count;record++){
  measure(record);const b=at(record),h=v(b),op=h.getUint16(0,true),sub=h.getUint16(2,true);
  try{
   const turnMove=readPointTurnMoveRecords(history.subarray((record-1)*32,(record+5)*32),record);if(turnMove){ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+5),'Z definition inside Turn+Move');put(replayPointTurnMove(turnMove,objects));linear=null;axis=null;trace.push({record,lastRecord:record+5,operation:'point-turnmove',objectId:turnMove.targetId});record+=5;throughRecord=record;continue;}
   const rotate=readPointRotateRecords(history.subarray((record-1)*32,(record+4)*32),record);if(rotate){ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+4),'Z definition inside point rotation');put(replayPointRotate(rotate,objects));linear=null;axis=null;trace.push({record,lastRecord:record+4,operation:'point-to-point-rotate',objectId:rotate.targetId});record+=4;throughRecord=record;continue;}
   const mirror=readPointMirrorRecords(history.subarray((record-1)*32,(record+3)*32),record);if(mirror){ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+3),'Z definition inside point mirror');put(replayPointMirror(mirror,objects));linear=null;axis=null;trace.push({record,lastRecord:record+3,operation:'point-axis-mirror',objectId:mirror.targetId});record+=3;throughRecord=record;continue;}
   const move=readPointMoveRecords(history.subarray((record-1)*32,(record+3)*32),record);if(move){ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+3),'Z definition inside point move');put(replayPointMove(move,objects));linear=null;axis=null;trace.push({record,lastRecord:record+3,operation:'point-to-point-move',objectId:move.targetId});record+=3;throughRecord=record;continue;}
   const coordinatePoint=readCoordinatePointRecords(history.subarray((record-1)*32,(record+3)*32)),referenceLine=readReferenceLineRecords(history.subarray((record-1)*32,(record+2)*32));
   let linkedPoint=null;for(const n of [64,96]){const p=readLinkedPointRecords(history.subarray((record-1)*32,(record-1)*32+n));if(p){linkedPoint={...p,span:n/32};break;}}
   const literalPoint=readLiteralPointRecords(history.subarray((record-1)*32,(record+1)*32));
   if(literalPoint){
    ensure(!objects.some(o=>o.id===literalPoint.id)&&!definitions.some(d=>d.recordStep===record+1),'Duplicate or interrupted literal point group');
    objects.push({id:literalPoint.id,points:[[literalPoint.x,literalPoint.y]],record:record+1,dependencies:[]});
    linear=null;axis=null;trace.push({record,lastRecord:record+1,operation:'native-literal-point',objectId:literalPoint.id});throughRecord=++record;continue;
   }
   const perpendicular=readOriginalPerpendicularRecords(history.subarray((record-1)*32,(record+1)*32));
   const raster=readRaster0Record(b);const sequenceLine=readSequenceLineRecord(b);if(sequenceLine){ensure(sequenceLine.id===sequenceLine.sourceId||!objects.some(o=>o.id===sequenceLine.id),'Duplicate sequence conversion identity');const source=objects.find(o=>o.id===sequenceLine.sourceId);const convertedPoints=sequenceLinePoints(source);if(sequenceLine.reverse)convertedPoints.reverse();if(sequenceLine.id===sequenceLine.sourceId)objects.splice(objects.indexOf(source),1);objects.push({id:sequenceLine.id,points:convertedPoints,...(source.points.length>2?{geometryKind:'polyline',nativePolylineParity:true}:{}),record,operation:sequenceLine.id===sequenceLine.sourceId?'sequence-to-line-replace':'sequence-to-line-copy',dependencies:sequenceLine.id===sequenceLine.sourceId?[]:[sequenceLine.sourceId]});linear=null;axis=null;trace.push({record,operation:'sequence-to-line-copy',objectId:sequenceLine.id,sourceObjectId:sequenceLine.sourceId});}else if(raster){ensure(raster.id===raster.sourceId||!objects.some(o=>o.id===raster.id),'Duplicate Raster0 identity');const source=objects.find(o=>o.id===raster.sourceId);const convertedPoints=raster0Points(source,raster.reverse,raster.count);if(raster.id===raster.sourceId)objects.splice(objects.indexOf(source),1);objects.push({id:raster.id,points:convertedPoints,geometryKind:'point-sequence',record,operation:raster.id===raster.sourceId?'raster0-replace':'raster0-copy',dependencies:raster.id===raster.sourceId?[]:[raster.sourceId],nativeFlags:66049});linear=null;axis=null;trace.push({record,operation:'raster0-copy',objectId:raster.id,sourceObjectId:raster.sourceId});}else if(perpendicular){ensure(record<count&&!objects.some(o=>o.id===perpendicular.id)&&!definitions.some(d=>d.recordStep===record+1),'Incomplete, duplicate or interrupted perpendicular group');const source=objects.find(o=>o.id===perpendicular.sourceId),points=perpendicularFromOriginalLine(source,resolvePerpendicularStart(perpendicular.start,objects));linear=null;axis=null;objects.push({id:perpendicular.id,points,record:record+1,dependencies:[...new Set([perpendicular.sourceId,...(Array.isArray(perpendicular.start)?[]:[perpendicular.start.pointId??perpendicular.start.lineId])])],operation:'perpendicular-to-line'});trace.push({record,lastRecord:record+1,operation:'perpendicular-to-line',objectId:perpendicular.id,sourceObjectId:perpendicular.sourceId});record++;}
   else if(coordinatePoint||referenceLine||linkedPoint&&objects.some(o=>o.id===linkedPoint.sourceId&&!o.geometryKind&&o.points.length===2)){
    const span=coordinatePoint?4:referenceLine?3:linkedPoint.span,id=(coordinatePoint??referenceLine??linkedPoint).id,lastRecord=record+span-1;
    ensure(lastRecord<=count&&!objects.some(o=>o.id===id),'Incomplete or duplicate native point/line group');ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=lastRecord),'Z definition inside an atomic point/line group');let points,dependencies=[];
    if(coordinatePoint){const resolve=p=>{if(!p.code)return p.value;const name=(p.code<200?'X':'Z')+(p.code<200?p.code:p.code-200),row=p.code<200?inputs.find(x=>x.name===name&&x.status==='resolved-stored-input'):zValues().find(z=>z.index===p.code-200&&z.recordStep<=record);ensure(row&&Number.isFinite(row.value)&&Math.abs(row.value)<=1e6,'Unresolved native coordinate '+name);dependencies.push(name);return Math.fround(row.value);};points=[[resolve(coordinatePoint.x),resolve(coordinatePoint.y)]];
    }else if(referenceLine){const endpoints=[referenceLine.startPointId,referenceLine.endPointId].map(id=>objects.find(o=>o.id===id));ensure(endpoints.every(o=>o&&!o.geometryKind&&o.points.length===1),'Reference line requires two earlier point objects');points=endpoints.map(o=>o.points[0].slice());dependencies=[referenceLine.startPointId,referenceLine.endPointId];
    }else{const line=objects.find(o=>o.id===linkedPoint.sourceId);ensure(line&&!line.geometryKind&&line.points.length===2,'Linked point requires an earlier straight line');const p=evaluatePointPosition({lineId:line.id,type:linkedPoint.type,value:linkedPoint.value,fromEnd:linkedPoint.fromEnd},[{kind:'line',objectId:line.id,a:{x:line.points[0][0],y:line.points[0][1]},b:{x:line.points[1][0],y:line.points[1][1]}}]);points=[[p.x,p.y]];dependencies=[line.id];}
    linear=null;axis=null;objects.push({id,points,record:lastRecord,dependencies});trace.push({record,lastRecord,operation:'native-point-line-group',objectId:id});record=lastRecord;
   }
   else if(op===112&&sub===101){
    linear=null;axis=null;const group=readInheritanceGroup(history,record);
    ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=group.lastRecord),'Z definition inside an atomic inheritance group');
    const parents=new Map();for(const id of group.sourcePartIds){sourcePartIds.add(id);const parent=resolveParent(id);if(!parent.historyFullyExecuted){const error=Error(`Source part ${id} has incomplete history (${parent.throughRecord}/${parent.historyRecords})`);error.dependencyChain=[{partId:id,record:parent.stopped?.record??null,reason:parent.stopped?.reason??parent.error??'Incomplete source history'},...(parent.stopped?.dependencyChain??[])];throw error;}parents.set(id,parent);}
    const inherited=group.mappings.map(m=>{ensure(!objects.some(o=>o.id===m.objectId),'Inherited destination already exists');const o=parents.get(m.sourcePartId).objects.find(o=>o.id===m.sourceObjectId);ensure(o&&(m.objectClass===3&&o.geometryKind==='manufacturing-segments'&&o.nativeManufacturingPattern?.type===101&&o.nativeManufacturingPattern.family==='seam40'&&o.points.length>=4&&o.points.length<=4096&&o.points.length%2===0||m.objectClass===1&&(!o.geometryKind&&o.points.length===1||o.geometryKind==='point-sequence'&&o.points.length>=2&&o.points.length<=401)||m.objectClass===2&&(!o.geometryKind&&o.points.length===2||o.geometryKind==='polyline'&&o.nativePolylineParity===true&&o.points.length>=3&&o.points.length<=401||o.geometryKind==='sampled-curve'&&(o.samplingToleranceMm===.0001||o.samplingToleranceMm===.001&&o.directionPolyline?.family==='chamfer-corner-v1'||o.samplingToleranceMm===.08&&['construction-cut-v1','construction-morph-v1','construction-join-v1','construction-offset-v1','grain-marker-v1','round-corner-v1','circular-corner-v1','construction-length-v1'].includes(o.directionPolyline?.family))&&o.points.length>=3&&o.points.length<=8192)),'Inherited point, line or curve is missing or unsupported');return {id:m.objectId,points:o.points.map(p=>[...p]),record,operation:o.geometryKind==='manufacturing-segments'?'inherit-manufacturing-segments':o.geometryKind==='point-sequence'?'inherit-point-sequence':o.geometryKind==='polyline'?'inherit-polyline':o.geometryKind?'inherit-curve':o.points.length===1?'inherit-point':'inherit-straight-line',...(o.geometryKind==='manufacturing-segments'?{geometryKind:'manufacturing-segments',nativeManufacturingPattern:structuredClone(o.nativeManufacturingPattern),nativeFlags:66051}:o.geometryKind==='point-sequence'?{geometryKind:'point-sequence',nativeFlags:66049}:o.geometryKind==='polyline'?{geometryKind:'polyline',nativePolylineParity:true}:o.geometryKind?{geometryKind:o.geometryKind,samplingToleranceMm:o.samplingToleranceMm,nativePolylineParity:false,...(o.directionPolyline?{directionPolyline:{family:o.directionPolyline.family,points:o.directionPolyline.points.map(p=>[...p])}}:{})}:{}),...(o.nativeManufacturingOutline?{nativeManufacturingOutline:structuredClone(o.nativeManufacturingOutline),nativeFlags:66050}:{}),...(o.nativePerforationOutline?{nativePerforationOutline:structuredClone(o.nativePerforationOutline),nativeFlags:4294640130,nativeDisplayState:251}:{}),...(o.nativeSlitNotch?{nativeSlitNotch:true}:{}),...(o.nativeSymbol?{nativeSymbol:structuredClone(o.nativeSymbol)}:{}),...(m.objectClass===2?{nativeDisplayState:o.nativeDisplayState??1}:{}),sourcePartId:m.sourcePartId,sourceObjectId:m.sourceObjectId,dependencies:[`P${m.sourcePartId}:${m.sourceObjectId}`]};});
    objects.push(...moveInheritedLine(group,inherited,objects));trace.push({record,lastRecord:group.lastRecord,operation:group.turn?'inherit-turned-line':group.move?'inherit-moved-line':'inherit-lines-and-curves',objectIds:inherited.map(o=>o.id),sourcePartIds:group.sourcePartIds});record=group.lastRecord;
   }
   else if(op===197&&sub===100&&h.getUint16(4,true)===1105){ensure(h.getUint16(6,true)===0&&b.subarray(12).every(x=>x===0),'Unsupported dart numeric input');dartAmount=h.getFloat32(8,true);ensure(Number.isFinite(dartAmount)&&Math.abs(dartAmount)<=500,'Invalid dart amount');linear=null;axis=null;trace.push({record,operation:'dart-shortening-amount',value:dartAmount});}
   else if(op===199&&sub===101&&record<count&&v(at(record+1)).getUint16(0,true)===211){ensure(!definitions.some(d=>d.recordStep===record+1),'Z definition inside dart pair');const pair=readVerticalDartPair(b,at(record+1)),made=shortenVerticalDart(objects,pair,dartAmount,record+1);for(const o of made){const index=objects.findIndex(p=>p.id===o.id);objects[index]=o;}linear=null;axis=null;trace.push({record,lastRecord:record+1,operation:'dart-shortening',objectIds:made.map(o=>o.id),amount:dartAmount});record++;}
   else if(op===104&&sub===203){ensure(record<count&&!definitions.some(d=>d.recordStep===record+1),'Incomplete contour offset');const results=replayContourOffset({records:[b,at(record+1)],record,objects});results.forEach(put);linear=null;axis=null;trace.push({record,lastRecord:record+1,operation:'contour-offset',objectIds:results.map(o=>o.id)});record++;}
   else if(op>=102&&op%100===2){
    const result=joinComputedObjects({historyRecord:b,record,objects});linear=null;axis=null;objects=objects.filter(o=>!result.removedIds.includes(o.id));objects.push(result.object);trace.push({record,operation:'join-paths',objectId:result.object.id,sourceObjectIds:result.removedIds});
   }
   else if(op===113&&sub===101){
    const n=h.getUint16(4,true);ensure(n>=1&&n<=13,'Unsupported bounded deletion group');const ids=Array.from({length:n},(_,i)=>h.getUint16(6+i*2,true));ensure(new Set(ids).size===n&&ids.every(id=>{const o=objects.find(o=>o.id===id);return id>=2001&&id<60000&&o&&!o.nativeAnnotation&&o.points.length>=1;}),'Missing or unsupported group deletion object');linear=null;axis=null;objects=objects.filter(o=>!ids.includes(o.id));trace.push({record,operation:'delete-objects',objectIds:ids});
   }
   else if(op>=113&&op%100===13&&sub===100){
    const id=h.getUint16(4,true),objectClass=h.getUint16(6,true),o=objects.find(o=>o.id===id);
    ensure(o&&(objectClass===2&&o.geometryKind!=='point-sequence'&&o.points.length>=2||objectClass===1&&o.points.length===1),'Unsupported deleted object');
    ensure(b.subarray(8).every(x=>x===0),'Unknown deletion field');
    linear=null;axis=null;objects=objects.filter(o=>o.id!==id);trace.push({record,operation:'delete-object',objectId:id});
   }
   else if(op%100===17&&sub===op-14){
    const n=h.getUint16(4,true);ensure(n>=1&&n<=128,'Unsupported state-change group size');ensure(b.subarray(6+Math.min(n,6)*4).every(x=>x===0),"Unknown state-change tail");const changes=[];let row=record,offset=6,capacity=6;
    while(changes.length<n){ensure(row<=count,'Truncated state-change group');const raw=at(row),q=v(raw);ensure(q.getUint16(0,true)===op+(row-record)*100&&q.getUint16(2,true)===sub+(row-record)*100,'Invalid state-change continuation');
     for(let i=0;i<capacity&&changes.length<n;i++){const id=q.getUint16(offset+i*4,true),state=q.getUint16(offset+i*4+2,true),o=objects.find(o=>o.id===id);ensure(o&&(nativeLineStates.includes(state)&&o.points.length>=2||nativePointMarks.some(s=>s.id===state)&&o.points.length===1),'Unsupported state-change entry');changes.push({id,state});}
     row++;offset=4;capacity=7;
    }
    ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<row),'Z definition inside state-change group');
    // Continuation slots beyond the declared count retain stale entries in native files.
    // Only declared entries are applied, in order (the same object may occur twice).
    linear=null;axis=null;for(const {id,state}of changes)put({...objects.find(o=>o.id===id),hidden:false,nativeDisplayState:state,lastDisplayRecord:row-1});trace.push({record,lastRecord:row-1,operation:'object-display-state',changes});record=row-1;
   }
   else if(op===108&&sub===103){const plan=readSymbolTypeRecord(b);ensure(plan,'Unsupported native symbol type record');put(replaySymbolType(plan,objects,record));linear=null;axis=null;trace.push({record,operation:'change-symbol-type',objectId:plan.objectId,type:plan.type});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))===PERFORATION10_MACRO){const made=replayPerforation10({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(...made);linear=null;axis=null;trace.push({record,operation:'perforation10',objectIds:made.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))===SEAM40_MACRO){const o=replaySeam40({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(o);linear=null;axis=null;trace.push({record,operation:'seam40',objectId:o.id});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))===BUTTONHOLE10_MACRO){const made=replayButtonhole10({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(made);linear=null;axis=null;trace.push({record,operation:'buttonhole10',objectId:made.id});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))===BUTTONHOLE20_MACRO){const made=replayButtonhole20({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(made);linear=null;axis=null;trace.push({record,operation:'buttonhole20',objectId:made.id});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))===BARTACK10_MACRO){const made=replayBartack10({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(made);linear=null;axis=null;trace.push({record,operation:'bartack10',objectId:made.id});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))===BUTTONHOLE40_MACRO){const made=replayButtonhole40({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(made);linear=null;axis=null;trace.push({record,operation:'buttonhole40',objectId:made.id});}
   else if(op===101&&sub===104&&[20,30,50].some(f=>patternSeamMacro(f)===String.fromCharCode(...b.subarray(12)))){const made=replayPatternSeam({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(...made);linear=null;axis=null;trace.push({record,operation:'pattern-seam',objectIds:made.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_NA_c001_00'){const o=replaySeam10({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});objects.push(o);linear=null;axis=null;trace.push({record,operation:'seam10',objectId:o.id});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_TO_c007_00'){const plan=readNotchConversion({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references});put(replayNotchConversion(plan,objects));linear=null;axis=null;trace.push({record,operation:'convert-to-slit-notch',objectId:plan.sourceId,reservedId:plan.reservedId});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_KR_c001_01'){const result=replayCircle10({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});linear=null;axis=null;result.forEach(put);trace.push({record,operation:'interactive-circle10',objectIds:result.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_KR_c002_01'){const result=replayCircle20({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});linear=null;axis=null;result.forEach(put);trace.push({record,operation:'interactive-circle20',objectIds:result.map(o=>o.id)});}
   else if(op===101&&sub===104&&['GraPrg_GK_RE_c001_01','GraPrg_GK_RE_c002_01'].includes(String.fromCharCode(...b.subarray(12)))){const result=replayRectangle({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey});linear=null;axis=null;result.forEach(put);trace.push({record,operation:result[0].operation,objectIds:result.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12)).replace(/\0+$/,"")==="GraPrg_GK_FL_c001_00"){const result=replayGrainMarker({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects});linear=null;axis=null;objects.push(...result);trace.push({record,operation:"grain-marker",objectIds:result.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_TO_c004_02'){
    const plan=readInteractiveInsertedPoint({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references});ensure(plan.sourcePartId<partId,'Interactive point must use an earlier part');sourcePartIds.add(plan.sourcePartId);const parent=resolveParent(plan.sourcePartId);ensure(parent.historyFullyExecuted,'Interactive point source history is incomplete');const m=plan.mappings[0],o=parent.objects.find(o=>o.id===m.sourceObjectId);ensure(o&&!o.geometryKind&&o.points.length===1&&!objects.some(o=>o.id===m.objectId),'Missing source point or duplicate insertion identity');linear=null;axis=null;objects.push({id:m.objectId,points:o.points.map(p=>p.slice()),record,operation:'inherit-interactive-point',sourcePartId:plan.sourcePartId,sourceObjectId:m.sourceObjectId,dependencies:[`P${plan.sourcePartId}:${m.sourceObjectId}`]});trace.push({record,operation:'inherit-interactive-point',objectId:m.objectId,sourcePartIds:[plan.sourcePartId]});
   }
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_TO_c003_03'){
    const plan=readInteractiveInsertedLine({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references});ensure(plan.sourcePartId<partId,'Interactive line must use an earlier part');sourcePartIds.add(plan.sourcePartId);const parent=resolveParent(plan.sourcePartId);ensure(parent.historyFullyExecuted,'Interactive line source history is incomplete');const m=plan.mappings[0],o=parent.objects.find(o=>o.id===m.sourceObjectId);ensure(isInteractiveInsertPath(o)&&(plan.sourceGeometry==='curve')===!!o.geometryKind&&!objects.some(o=>o.id===m.objectId),'Missing source line or duplicate insertion identity');linear=null;axis=null;objects.push({...(o.geometryKind?{geometryKind:o.geometryKind,samplingToleranceMm:o.samplingToleranceMm,nativePolylineParity:false,directionPolyline:structuredClone(o.directionPolyline)}:{}),id:m.objectId,points:o.points.map(p=>p.slice()),record,operation:plan.sourceGeometry==='curve'?'inherit-interactive-curve':'inherit-interactive-line',sourcePartId:plan.sourcePartId,sourceObjectId:m.sourceObjectId,dependencies:[`P${plan.sourcePartId}:${m.sourceObjectId}`]});trace.push({record,operation:plan.sourceGeometry==='curve'?'inherit-interactive-curve':'inherit-interactive-line',objectId:m.objectId,sourcePartIds:[plan.sourcePartId]});
   }
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_TO_c006_03'){
    const plan=readInsertedPart({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references});ensure(plan.variant!=='direct'||plan.sourcePartId<partId,'Direct whole-part insertion requires an earlier source');sourcePartIds.add(plan.sourcePartId);const parent=resolveParent(plan.sourcePartId);
    if(!parent.historyFullyExecuted){const error=Error(`Source part ${plan.sourcePartId} has incomplete history (${parent.throughRecord}/${parent.historyRecords})`);error.dependencyChain=[{partId:plan.sourcePartId,record:parent.stopped?.record??null,reason:parent.stopped?.reason??parent.error??'Incomplete source history'},...(parent.stopped?.dependencyChain??[])];throw error;}
    ensure(!objects.some(o=>o.id===plan.reservedId),'Insert-part reserved identity already exists');
    const result=plan.mappings.map(m=>{ensure(!objects.some(o=>o.id===m.objectId),'Inserted destination already exists');const source=parent.objects.find(o=>o.id===m.sourceObjectId);ensure(source&&!source.nativeSlitNotch&&source.points.length>=2&&source.points.length<=8192&&(!source.geometryKind&&source.points.length===2||source.geometryKind==='sampled-curve'&&[.0001,.08].includes(source.samplingToleranceMm)&&source.directionPolyline),'Inserted line or curve is missing or unsupported');const o=structuredClone(source);return {...o,id:m.objectId,record,operation:plan.variant==='direct'?'inherit-interactive-part':'insert-part-geometry',sourcePartId:plan.sourcePartId,sourceObjectId:m.sourceObjectId,dependencies:[`P${plan.sourcePartId}:${m.sourceObjectId}`],lastModifiedRecord:record};});
    linear=null;axis=null;objects.push(...result);trace.push({record,operation:'insert-part-geometry',objectIds:result.map(o=>o.id),sourcePartIds:[plan.sourcePartId]});
   }
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_EK_c004_02'){const changed=replayRoundCorner({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,zValues:zValues(),sizeKey});changed.forEach(put);linear=null;axis=null;trace.push({record,operation:'round-corner',objectIds:changed.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_EK_c042_02'){const changed=replayChamferCorner({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey,xInputs:inputs,zValues:zValues()});changed.forEach(put);linear=null;axis=null;trace.push({record,operation:'chamfer-corner',objectIds:changed.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_EK_c041_02'){const changed=replayCircularCorner({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,sizeKey,xInputs:inputs,zValues:zValues()});changed.forEach(put);linear=null;axis=null;trace.push({record,operation:'circular-corner',objectIds:changed.map(o=>o.id)});}
   else if(op===101&&sub===104&&String.fromCharCode(...b.subarray(12))==='GraPrg_GK_RA_c002_00'){linear=null;axis=null;const made=replayRaster20({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects});objects.push(...made);trace.push({record,operation:'interactive-raster20',objectIds:made.map(o=>o.id)});}
   else if(op===101&&sub===104){linear=null;axis=null;const name=String.fromCharCode(...b.subarray(12)).replace(/\0+$/,'');const replacement=name==='GraPrg_GK_QQ_c002_04',replay=replacement?replayCurveReplacement:name==='GraPrg_GK_QQ_c001_04'?replayQQCurve:name==='GraPrg_GK_QS_c002_01'?replayQSLine20:replayCardinalQSLine;const o=replay({historyRecord:b,record,parameters:block(3,h.getUint16(4,true)),references,objects,zValues:zValues(),xInputs:inputs,allowExperimentalSelectors:true,allowExperimentalAngles:true});if(replacement)objects[objects.findIndex(p=>p.id===o.id)]=o;else objects.push(o);trace.push({record,operation:o.operation,objectId:o.id});}
   else if(op===196&&sub===101&&h.getUint16(4,true)===3&&h.getUint32(16,true)===44){
    ensure(record+2<=count&&!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+2),'Incomplete endpoint deformation or interior Z definition');const result=replayEndpointMorph({records:[b,at(record+1),at(record+2)],record,objects});put(result);linear=null;axis=null;trace.push({record,lastRecord:record+2,operation:result.operation,objectId:result.id});record+=2;
   }
   else if(op%100===96&&h.getUint16(4,true)===3&&h.getUint32(16,true)===34){
    ensure(record+2<=count&&!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+2),'Incomplete endpoint notch boundary');const o=replayEndpointNotch({records:[b,at(record+1),at(record+2)],record,objects});linear=null;axis=null;put(o);trace.push({record,lastRecord:record+2,operation:o.operation,objectId:o.id});record+=2;
   }
   else if(op%100===96&&h.getUint16(4,true)===5&&h.getUint32(16,true)===34){
    ensure(record+2<=count&&!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+2),'Incomplete notch group or interior Z definition');
    const o=replayIntersectionNotch({records:[b,at(record+1),at(record+2)],record,objects});linear=null;axis=null;put(o);trace.push({record,lastRecord:record+2,operation:o.operation,objectId:o.id});record+=2;
   }
   else if(op%100===8&&sub===op-4){const o=replayCopiedNotch({historyRecord:b,record,objects});linear=null;axis=null;put(o);trace.push({record,operation:o.operation,objectId:o.id});}
   else if(op===197&&sub===100&&h.getUint16(4,true)===603&&record+2<=count&&v(at(record+1)).getUint16(4,true)===604){
    const next=at(record+1),q=v(next);ensure(q.getUint16(0,true)===297&&q.getUint16(2,true)===200&&b.every((x,i)=>i<6||x===next[i])&&b.subarray(12).every(x=>x===0)&&!definitions.some(d=>d.recordStep===record+1),'Unverified replaced length input');linear=null;axis=null;trace.push({record,operation:'superseded-length-input',replacedBy:record+1});
   }
   else if(op%100===97&&sub===op-97&&h.getUint16(4,true)===604){
    ensure(record<count,'Missing length-change consumer');const raw=at(record+1),c=v(raw);ensure(c.getUint16(0,true)===op+9&&c.getUint16(2,true)===op+3&&c.getUint16(4,true)===1&&[0,65535].includes(c.getUint16(8,true))&&c.getUint16(10,true)===0&&c.getUint16(12,true)===65535&&raw.subarray(14).every(x=>x===0),'Unsupported length-change consumer');
    ensure(b.subarray(12).every(x=>x===0)&&!definitions.some(d=>d.recordStep===record+1),'Unknown length-change fields');const binding=h.getUint16(6,true),z=binding?zValues().find(z=>z.index===binding-200&&z.recordStep<=record):null;ensure(!binding||binding>200&&z,'Unresolved length-change input');const distance=binding?z.value:h.getFloat32(8,true);ensure(Number.isFinite(distance)&&Math.abs(distance)<=10000,'Invalid length change');
    const id=c.getUint16(6,true),o=objects.find(o=>o.id===id);ensure(o,'Missing length-change geometry');if(o.geometryKind){const result=changeConstructionLength(o,distance,c.getUint16(8,true)===0,record+1,z?['Z'+z.index]:[]);put(result);linear=null;axis=null;trace.push({record,lastRecord:record+1,operation:result.operation,objectId:id});record++;throughRecord=record;continue;}ensure(o.points.length===2,'Unsupported length-change geometry');const length=Math.hypot(...o.points[1].map((x,k)=>x-o.points[0][k]));ensure(length+distance>1e-7,'Collapsed length-change result');
    const end=c.getUint16(8,true)===65535,operation=end?'extend-line-end':'extend-line-start',points=end?[o.points[0].slice(),pointAtDistance(o.points,length+distance,true)]:[pointAtDistance(o.points,-distance,true),o.points[1].slice()];put({...o,points,lastModifiedRecord:record+1,operation,dependencies:[...(o.dependencies??[]),...(z?['Z'+z.index]:[])]});linear=null;axis=null;trace.push({record,lastRecord:record+1,operation,objectId:id});record++;
   }
   else if(op===197&&sub===100&&h.getUint16(4,true)===401&&record<count&&v(at(record+1)).getUint16(0,true)===104&&objects.find(o=>o.id===v(at(record+1)).getUint16(6,true))?.geometryKind){
    const raw=at(record+1),c=v(raw);ensure([204,304,404].includes(c.getUint16(2,true))&&c.getUint16(4,true)===0&&c.getUint16(8,true)===65535&&raw.subarray(20).every(x=>x===0),'Unsupported curve-parallel consumer');ensure(b.subarray(12).every(x=>x===0)&&!definitions.some(d=>d.recordStep===record+1),'Unknown curve-parallel input');
    const binding=h.getUint16(6,true),z=binding?zValues().find(z=>z.index===binding-200&&z.recordStep<=record):null;ensure(!binding||binding>200&&z,'Unresolved curve-parallel parameter');const value=binding?z.value:h.getFloat32(8,true),id=c.getUint16(10,true),source=objects.find(o=>o.id===c.getUint16(6,true));ensure(!objects.some(o=>o.id===id),'Duplicate curve parallel');
    const results=[applyParallelPath({source,id,record:record+1,start:value,end:value,side:c.getFloat32(16,true),dependencies:z?['Z'+z.index]:[]})];let last=record+1,sub=c.getUint16(2,true);
    while(last<count&&v(at(last+1)).getUint16(0,true)===104){const raw=at(last+1),next=v(raw);ensure([sub,sub+100].includes(next.getUint16(2,true))&&next.getUint16(4,true)===0&&next.getUint16(8,true)===65535&&raw.subarray(20).every(x=>x===0),'Unsupported continued curve parallel');ensure(!definitions.some(d=>d.recordStep===last+1),'Z inside parallel group');const targetId=next.getUint16(10,true);ensure(!objects.some(o=>o.id===targetId)&&!results.some(o=>o.id===targetId),'Duplicate continued parallel');const operand=[...objects,...results].find(o=>o.id===next.getUint16(6,true));results.push(applyParallelPath({source:operand,id:targetId,record:last+1,start:value,end:value,side:next.getFloat32(16,true),dependencies:z?['Z'+z.index]:[]}));last++;sub=next.getUint16(2,true);}
    results.forEach(put);linear=null;axis=null;trace.push({record,lastRecord:last,operation:'parallel-path',objectIds:results.map(o=>o.id)});record=last;
   }
   else if(op===197&&sub===100&&h.getUint16(4,true)===401&&h.getUint16(6,true)===0&&record+3<=count&&v(at(record+1)).getUint16(4,true)===402){
    const first=v(at(record+1)),second=v(at(record+2)),consumer=v(at(record+3));ensure(first.getUint16(0,true)===297&&first.getUint16(2,true)===200&&second.getUint16(0,true)===397&&second.getUint16(2,true)===300&&second.getUint16(4,true)===403&&consumer.getUint16(0,true)===104&&consumer.getUint16(2,true)===406&&Number.isFinite(h.getFloat32(8,true))&&b.subarray(12).every(x=>x===0),'Unsupported superseded parallel input');ensure(!linear||record>1&&v(at(record-1)).getUint16(0,true)%100===94,'Superseded parallel inside selection');linear=null;axis=null;trace.push({record,operation:'superseded-parallel-input',replacedBy:record+1});
   }
   else if(op===197&&sub===100&&h.getUint16(4,true)===402&&record+2<=count&&v(at(record+2)).getUint16(0,true)===197&&v(at(record+2)).getUint16(4,true)===402){
    const second=at(record+1),q=v(second),restart=v(at(record+2));ensure(q.getUint16(0,true)===297&&q.getUint16(2,true)===200&&q.getUint16(4,true)===403&&restart.getUint16(2,true)===100,'Unsupported superseded endpoint input');ensure([b,second].every(raw=>raw.subarray(12).every(n=>n===0)&&Number.isFinite(v(raw).getFloat32(8,true))),'Unknown superseded endpoint fields');ensure(!linear&&!definitions.some(d=>d.recordStep===record+1),'Superseded pair inside construction boundary');trace.push({record,lastRecord:record+1,operation:'superseded-endpoint-pair',replacedBy:record+2});linear=null;axis=null;record++;
   }
   else if(op===197&&sub===100&&h.getUint16(4,true)===402&&record+2<=count&&v(at(record+2)).getUint16(0,true)===104&&v(at(record+2)).getUint16(2,true)===206&&v(at(record+2)).getUint16(6,true)===v(at(record+2)).getUint16(10,true)){
    let last=record+2,sub=206;while(last<count&&v(at(last+1)).getUint16(0,true)===297&&v(at(last+1)).getUint16(4,true)===403){ensure(last+2<=count&&last-record<18&&v(at(last+1)).getUint16(2,true)===sub+94&&v(at(last+2)).getUint16(0,true)===104&&v(at(last+2)).getUint16(2,true)===sub+200,'Invalid continued in-place parallel');last+=2;sub+=200;}
    ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=last),'Z definition inside in-place parallel group');const result=replayInPlaceParallel({records:Array.from({length:last-record+1},(_,i)=>at(record+i)),record,objects,zValues:zValues()});result.forEach(put);linear=null;axis=null;trace.push({record,lastRecord:last,operation:'in-place-endpoint-parallel',objectIds:result.map(o=>o.id)});record=last;
   }
   else if(op%100===97&&h.getUint16(4,true)===402){
    ensure(record+2<=count,'Missing paired parallel consumer');const second=at(record+1),consumer=at(record+2),w=v(second),c=v(consumer);
    const repeated=op===197&&w.getUint16(0,true)===197&&w.getUint16(2,true)===100;
    ensure(sub===op-97&&(repeated||w.getUint16(0,true)===op+100&&w.getUint16(2,true)===sub+100)&&w.getUint16(4,true)===403,'Unsupported paired parallel inputs');
    const cop=c.getUint16(0,true),compact=cop===104;ensure((repeated?compact&&c.getUint16(2,true)===206:compact?c.getUint16(2,true)===sub+206:cop===op+107&&c.getUint16(2,true)===cop+2)&&c.getUint16(4,true)===0&&c.getUint16(8,true)===65535,'Unsupported paired parallel consumer');
    ensure((compact?Number.isFinite(c.getFloat32(12,true)):consumer.subarray(12,16).every(x=>x===0))&&consumer.subarray(20).every(x=>x===0),'Unknown paired parallel fields');
    ensure(!definitions.some(d=>d.recordStep>record&&d.recordStep<=record+2),'Z definition inside parallel group');
    const readInput=(raw,number)=>{const q=v(raw),binding=q.getUint16(6,true);ensure(raw.subarray(12).every(x=>x===0),'Unknown parallel numeric fields');if(!binding){const value=q.getFloat32(8,true);ensure(Number.isFinite(value),'Invalid parallel input');return {value,dependencies:[]};}const z=zValues().find(z=>z.index===binding-200&&z.recordStep<=number);ensure(binding>200&&z,'Unresolved parallel parameter');return {value:z.value,dependencies:['Z'+z.index]};};
    const start=readInput(b,record),end=readInput(second,record+1),id=c.getUint16(10,true),source=objects.find(o=>o.id===c.getUint16(6,true));ensure(source&&!objects.some(o=>o.id===id),'Missing/duplicate parallel object');
    // 0.9.112: on a sampled curve GRAFIS applies the first (start) input at the end
    // of the source path; verified on ALAA2026.mdl part 7 (9/11 and 10/12 mm
    // tapered allowances). Straight sources keep the previous mapping.
    const swap=compact||(!compact&&start.value!==end.value&&constructionPoints(source).length>2);
    const result=applyParallelPath({source,id,record:record+2,start:swap?end.value:start.value,end:swap?start.value:end.value,side:c.getFloat32(16,true),dependencies:[...new Set([...start.dependencies,...end.dependencies])]});
    linear=null;axis=null;put(result);trace.push({record,lastRecord:record+2,operation:'parallel-path',objectId:id});record+=2;
   }
   else if(op===197&&sub===100&&h.getUint16(4,true)===603){
    ensure(record<count,'Missing absolute-length consumer');const next=at(record+1),nv=v(next);
    ensure(nv.getUint16(0,true)===206&&nv.getUint16(2,true)===200&&nv.getUint16(4,true)===1&&nv.getUint16(8,true)===65535,'Unsupported absolute-length mode');
    for(let i=12;i<32;i++)ensure(b[i]===0,'Unknown absolute-length input field');for(let i=10;i<32;i++)ensure(next[i]===0,'Unknown absolute-length target field');
    ensure(!definitions.some(d=>d.recordStep===record+1),'Z definition inside absolute-length group');
    const index=h.getUint16(6,true)-200,z=zValues().find(z=>z.index===index);ensure(index>0&&z&&z.recordStep<=record&&z.value>0,'Unresolved absolute line length');
    const id=nv.getUint16(6,true),o=objects.find(o=>o.id===id);ensure(o&&!o.geometryKind&&o.points.length===2,'Unsupported absolute-length geometry');
    const points=[[...o.points[0]],pointAtDistance(o.points,z.value,true)];
    linear=null;axis=null;put({...o,points,lastModifiedRecord:record+1,operation:'absolute-line-length',dependencies:[...(o.dependencies??[]),'Z'+index]});trace.push({record,lastRecord:record+1,operation:'absolute-line-length',objectId:id});record++;
   }
   else if(op===197&&sub===100&&h.getUint16(4,true)===9404&&!(record+2<=count&&v(at(record+1)).getUint16(0,true)===196&&v(at(record+1)).getUint16(4,true)===2&&v(at(record+2)).getUint16(0,true)===294&&v(at(record+2)).getUint16(4,true)===14&&v(at(record+2)).getUint16(6,true)===10)){
    // A pending input can be ignored only when the next record replaces the
    // same value and selector byte-for-byte before any consumer runs.
    ensure(record<count,'Unterminated pending input');const next=at(record+1),nv=v(next);
    ensure(nv.getUint16(4,true)===9604&&b.every((n,i)=>i===4||i===5||n===next[i]),'Unverified pending numeric input');
    ensure(!linear,'Pending numeric input inside an active selection');trace.push({record,operation:'superseded-input',replacedBy:record+1});axis=null;
   }
   else if(op%100===19&&sub===228&&h.getUint16(6,true)===0){
    ensure(record<count&&!definitions.some(d=>d.recordStep===record+1),'Unterminated reflection-axis selection');const next=v(at(record+1));ensure(next.getUint16(0,true)===op&&next.getUint16(2,true)===128&&next.getUint16(6,true)===0&&objects.some(o=>o.id===h.getUint16(4,true))&&objects.some(o=>o.id===next.getUint16(4,true)),'Reflection-axis selection is not superseded');ensure(Number.isFinite(h.getFloat32(28,true))&&h.getFloat32(28,true)>=0&&h.getFloat32(28,true)<=1,'Invalid superseded axis fraction');linear=null;axis=null;trace.push({record,operation:'superseded-reflection-axis',replacedBy:record+1});
   }
   else if(op>=103&&op%100===3&&sub===op+2){linear=null;ensure(op===103||axis?.kind==='cut','Missing contiguous cut group');for(let i=8;i<32;i++)ensure(b[i]===0,'Unknown cut axis fields');ensure(h.getUint16(4,true)===0,'Unknown cut axis mode');ensure(objects.some(o=>o.id===h.getUint16(6,true)),'Missing cut axis');const normalized=b.slice();v(normalized).setUint16(0,103,true);v(normalized).setUint16(2,105,true);axis={kind:'cut',record,bytes:normalized};trace.push({record,operation:'cut-axis'});}
   else if(op>=203&&op%100===3&&sub===op+15){ensure(axis?.kind==="cut","Missing split axis");const results=splitStraightLine({axisRecord:axis.bytes,targetRecord:b,record,objects});linear=null;results.forEach(put);trace.push({record,operation:"split-straight-line",objectIds:results.map(o=>o.id)});}
   else if(op>=203&&op%100===3){linear=null;ensure(axis?.kind==='cut','Missing contiguous cut axis');const o=applyStraightCut({axisRecord:axis.bytes,targetRecord:b,record,objects});put(o);trace.push({record,operation:o.operation,objectId:o.id});}
   else if(op%100===19&&sub===128){linear=null;ensure(h.getUint16(6,true)===0,'Unknown reflection axis');axis={kind:'reflection',record,bytes:b};trace.push({record,operation:'reflection-axis'});}
   else if(op>=219&&op%100===19&&[140,240].includes(sub)){linear=null;ensure(axis?.kind==='reflection','Missing contiguous reflection axis');const o=applyStraightReflection({axisRecord:axis.bytes,axisRecordNumber:axis.record,targetRecord:b,record,objects});put(o);trace.push({record,operation:o.operation,objectId:o.id});}
   else if(op>=105&&op%100===5){const changed=applyConnectedCut({historyRecord:b,record,objects});linear=null;axis=null;changed.forEach(put);trace.push({record,operation:'connected-cut',objectIds:changed.map(o=>o.id)});}
   else if([94,96,97].includes(op%100)||op===104){
    axis=null;if(!linear)linear={first:record,seed:clone(objects),traceStart:trace.length};
    const r=replayLinearHistory({history:history.subarray((linear.first-1)*32,record*32),firstRecord:linear.first,seedObjects:linear.seed,zValues:zValues()});
    objects=[...clone(linear.seed),...r.created];trace.splice(linear.traceStart,trace.length-linear.traceStart,...r.trace);
   }else throw Error(`Unsupported history operation ${op}/${sub}`);
   throughRecord=record;
  }catch(e){stopped={record,operation:op,subOperation:sub,reason:e.message,...(e.dependencyChain?{dependencyChain:e.dependencyChain}:{})};break;}
 }
 if(throughRecord===count&&count)measure(count+1);
 const geometricDependents=new Set([...measurements.keys()].map(i=>'Z'+i));
 const measuredRows=scalarRows.map(r=>{const dependsOnMeasuredGeometry=measurements.has(r.index)||(r.dependencies??[]).some(d=>geometricDependents.has(d));if(dependsOnMeasuredGeometry)geometricDependents.add('Z'+r.index);return {...r,formula:definitions.find(d=>d.index===r.index).formula,availableAtReachedBoundary:r.recordStep<=throughRecord+1,measuredGeometry:measurements.has(r.index),dependsOnMeasuredGeometry};});
 return {partId,sizeKey,historyRecords:count,throughRecord,historyFullyExecuted:count>0&&throughRecord===count,complete:false,canSaveMdl:false,nativeCompatibilityVerified:false,usesCachedGeometryInputs:false,geometryRole:'historical-prefix-only',objects:clone(objects),scalarRows:measuredRows,measurements:[...measurements.values()],measurementErrors,trace,stopped,emptyHistory:count===0,sourcePartIds:[...sourcePartIds]};
}
/** A private immutable document snapshot and a memoized dependency traversal.
 * Returned copies cannot inject geometry into the parent cache. */
export function createPartHistoryCalculation(document,{sizeKey}={}){
 const bytes=serializeMdl(document),doc=parseMdl(bytes),results=new Map(),active=[];
 const partIds=[...new Set(doc.blocks.filter(b=>b.id[0]===3).map(b=>b.id[1]))].sort((a,b)=>a-b);
 const resolve=partId=>{
  ensure(partIds.includes(partId),'Unknown source part '+partId);
  if(active.includes(partId)){const error=Error('Cyclic part inheritance: '+[...active,partId].join(' → '));error.dependencyChain=[...active,partId].map(id=>({partId:id,reason:'Cyclic inheritance'}));throw error;}
  ensure(active.length<128,'Part inheritance depth limit');if(results.has(partId))return results.get(partId);
  active.push(partId);try{const result=runPartPrefix(bytes,doc,{partId,sizeKey,resolveParent:resolve});results.set(partId,result);return result;}finally{active.pop();}
 };
 return {get(partId){return structuredClone(resolve(partId));},all(){return {sizeKey,complete:false,canSaveMdl:false,usesCachedGeometryInputs:false,parts:partIds.map(partId=>{try{return structuredClone(resolve(partId));}catch(e){return{partId,complete:false,canSaveMdl:false,objects:[],error:e.message};}})};}};
}
export function replayPartPrefix(document,{partId,sizeKey}={}){return createPartHistoryCalculation(document,{sizeKey}).get(partId);}
export function replayAllPartPrefixes(document,{sizeKey}={}){
 return createPartHistoryCalculation(document,{sizeKey}).all();
}




