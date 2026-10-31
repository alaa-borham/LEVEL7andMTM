/** Native endpoint deformation of computed curves. The target remains a path reference. */
import {serializeMdl} from './native-mdl.js';
import {readNativeMetadata} from './native-measurements.js';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {inspectOriginalCuts} from './original-cut-tools.mjs';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
import {replayEndpointMorph} from './endpoint-morph-kernel.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
import {writeOriginalCurveMorphRecords} from './native-curve-morph-records.mjs';
export {writeOriginalCurveMorphRecords} from './native-curve-morph-records.mjs';
export function inspectOriginalCurveMorph(doc,options={}){
 const cap=inspectOriginalCuts(doc,options);if(!cap.eligible)return {...cap,curves:[]};
 const model=createPartHistoryCalculation(doc,{sizeKey:options.sizeKey}).get(options.partId),curves=cap.paths.filter(p=>model.objects.some(o=>o.id===p.id&&o.geometryKind==='sampled-curve'&&o.samplingToleranceMm===.0001&&o.directionPolyline?.family?.startsWith('qq-')));
 return {...cap,curves};
}
export function morphOriginalCurveEndpoint(doc,{partId,sizeKey,objectId,targetId,endpoint,targetEndpoint}={}){
 need(sizeKey===readNativeMetadata(doc).referenceSize?.name,'تحوير المنحنى متاح للمقاس الأساسي فقط.');
 const options={partId,sizeKey},cap=inspectOriginalCurveMorph(doc,options);need(cap.eligible,cap.reason);
 need(cap.curves.some(p=>p.id===objectId)&&cap.paths.some(p=>p.id===targetId),'اختر منحنى أصليًا ومسارًا مرجعيًا ظاهرين من البارت نفسه.');
 const model=createPartHistoryCalculation(doc,{sizeKey}).get(partId),raw=writeOriginalCurveMorphRecords({objectId,targetId,endpoint,targetEndpoint}),bytes=serializeMdl(doc);
 const one=key=>{const rows=doc.blocks.filter(b=>b.id.join('.')===key);need(rows.length===1,'Missing or ambiguous native block');return bytes.slice(rows[0].payloadOffset,rows[0].endOffset);};
 const history=one(`3.${partId}.2.0`),header=one(`3.${partId}.1.0`),cache=one(`3.${partId}.7.1`),count=view(cache).getUint32(0,true);
 need(header.length===152&&history.length%32===0&&history.length/32<=4093&&view(header).getUint32(20,true)*8===history.length&&view(header).getUint32(8,true)===count*5,'Unsupported native history counts');
 const result=replayEndpointMorph({records:[raw.subarray(0,32),raw.subarray(32,64),raw.subarray(64)],record:history.length/32+1,objects:model.objects}),prior=model.objects.find(o=>o.id===objectId);
 need(JSON.stringify(result.points)!==JSON.stringify(prior.directionPolyline?.points??prior.points),'طرف المنحنى في الموضع المرجعي بالفعل.');
 const nextHistory=new Uint8Array(history.length+raw.length);nextHistory.set(history);nextHistory.set(raw,history.length);view(header).setUint32(20,nextHistory.length/8,true);
 const list=one('2.1.0.0'),text=String.fromCharCode(...list),marker=text.indexOf('#TLIST\r\n');need(marker>=0,'Missing native part list');let at=marker+8,found=0;
 while(at<text.length&&!text.slice(at).startsWith('#')){const end=text.indexOf('\r\n',at);need(end>=0,'Invalid part list');if(Number(text.slice(at+3,at+6))===partId){need(Number(text.slice(at+32,at+37))===history.length/32&&Number(text.slice(at+37,at+41))===count,'Native part list counts differ');list.set(new TextEncoder().encode(String(nextHistory.length/32).padStart(5,' ')),at+32);found++;}at=end+2;}
 need(found===1,'Ambiguous native part');const next=replaceOriginalBlocks(doc,new Map([[`3.${partId}.2.0`,nextHistory],[`3.${partId}.1.0`,header],['2.1.0.0',list]]));
 return {...commitOriginalDefinition(doc,next,{sizeKey,objectId}),objectId,targetId,endpoint,targetEndpoint,record:history.length/32+1};
}
