/** Native direct corner: connect two selected straight ends, retaining identities. */
import {serializeMdl} from './native-mdl.js';
import {inspectOriginalCuts,assertNativeCutExtension} from './original-cut-tools.mjs';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {applyConnectedCut} from './straight-transform-kernel.mjs';
import {intersectConstructionPaths} from './construction-intersections.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function inspectOriginalDirectCorners(doc,options={}){const c=inspectOriginalCuts(doc,options);return{...c,paths:c.paths.filter(p=>p.points.length===2&&!p.geometryKind)};}
export function connectOriginalStraightCorner(doc,{partId,sizeKey,firstId,secondId,firstEnd,secondEnd}={}){
 const cap=inspectOriginalDirectCorners(doc,{partId,sizeKey});need(cap.eligible,cap.reason);need(firstId!==secondId&&[firstEnd,secondEnd].every(n=>n===0||n===1),'اختر طرفين من خطين أصليين مختلفين.');const a=cap.paths.find(p=>p.id===firstId),b=cap.paths.find(p=>p.id===secondId);need(a&&b,'الزاوية المباشرة متاحة لخطين مستقيمين أصليين محسوبين.');
 const hits=intersectConstructionPaths(a.points,b.points,{extendA:[0,1],extendB:[0,1]});need(hits.length===1,'يلزم تقاطع واحد واضح؛ لا يمكن وصل خطين متوازيين أو متطابقين.');
 const bytes=serializeMdl(doc),one=k=>{const x=doc.blocks.filter(b=>b.id.join('.')===k);need(x.length===1,'Missing or ambiguous corner block');return bytes.slice(x[0].payloadOffset,x[0].endOffset);},history=one(`3.${partId}.2.0`),header=one(`3.${partId}.1.0`),cache=one(`3.${partId}.7.1`),count=view(cache).getUint32(0,true);
 need(header.length===152&&history.length%32===0&&history.length/32<4095&&view(header).getUint32(20,true)*8===history.length&&view(header).getUint32(8,true)===count*5,'Invalid corner native counts');
 const mode=firstEnd?(secondEnd?6:4):(secondEnd?7:5),raw=new Uint8Array(32),q=view(raw);[105,101,0,firstId,0,secondId,mode,65535,firstId,secondId].forEach((n,i)=>q.setUint16(i*2,n,true));q.setFloat32(20,Math.max(0,firstEnd?hits[0].t:1-hits[0].t),true);
 const model=createPartHistoryCalculation(doc,{sizeKey}).get(partId),changed=applyConnectedCut({historyRecord:raw,record:history.length/32+1,objects:model.objects});for(const o of changed){const prior=model.objects.find(p=>p.id===o.id);assertNativeCutExtension(prior.points,o.points);need(Math.hypot(...o.points[1].map((n,k)=>n-o.points[0][k]))>=.08,'الزاوية ستلغي طول أحد الخطين.');}
 const nextHistory=new Uint8Array(history.length+32);nextHistory.set(history);nextHistory.set(raw,history.length);view(header).setUint32(20,nextHistory.length/8,true);
 const list=one('2.1.0.0'),text=String.fromCharCode(...list),marker=text.indexOf('#TLIST\r\n');need(marker>=0,'Missing corner part list');let at=marker+8,found=0;while(at<text.length&&!text.slice(at).startsWith('#')){const end=text.indexOf('\r\n',at);need(end>=0,'Invalid corner part list');if(Number(text.slice(at+3,at+6))===partId){need(Number(text.slice(at+32,at+37))===history.length/32&&Number(text.slice(at+37,at+41))===count,'Corner list counts differ');list.set(new TextEncoder().encode(String(nextHistory.length/32).padStart(5,' ')),at+32);found++;}at=end+2;}need(found===1,'Ambiguous corner part');
 const next=replaceOriginalBlocks(doc,new Map([[`3.${partId}.2.0`,nextHistory],[`3.${partId}.1.0`,header],['2.1.0.0',list]]));return{...commitOriginalDefinition(doc,next,{sizeKey,objectId:firstId}),sourceIds:[firstId,secondId],firstEnd,secondEnd,record:history.length/32+1};
}
