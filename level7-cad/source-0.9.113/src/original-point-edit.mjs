import {serializeMdl} from './native-mdl.js';
import {readNativeMetadata} from './native-measurements.js';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {readLinkedPointRecords} from './native-linked-point-records.mjs';
import {readLiteralPointRecords} from './native-coordinate-point-records.mjs';
import {constructionPoints} from './construction-polyline-kernel.mjs';
import {replaceOriginalBlocks,commitOriginalDefinition} from './original-geometry-edit.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);};
export function inspectOriginalPointEdits(doc,{partId,sizeKey}={}){
 need(Number.isInteger(partId)&&partId>0&&partId<=999&&sizeKey===readNativeMetadata(doc).referenceSize?.name,'اختر بارتًا ومقاسًا أساسيًا مدعومًا.');
 const model=createPartHistoryCalculation(doc,{sizeKey}).get(partId);need(model.historyFullyExecuted&&!model.emptyHistory,'حساب البارت الأصلي غير مكتمل.');
 need(doc.blocks.filter(b=>b.id[0]===3&&b.id[1]===partId&&b.id[2]===7).length===1,'تحرير النقطة يحتاج مخزن مقاس واحد مدعوم.');
 const rows=doc.blocks.filter(b=>b.id.join('.')===`3.${partId}.2.0`);need(rows.length===1,'تعريف البارت مكرر أو غير موجود.');
 const bytes=serializeMdl(doc),history=bytes.slice(rows[0].payloadOffset,rows[0].endOffset),groups=[];
 // Interactive calls may follow a bound point. Editing its original selector does
 // not insert/reorder history, so inspect exact groups throughout the full history.
 for(let at=0;at<history.length;at+=32)for(const n of[64,96]){if(at+n>history.length)continue;const r=readLinkedPointRecords(history.subarray(at,at+n));if(r){groups.push({at,end:at+n,kind:'point',...r});break;}}
 const points=groups.filter(g=>model.objects.some(o=>o.id===g.id&&o.record===g.end/32)&&model.objects.some(o=>o.id===g.sourceId&&o.record<g.end/32)).map(g=>{
  const p=model.objects.find(o=>o.id===g.id),source=model.objects.find(o=>o.id===g.sourceId);need(p&&!p.hidden&&!p.geometryKind&&p.points.length===1&&source,'مرجع النقطة غير محسوب.');
  const path=constructionPoints(source),length=path.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0);need(Number.isFinite(length)&&length>1e-7,'مصدر النقطة منعدم الطول.');
  return{...g,x:p.points[0][0],y:p.points[0][1],length,value:g.type==='fraction'?g.value*100:g.value};
 });
 const coordinates=[];for(let at=0;at+64<=history.length;at+=32){const p=readLiteralPointRecords(history.subarray(at,at+64));if(p&&model.objects.some(o=>o.id===p.id&&o.record===(at+64)/32&&!o.hidden&&o.points.length===1))coordinates.push({...p,at,end:at+64,type:'coordinates',value:p.x});}
 return{points:[...points,...coordinates]};
}
export function editOriginalCoordinatePoint(doc,{partId,sizeKey,pointId,x,y}={}){
 need(Number.isInteger(pointId)&&[x,y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6),'أدخل إحداثيين عدديين صالحين.');
 const p=inspectOriginalPointEdits(doc,{partId,sizeKey}).points.find(p=>p.id===pointId&&p.type==='coordinates');need(p,'هذه النقطة لا تحمل تعريف إحداثيات أصلية مدعومًا.');
 x=Math.fround(x);y=Math.fround(y);if(x===p.x&&y===p.y)return{document:doc,pointId,unchanged:true};
 const bytes=serializeMdl(doc),key=`3.${partId}.2.0`,row=doc.blocks.find(b=>b.id.join('.')===key),history=bytes.slice(row.payloadOffset,row.endOffset),raw=history.subarray(p.at,p.end),v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);v.setFloat32(24,x,true);v.setFloat32(28,y,true);
 need(readLiteralPointRecords(raw)?.id===pointId,'تغير تعريف النقطة الأصلي.');const next=replaceOriginalBlocks(doc,new Map([[key,history]])),before=createPartHistoryCalculation(doc,{sizeKey}).get(partId),after=createPartHistoryCalculation(next,{sizeKey}).get(partId);need(after.historyFullyExecuted,'تعذر حساب النقطة وعناصرها المرتبطة.');
 for(const o of after.objects){const old=before.objects.find(q=>q.id===o.id);if(!o.geometryKind&&o.points.length===2&&old?.points.length===2)need(Math.hypot(...o.points[1].map((n,i)=>n-o.points[0][i]))>1e-7||Math.hypot(...old.points[1].map((n,i)=>n-old.points[0][i]))<=1e-7,'التعديل يطابق طرفي خط مرتبط.');}
 return{...commitOriginalDefinition(doc,next,{sizeKey,objectId:pointId}),pointId,x,y};
}
export function editOriginalLinkedPoint(doc,{partId,sizeKey,pointId,value}={}){
 need(Number.isInteger(pointId)&&typeof value==='number'&&Number.isFinite(value),'اختر نقطة مرتبطة وأدخل قيمة عددية صحيحة.');
 const cap=inspectOriginalPointEdits(doc,{partId,sizeKey}),p=cap.points.find(p=>p.id===pointId);need(p,'تعريف هذه النقطة غير مدعوم للتحرير؛ لم يُختر بديل.');
 need(value>=0&&(p.type==='fraction'?value<=100:value<=Math.min(1e6,p.length)),'النسبة من 0 إلى 100٪، والمسافة ضمن طول المصدر.');
 const n=Math.fround(p.type==='fraction'?value/100:value);need(n!==Math.fround(p.type==='fraction'?p.value/100:p.value),'لم تتغير قيمة النقطة.');
 const bytes=serializeMdl(doc),row=doc.blocks.find(b=>b.id.join('.')===`3.${partId}.2.0`),history=bytes.slice(row.payloadOffset,row.endOffset),raw=history.subarray(p.at,p.end),v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);v.setFloat32(p.type==='fraction'?28:8,n,true);
 const decoded=readLinkedPointRecords(raw);need(decoded&&decoded.id===pointId&&decoded.sourceId===p.sourceId&&decoded.type===p.type&&decoded.fromEnd===p.fromEnd,'تغير مرجع النقطة؛ لم يُطبّق التعديل.');
 const next=replaceOriginalBlocks(doc,new Map([[`3.${partId}.2.0`,history]])),before=createPartHistoryCalculation(doc,{sizeKey}).get(partId),after=createPartHistoryCalculation(next,{sizeKey}).get(partId);need(after.historyFullyExecuted,'تعذر حساب النقطة والخطوط المرتبطة.');
 for(const o of after.objects){const old=before.objects.find(q=>q.id===o.id);if(!o.geometryKind&&o.points.length===2&&old?.points.length===2){const distance=q=>Math.hypot(q.points[1][0]-q.points[0][0],q.points[1][1]-q.points[0][1]);need(distance(o)>1e-7||distance(old)<=1e-7,'التعديل يطابق طرفي خط مرتبط؛ اختر قيمة أخرى.');}}
 return{...commitOriginalDefinition(doc,next,{sizeKey,objectId:pointId}),pointId,sourceId:p.sourceId,type:p.type,value};
}

