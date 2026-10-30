/** Measured native assistant closure: four already-connected straight sides.
 * Keeps every path identity and adds original endpoint-reference records.
 * Does not infer missing edges, cross gaps or assign production attributes. */
import {serializeMdl} from './native-mdl.js';
import {inspectOriginalCuts} from './original-cut-tools.mjs';
import {replaceOriginalBlocks} from './original-geometry-edit.mjs';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {assertPartLinksPreserved} from './part-link-guard.mjs';
import {intersectConstructionPaths} from './construction-intersections.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const same=(a,b)=>Math.hypot(...a.map((n,k)=>n-b[k]))<.0001;
export function findOriginalAssistantContour(doc,{partId,sizeKey,objectId}={}){
 const cap=inspectOriginalCuts(doc,{partId,sizeKey});need(cap.eligible,cap.reason);
 const seed=cap.paths.find(p=>p.id===objectId);need(seed,'اختر أحد حدود المحيط الأصلي.');
 need(cap.paths.length<=4096,'عدد المسارات يتجاوز نطاق فحص المحيط.');
 const paths=[seed],unused=cap.paths.filter(p=>p!==seed);
 for(let i=0;i<paths.length;i++)for(let j=unused.length-1;j>=0;j--)if([paths[i].points[0],paths[i].points.at(-1)].some(a=>[unused[j].points[0],unused[j].points.at(-1)].some(b=>same(a,b))))paths.push(unused.splice(j,1)[0]);
 need(paths.length===4&&paths.every(p=>p.points.length===2&&!p.geometryKind&&p.lineState===1),'هذه المرحلة تدعم أربعة حدود مستقيمة متصلة فقط.');
 const chain=[{id:seed.id,reverse:false,points:seed.points}],left=paths.filter(p=>p!==seed);
 while(left.length){const end=chain.at(-1).points.at(-1),hits=[];for(const p of left)for(const reverse of [false,true])if(same(end,p.points[reverse?1:0]))hits.push({id:p.id,reverse,points:reverse?[...p.points].reverse():p.points});need(hits.length===1,'المحيط مفتوح أو متفرع؛ لم تتغير الحدود.');chain.push(hits[0]);left.splice(left.findIndex(p=>p.id===hits[0].id),1);}
 need(same(chain.at(-1).points.at(-1),chain[0].points[0]),'المحيط غير مغلق.');
 need(chain.every(p=>!p.reverse),'اتجاهات الحدود المختلطة تحتاج اختبار جرافس إضافيًا.');
 const corners=chain.map(p=>p.points[0]),area=corners.reduce((s,p,i)=>{const q=corners[(i+1)%4];return s+p[0]*q[1]-p[1]*q[0];},0)/2;
 need(Math.abs(area)>.0001,'المحيط منعدم المساحة.');
 for(const [a,b]of [[0,2],[1,3]])need(!intersectConstructionPaths(chain[a].points,chain[b].points).length,'المحيط يتقاطع مع نفسه.');
 return {partId,sizeKey,chain,area:Math.abs(area),sourceIds:chain.map(p=>p.id)};
}
export function closeOriginalAssistantContour(doc,options={}){
 const plan=findOriginalAssistantContour(doc,options),{partId,sizeKey}=options,bytes=serializeMdl(doc);
 const one=k=>{const b=doc.blocks.filter(b=>b.id.join('.')===k);need(b.length===1,'Missing or ambiguous contour block');return bytes.slice(b[0].payloadOffset,b[0].endOffset);};
 const history=one(`3.${partId}.2.0`),header=one(`3.${partId}.1.0`),cache=one(`3.${partId}.7.1`),count=view(cache).getUint32(0,true);
 need(header.length===152&&history.length%32===0&&history.length/32<=4092&&view(header).getUint32(20,true)*8===history.length&&view(header).getUint32(8,true)===count*5,'Unsupported native contour counts');
 const nextHistory=new Uint8Array(history.length+128);nextHistory.set(history);
 // Native auto search records start with the corner preceding the picked side.
 for(let i=0;i<4;i++){const a=plan.chain[(i+3)%4],b=plan.chain[i],raw=nextHistory.subarray(history.length+i*32,history.length+(i+1)*32),q=view(raw),endA=a.reverse?0:1,endB=b.reverse?1:0,mode=endA?(endB?6:4):(endB?7:5);[105+i*100,101+i*100,0,a.id,0,b.id,mode,0,a.id,b.id].forEach((n,k)=>q.setUint16(k*2,n,true));q.setFloat32(20,1,true);}
 view(header).setUint32(20,nextHistory.length/8,true);
 const list=one('2.1.0.0'),text=String.fromCharCode(...list),marker=text.indexOf('#TLIST\r\n');need(marker>=0,'Missing contour part list');let at=marker+8,found=0;
 while(at<text.length&&!text.slice(at).startsWith('#')){const end=text.indexOf('\r\n',at);need(end>=0,'Invalid contour part list');if(Number(text.slice(at+3,at+6))===partId){need(Number(text.slice(at+32,at+37))===history.length/32&&Number(text.slice(at+37,at+41))===count,'Contour list counts differ');list.set(new TextEncoder().encode(String(nextHistory.length/32).padStart(5,' ')),at+32);found++;}at=end+2;}
 need(found===1,'Ambiguous contour part identity');
 const next=replaceOriginalBlocks(doc,new Map([[`3.${partId}.2.0`,nextHistory],[`3.${partId}.1.0`,header],['2.1.0.0',list]]));
 const impact=assertPartLinksPreserved(doc,next);need(!impact.unresolvedReferences.length,'روابط البارتات غير مكتملة؛ لم يطبق غلق المحيط.');
 const before=createPartHistoryCalculation(doc,{sizeKey}),after=createPartHistoryCalculation(next,{sizeKey});
 const geometry=p=>p.objects.map(o=>[o.id,o.points,o.geometryKind,o.hidden,o.nativeDisplayState,o.nativeAnnotation]);
 for(const id of impact.recalculationOrder){const a=before.get(id),b=after.get(id);need(a.historyFullyExecuted&&b.historyFullyExecuted&&JSON.stringify(geometry(a))===JSON.stringify(geometry(b)),'غلق الحدود المتصلة غيّر هندسة بارت؛ لم يطبق التعديل.');}
 return {document:next,...plan,record:history.length/32+1,recalculationOrder:impact.recalculationOrder,geometryChangedPartIds:[],fullIndependentGeometry:false};
}
