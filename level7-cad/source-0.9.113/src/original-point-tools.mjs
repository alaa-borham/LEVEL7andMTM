/** Existing native source-selector point authoring, never detached XY picks. */
import{inspectOriginalPaths}from'./original-geometry-edit.mjs';
import{appendOriginalLinkedPoint}from'./original-linked-point.mjs';
import{readNativeMetadata}from'./native-measurements.js';
import{createPartHistoryCalculation}from'./part-history-engine.mjs';
import{constructionPoints}from'./construction-polyline-kernel.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
export function inspectOriginalPointTools(document,{partId,sizeKey}={}){
 need(Number.isInteger(partId)&&partId>0,'اختر بارتًا صحيحًا.');need(typeof sizeKey==='string'&&sizeKey===readNativeMetadata(document).referenceSize?.name,'إنشاء النقطة مرتبط بالمقاس الأساسي المحسوب فقط.');
 const cap=inspectOriginalPaths(document,{partId,sizeKey});if(!cap.eligible)return cap;
 const visible=createPartHistoryCalculation(document,{sizeKey}).get(partId).objects.filter(o=>!o.hidden),paths=[];
 for(const p of cap.paths){const o=visible.find(o=>o.id===p.id);if(!o)continue;try{paths.push({...p,points:constructionPoints(o).map(q=>q.slice())});}catch{}}
 const points=visible.filter(o=>!o.geometryKind&&o.points.length===1&&o.id>=2001&&o.id<60000).map(o=>({objectId:o.id,x:o.points[0][0],y:o.points[0][1]}));
 return{...cap,paths,points,lineEligible:points.length>=2&&document.blocks.filter(b=>b.id[0]===3&&b.id[1]===partId&&b.id[2]===7).length===1};
}
export function createOriginalPoint(document,{partId,sizeKey,objectId,mode,value,fromEnd=false,references=[]}={}){
 need(['fraction','distance','mid-arc'].includes(mode)&&typeof fromEnd==='boolean','اختر نوع النقطة واتجاه المرجع.');
 need(Array.isArray(references)&&references.length<=2&&references.every(r=>r?.objectId===objectId&&typeof r.fraction==='number'&&Number.isFinite(r.fraction)&&r.fraction>=0&&r.fraction<=1),'مراجع اختيار النقطة غير صالحة.');
 const cap=inspectOriginalPointTools(document,{partId,sizeKey});need(cap.eligible&&cap.paths.some(p=>p.id===objectId),'اختر خطًا أو منحنى أصليًا مكتمل الحساب.');
 let type=mode,number=value;
 if(mode==='mid-arc'){
  need(!fromEnd&&Array.isArray(references)&&references.length===2,'اختر موضعين على المسار الأصلي نفسه.');
  need(references.every(r=>r?.objectId===objectId&&typeof r.fraction==='number'&&Number.isFinite(r.fraction)&&r.fraction>=0&&r.fraction<=1),'اختر الموضعين على المسار نفسه دون تغيير مصدر النقطة.');
  need(Math.abs(references[0].fraction-references[1].fraction)>1e-7,'اختر موضعين مختلفين على المسار.');type='fraction';number=(references[0].fraction+references[1].fraction)/2;
 }else{need(typeof number==='number'&&Number.isFinite(number),'أدخل نسبة أو مسافة عددية.');if(mode==='fraction'){need(number>=0&&number<=100,'النسبة من 0 إلى 100٪.');number/=100;}else need(number>=0&&number<=1e6,'المسافة من صفر إلى 1000000 مم.');}
 const result=appendOriginalLinkedPoint(document,{partId,sizeKey,objectId,type,value:number,fromEnd});
 return{...result,sourceObjectId:objectId,mode,nativeType:type,...(type==='fraction'?{sourceFraction:Math.fround(fromEnd?1-Math.fround(number):number)}:{distanceMm:Math.fround(number),fromEnd}),references:references.map(r=>({...r}))};
}
