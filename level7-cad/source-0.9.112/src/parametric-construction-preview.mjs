/** Experimental X -> original geometry -> measured Z -> dependent original lines.
 * No native invocation, fixture lookup, source edits or MDL export.
 */
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeZValues} from './native-z-values.js';
import {calculateScalarDefinitions} from './native-alaa-z-scalars.mjs';
import {replayEarlyALAA} from './early-history-replay.mjs';
import {evaluateGeometricZ} from './geometric-z-kernel.mjs';
import {replayCardinalQSLine} from './interactive-line-kernel.mjs';
import {replayLinearHistory} from './linear-history-kernel.mjs';
import {applyStraightCut,applyStraightReflection} from './straight-transform-kernel.mjs';
const ensure=(b,m)=>{if(!b)throw Error(m);};
export async function previewMeasuredZConstruction(doc,options={}){
 const zOverrides=Object.fromEntries(Object.entries(options.zOverrides??{}).map(([key,value])=>{ensure(/^(3[3-9]|4[0-9]|50)$/.test(key)&&typeof value==='string'&&value.length>0&&value.length<=256,'Unsupported Z formula override');return[key,value];}));
 // Replay against a private snapshot so caller mutation cannot change later reads.
 const bytes=serializeMdl(doc),source=parseMdl(bytes),early=await replayEarlyALAA(source,options);
 const definitions=readNativeZValues(source,{partId:2}).entries.map(e=>Object.hasOwn(zOverrides,String(e.index))?{...e,formula:zOverrides[e.index]}:e);
 const measured=definitions.filter(e=>[23,24,28,29].includes(e.index)).map(definition=>evaluateGeometricZ({definition,objects:early.objects,throughRecord:43}));
 ensure(measured.length===4,'Missing experimental geometric definitions');
 const byIndex=new Map(measured.map(e=>[e.index,e]));
 // Substitute measured scalars in a temporary expression context only. Stored
 // definitions and geometric references in the MDL remain byte-identical.
 const evaluated=calculateScalarDefinitions(early.scalarInputs,definitions.map(e=>byIndex.has(e.index)?{index:e.index,recordStep:e.recordStep,formula:String(byIndex.get(e.index).value),referenceCount:0}:e));
 for(const key of Object.keys(zOverrides))ensure(evaluated.find(e=>String(e.index)===key)?.status==='calculated-unverified','Z'+key+' cannot be calculated. Use supported arithmetic and earlier X/Z values.');
 const experimental=new Set(measured.map(e=>'Z'+e.index));
 const values=evaluated.map(e=>{
  const isMeasured=byIndex.has(e.index),dependsOnMeasured=isMeasured||(e.dependencies??[]).some(d=>experimental.has(d));
  if(dependsOnMeasured)experimental.add('Z'+e.index);
  return {...e,formula:definitions.find(d=>d.index===e.index).formula,dependencies:isMeasured?byIndex.get(e.index).dependencies:e.dependencies,dependsOnMeasuredGeometry:dependsOnMeasured,nativeCompatibilityVerified:false};
 });
 const zValues=values.filter(e=>e.status==='calculated-unverified').map(({index,value,recordStep})=>({index,value,recordStep}));
 const block=id=>{const b=source.blocks.find(b=>b.id.join('.')===id);ensure(b,'Missing construction block '+id);return bytes.subarray(b.payloadOffset,b.endOffset);};
 const history=block('3.2.2.0'),references=block('3.2.4.0'),dependentLines=[];
 const at=record=>history.subarray((record-1)*32,record*32);
 const transformed=early.objects.map(o=>({...o,points:o.points.map(p=>p.slice())}));
 const put=o=>{const i=transformed.findIndex(p=>p.id===o.id);if(i<0)transformed.push(o);else transformed[i]=o;};
 for(const record of [45,46])put(applyStraightCut({axisRecord:at(44),targetRecord:at(record),record,objects:transformed}));
 for(const [axisRecordNumber,record]of [[47,48],[49,50],[51,52],[51,53],[57,58],[57,59],[57,60],[57,62],[57,63],[57,65],[57,66],[57,67],[57,68],[57,69],[57,70],[57,71],[57,72]])
  put(applyStraightReflection({axisRecord:at(axisRecordNumber),axisRecordNumber,targetRecord:at(record),record,objects:transformed}));
 // These five QS calls reference the unchanged axis2001 and scalar/measured Z.
 // Intervening curve/reflection records are not required inputs to these calls.
 const axis=early.objects.find(o=>o.id===2001);
 for(const record of [79,80,81,82,83]){
  const h=history.subarray((record-1)*32,record*32),v=new DataView(h.buffer,h.byteOffset,32);
  dependentLines.push(replayCardinalQSLine({historyRecord:h,record,parameters:block('3.2.3.'+v.getUint16(4,true)),references,objects:[axis,...dependentLines],zValues,allowExperimentalSelectors:true}));
 }
 // Additional independent slices consume only the objects already reconstructed
 // here. Skipping a curve record does not mean that curve has been implemented.
 const downstreamObjects=[],allObjects=()=>[...transformed,...dependentLines,...downstreamObjects];
 const interactive=record=>{const h=at(record),v=new DataView(h.buffer,h.byteOffset,32);downstreamObjects.push(replayCardinalQSLine({historyRecord:h,record,parameters:block('3.2.3.'+v.getUint16(4,true)),references,objects:allObjects(),zValues}));};
 const linear=(first,last)=>downstreamObjects.push(...replayLinearHistory({history:history.subarray((first-1)*32,last*32),firstRecord:first,seedObjects:allObjects(),zValues}).created);
 interactive(84);linear(85,91);linear(94,99);linear(103,110);interactive(120);linear(121,127);
 return {sourceSha256:early.sourceSha256,partId:2,sizeKey:early.sizeKey,xOverrides:early.xOverrides,zOverrides,scalarInputs:early.scalarInputs,earlyObjects:early.objects,transformedObjects:transformed,measuredZ:measured,zValues:values,dependentLines,downstreamObjects,objects:allObjects(),
  complete:false,canSaveMdl:false,nativeCompatibilityVerified:false,usesCachedGeometryInputs:false,nativeProgramUsed:false,
  limitations:['Experimental native selectors and numeric precision require differential verification.','Only 49 points/straight objects in explicitly selected dependency slices are calculated.','No intermediate curves, part inheritance or full MDL export is implemented.']};
}
