import{serializeMdl}from'./native-mdl.js';import{createPartHistoryCalculation}from'./part-history-engine.mjs';import{assertPartLinksPreserved}from'./part-link-guard.mjs';import{isEmptyNativeLinePart}from'./empty-native-line-part.mjs';
/** An unused scalar can change without moving geometry; retain every cache byte. */
export function commitUnchangedParameters(before,next,{sizeKey}){
 const impact=assertPartLinksPreserved(before,next);if(impact.unresolvedReferences.length)throw Error('بعض روابط البارتات غير مفهومة.');
 const a=createPartHistoryCalculation(before,{sizeKey}),b=createPartHistoryCalculation(next,{sizeKey}),ids=[...new Set(before.blocks.filter(q=>q.id[0]===3).map(q=>q.id[1]))];
 const signature=m=>JSON.stringify(m.objects.map(o=>[o.id,o.geometryKind,o.points,o.directionPolyline,o.nativeAnnotation,o.nativeText,o.nativeManufacturingOutline,o.nativeManufacturingPattern,o.hidden]));
 for(const partId of ids){const x=a.get(partId),y=b.get(partId),empty=isEmptyNativeLinePart(before,{partId,sizeKey});if(!(x.historyFullyExecuted||empty)||!(y.historyFullyExecuted||empty)||signature(x)!==signature(y))throw Error('لم تثبت سلامة المعاملات دون تغيير الهندسة.');}
 const x=serializeMdl(before),y=serializeMdl(next);for(const q of before.blocks.filter(q=>q.id[0]===3&&q.id[2]===7)){const r=next.blocks.find(r=>r.id.join('.')===q.id.join('.'));if(!r||q.payloadSize!==r.payloadSize||!x.subarray(q.payloadOffset,q.endOffset).every((n,i)=>n===y[r.payloadOffset+i]))throw Error('تغير مخزن الهندسة أثناء إضافة معامل غير مستخدم.');}
 return{document:next,changedPartIds:[],recalculationOrder:impact.recalculationOrder,geometryUnchangedVerified:true};
}
