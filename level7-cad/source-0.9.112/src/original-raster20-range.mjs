import{serializeMdl}from'./native-mdl.js';import{readNativeMetadata}from'./native-measurements.js';import{createPartHistoryCalculation}from'./part-history-engine.mjs';import{replaceOriginalBlocks,commitOriginalDefinition}from'./original-geometry-edit.mjs';import{raster20Rows}from'./interactive-raster20-kernel.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
/** Change original selectors, never append a replacement distribution or IDs. */
export function editOriginalRaster20Range(doc,{partId,sizeKey,objectId,start,end}={}){
 need(sizeKey===readNativeMetadata(doc).referenceSize?.name,'اختر المقاس الأساسي.');
 const model=createPartHistoryCalculation(doc,{sizeKey}).get(partId),point=model.objects.find(o=>o.id===objectId),r=point?.raster20Construction;
 need(model.historyFullyExecuted&&point?.operation==='interactive-raster20-point'&&r,'اختر نقطة Raster 20 أصلية.');
 need(start!==undefined||end!==undefined,'حدد بداية التوزيع أو نهايته.');
 for(const n of[start,end].filter(n=>n!==undefined))need(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1,'اختر موضعًا على الخط المرجعي بين بدايته ونهايته.');
 const bytes=serializeMdl(doc),key=`3.${partId}.4.0`,blocks=doc.blocks.filter(b=>b.id.join('.')===key);need(blocks.length===1,'Ambiguous native Raster references');
 const references=bytes.slice(blocks[0].payloadOffset,blocks[0].endOffset);let writes=0;
 for(const row of raster20Rows(references)){const q=v(row),kind=q.getUint32(12,true);if(q.getUint16(6,true)!==1||q.getUint16(10,true)!==point.record||q.getUint16(8,true)!==6||![2,3].includes(kind))continue;
  need(row.length===40&&q.getUint16(16,true)===2&&q.getUint16(18,true)===512&&q.getUint32(24,true)===r.sourceId,'Unsupported Raster selector');const n=kind===2?start:end;
  if(n!==undefined&&q.getFloat32(28,true)!==Math.fround(n)){q.setFloat32(28,n,true);writes++;}
 }
 if(!writes)return{document:doc,objectId,changedPartIds:[],unchanged:true};
 return commitOriginalDefinition(doc,replaceOriginalBlocks(doc,new Map([[key,references]])),{sizeKey,objectId:r.firstId});
}
