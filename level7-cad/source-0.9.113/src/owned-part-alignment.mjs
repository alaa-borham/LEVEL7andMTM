/** Rigid whole-part alignment for authenticated independent owned N38 only. */
import{inspectExperimentalParametricEngine,reshapeExperimentalPartPoints}from'./native-owned-parts.js';
import{assertPartLinksPreserved}from'./part-link-guard.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
export async function alignOwnedPart(document,{partId,objectId,axis,anchor='start',direction='forward'}={}){
 need(Number.isInteger(partId)&&partId>=1&&partId<=99,'اختر بارتًا مستقلًا صحيحًا من 1 إلى 99.');
 need(['horizontal','vertical'].includes(axis)&&['start','end','center'].includes(anchor)&&['forward','backward'].includes(direction),'اختر اتجاه المحاذاة ونقطة الارتكاز الصحيحة.');
 const cap=await inspectExperimentalParametricEngine(document,{partId});need(cap.eligible,'محاذاة البارت متاحة لبارتات N38 المستقلة المعتمدة فقط.');
 const reference=cap.objects.find(o=>o.kind==='line'&&o.objectId===objectId);need(reference,'اختر خطًا من البارت المرجعي للمحاذاة.');
 const{a,b}=reference,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);need(length>1e-7,'الخط المرجعي منعدم.');
 const pivot=anchor==='start'?a:anchor==='end'?b:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},sign=direction==='forward'?1:-1,tx=axis==='horizontal'?sign:0,ty=axis==='vertical'?sign:0,c=(tx*dx+ty*dy)/length,s=(ty*dx-tx*dy)/length;
 const points=cap.objects.filter(o=>o.kind==='point').map(p=>{let x=pivot.x+(p.x-pivot.x)*c-(p.y-pivot.y)*s,y=pivot.y+(p.x-pivot.x)*s+(p.y-pivot.y)*c;
  if(p.objectId===reference.startPointId||p.objectId===reference.endPointId){const offset=p.objectId===reference.startPointId?(anchor==='start'?0:anchor==='end'?-length:-length/2):(anchor==='start'?length:anchor==='end'?0:length/2);x=pivot.x+tx*offset;y=pivot.y+ty*offset;}
  return{objectId:p.objectId,x:Math.fround(x),y:Math.fround(y)};});
 need(points.every(p=>[p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)),'المحاذاة تتجاوز نطاق إحداثيات الحفظ.');
 const result=await reshapeExperimentalPartPoints(document,{partId,points}),impact=assertPartLinksPreserved(document,result.document);need(!impact.affectedPartIds.length,'المحاذاة تحتاج إعادة حساب بارتات تابعة؛ لم تُفصل الروابط.');
 const after=await inspectExperimentalParametricEngine(result.document,{partId});need(after.eligible&&after.objects.length===cap.objects.length,'تعذر التحقق من محاذاة البارت.');
 for(let i=0;i<cap.objects.length;i++){const old=cap.objects[i],next=after.objects[i];need(next.objectId===old.objectId&&next.kind===old.kind&&(old.kind!=='line'||old.startPointId===next.startPointId&&old.endPointId===next.endPointId),'لم تُحفظ معرّفات عناصر البارت.');}
 return{...result,impact,lines:after.objects.filter(o=>o.kind==='line'),operation:'align-'+axis,copy:false,angle:Math.atan2(s,c)*180/Math.PI,pivot:{...pivot}};
}
