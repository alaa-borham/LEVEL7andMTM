/** Existing authenticated numeric endpoint writers; no new MDL opcodes. */
import{inspectExperimentalParametricEngine}from'./native-owned-parts.js';
import{inspectPartDrawing}from'./native-part-drawing.js';
import{editDrawingLine}from'./drawing-line-edit.js';
import{transformLine}from'./line-transform.js';
import{reshapeExperimentalLine,appendExperimentalBoundSegment}from'./native-owned-parts.js';
import{reshapePartLine,appendPartSegment}from'./native-part-drawing.js';
import{assertPartLinksPreserved}from'./part-link-guard.mjs';
export async function inspectLineTransform(document,{partId}={}){
 const owned=await inspectExperimentalParametricEngine(document,{partId}),literal=owned.eligible?null:await inspectPartDrawing(document,{partId});
 const eligible=owned.eligible||literal?.eligible,objects=owned.eligible?owned.objects:literal?.newObjects??[];
 return{eligible:!!eligible,owned:!!owned.eligible,lines:structuredClone(objects.filter(o=>o.kind==='line')),reason:eligible?'':literal?.reason||owned.reason};
}
export async function transformEditableLine(document,options){
 const{partId,objectId,operation,copy=false,dx,dy,angle,anchor='start',axis='vertical',position=0,fx,fy}=options??{};
 if(typeof copy!=='boolean'||!['translate','rotate','mirror','scale'].includes(operation))throw Error('اختر عملية تحويل صحيحة.');
 const cap=await inspectLineTransform(document,{partId});if(!cap.eligible||!cap.lines.some(l=>l.objectId===objectId))throw Error('اختر خطًا جديدًا مدعومًا؛ تحويل الأصل العام والمنحنيات غير متاح بهذه الأداة.');
 let result;
 if(operation==='scale'||operation==='rotate'&&copy||operation==='mirror'&&!copy){
  const source=cap.lines.find(l=>l.objectId===objectId);let endpoints;
  if(operation==='scale'){
   if(![fx,fy].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=1000))throw Error('معاملا X وY يجب أن يكونا أكبر من صفر وحتى 1000.');
   const ps=[source.a,source.b].map(p=>({x:Math.fround(p.x*fx),y:Math.fround(p.y*fy)}));
   if(!ps.every(p=>[p.x,p.y].every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)))throw Error('نتيجة التحجيم خارج نطاق الإحداثيات.');
   if(ps[0].x===ps[1].x&&ps[0].y===ps[1].y)throw Error('التحجيم يجعل طول الخط صفرًا عند الحفظ.');
   if(ps[0].x===source.a.x&&ps[0].y===source.a.y&&ps[1].x===source.b.x&&ps[1].y===source.b.y)throw Error('التحجيم لا يغير الخط بدقة الحفظ الحالية.');
   endpoints={start:ps[0],end:ps[1]};
  }else endpoints=transformLine(source,{action:operation==='rotate'?'rotate':'mirror-copy',value:operation==='rotate'?angle:position,anchor,axis});
  const writer=copy?(cap.owned?appendExperimentalBoundSegment:appendPartSegment):(cap.owned?reshapeExperimentalLine:reshapePartLine);
  result=await writer(document,{partId,objectId,...endpoints});
 }else result=await editDrawingLine(document,{partId,objectId,action:operation==='translate'?(copy?'copy':'move'):operation==='rotate'?'rotate':'mirror-copy',dx,dy,value:operation==='rotate'?angle:position,anchor,axis});
 const impact=assertPartLinksPreserved(document,result.document);if(impact.affectedPartIds.length)throw Error('التعديل يحتاج إعادة حساب بارتات تابعة؛ لم يُطبّق ولم تُفصل الروابط.');
 const after=await inspectLineTransform(result.document,{partId});if(!after.eligible)throw Error('تعذر التحقق من نتيجة التحويل.');
 if(!copy){const old=cap.lines.find(l=>l.objectId===objectId),line=after.lines.find(l=>l.objectId===objectId);if(!line||old.startPointId!==line.startPointId||old.endPointId!==line.endPointId)throw Error('لم تُحفظ هوية الخط ونقاطه.');}
 return{...result,impact,lines:after.lines,operation,copy};
}
