/** Temporary measurements from independently executed construction only.
 * No native cache coordinates enter measurements. No document writes. */
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {decodeSupportedHistory} from './native-mdl.js';
import {readNativeMetadata} from './native-measurements.js';
import {constructionPoints} from './construction-polyline-kernel.mjs';
import {connectedContour,measureClosedRegion} from './closed-region-inspection.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
export const dimensionModes={distance:['مسافة بين نقطتين',2],horizontal:['مسافة أفقية',2],vertical:['مسافة رأسية',2],normal:['نقطة إلى خط مستقيم',2],length:['طول خط أو منحنى',1],partial:['طول جزئي على المسار',2],sum:['مجموع الأطوال',0],angle:['زاوية بين اتجاهين',2],threeAngle:['زاوية ثلاث نقاط',3],rotation:['زاوية دوران',3],direction:['اتجاه الخط أو المنحنى',1],vector:['متجه بين نقطتين',2],origin:['متجه من أصل الرسم',1],area:['صافي مساحة وحدود مع فتحات',0],contour:['مساحة ومحيط تلقائي من خط حد',1]};
const point=p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6);
export function createDimensionInspection(document,{partId,sizeKey}={}){
 need(typeof sizeKey==='string'&&sizeKey.length>0&&sizeKey===readNativeMetadata(document).referenceSize?.name,'القياس متاح للمقاس الأساسي المحسوب فقط.');
 let part=createPartHistoryCalculation(document,{sizeKey}).get(partId);
 // The literal point/line decoder independently executes the owned N38 family,
 // whose numeric-input records are outside the general construction engine.
 if(!part.historyFullyExecuted){const literal=decodeSupportedHistory(document,partId);if(document.variant==='VA'&&literal.historyComplete&&literal.totalRecords>0&&!literal.unsupported.length)part={historyFullyExecuted:true,objects:[...literal.points.map(p=>({id:p.objectId,points:[[p.x,p.y]]})),...literal.lines.map(l=>({id:l.objectId,points:[[l.a.x,l.a.y],[l.b.x,l.b.y]]}))]};}
 need(part.historyFullyExecuted&&!part.emptyHistory,'لم يكتمل حساب البارت؛ لا يُقاس الرسم المخزّن بدلًا منه.');
 const objects=part.objects.filter(o=>!o.hidden&&!['grain-marker-v1'].includes(o.directionPolyline?.family));
 const paths=objects.filter(o=>o.points.length>=2).map(o=>({objectId:o.id,points:constructionPoints(o).map(p=>p.slice())}));
 const points=objects.filter(o=>!o.geometryKind&&o.points.length===1).map(o=>({objectId:o.id,point:o.points[0].slice()}));
 const byId=new Map([...paths,...points].map(o=>[o.objectId,o]));
 function resolve(ref){
  const o=byId.get(ref?.objectId);need(o,'مرجع القياس غير موجود في الهندسة المحسوبة.');
  if(o.point)return{point:o.point.slice(),objectId:o.objectId};
  const fraction=ref.fraction;need(Number.isFinite(fraction)&&fraction>=0&&fraction<=1,'موضع القياس خارج المسار.');
  const lengths=o.points.slice(1).map((p,i)=>distance(p,o.points[i])),total=lengths.reduce((s,n)=>s+n,0);need(total>1e-7&&lengths.every(n=>n>1e-7),'مسار قياس منعدم.');
  let left=fraction*total,i=0;while(i<lengths.length-1&&left>=lengths[i])left-=lengths[i++];
  const a=o.points[i],b=o.points[i+1],direction=b.map((x,k)=>x-a[k]);
  return{point:a.map((x,k)=>x+direction[k]*Math.min(1,left/lengths[i])),objectId:o.objectId,fraction,total,direction,points:o.points};
 }
 function measure(mode,refs){
  need(mode in dimensionModes&&Array.isArray(refs)&&refs.length<=128,'أداة أو مراجع قياس غير صالحة.');
  const required=dimensionModes[mode][1];need(required?refs.length===required:refs.length>0,'أكمل اختيار مراجع القياس.');
  const r=refs.map(resolve),ps=r.map(p=>p.point),deg=v=>Math.atan2(v[1],v[0])*180/Math.PI,delta=(a,b)=>b.map((x,k)=>x-a[k]);let value,unit='mm',segments=[],extra={};
  if(['distance','horizontal','vertical','vector','origin'].includes(mode)){
   const a=mode==='origin'?[0,0]:ps[0],b=mode==='origin'?ps[0]:ps[1],d=delta(a,b);segments=[[a,b]];
   if(mode==='vector'||mode==='origin'){value=distance(a,b);extra={dx:d[0],dy:d[1]};}else value=mode==='distance'?distance(a,b):Math.abs(d[mode==='horizontal'?0:1]);
  }else if(mode==='normal'){
   const path=r[1].points;need(path,'اختر نقطة ثم خطًا مستقيمًا.');const a=path[0],b=path.at(-1),d=delta(a,b),length=distance(a,b);need(length>1e-7&&path.every(p=>Math.abs(cross(delta(a,p),d))/length<=.0001),'مرجع العمود يجب أن يكون مستقيمًا.');
   const t=delta(a,ps[0]).reduce((s,x,k)=>s+x*d[k],0)/length**2,foot=a.map((x,k)=>x+t*d[k]);value=distance(ps[0],foot);segments=[[ps[0],foot],[a,b]];extra={foot};
  }else if(mode==='length'||mode==='partial'||mode==='sum'){
   need(r.every(x=>x.points),'اختر خطًا أو منحنى.');
   if(mode==='partial'){need(r[0].objectId===r[1].objectId,'اختر موضعين على المسار نفسه.');value=Math.abs(r[1].fraction-r[0].fraction)*r[0].total;segments=[[ps[0],ps[1]]];}
   else {need(new Set(r.map(x=>x.objectId)).size===r.length,'اختر كل مسار مرة واحدة.');value=r.reduce((s,x)=>s+x.total,0);}
  }else if(mode==='direction'||mode==='angle'){
   need(r.every(x=>x.direction),'اختر موضعًا على خط أو منحنى.');unit='°';const a=deg(r[0].direction);value=mode==='direction'?a:Math.abs(((deg(r[1].direction)-a+540)%360)-180);
   segments=r.map(x=>{const n=Math.hypot(...x.direction);return[x.point,x.point.map((p,k)=>p+20*x.direction[k]/n)];});
  }else if(mode==='threeAngle'||mode==='rotation'){
   const a=delta(ps[1],ps[0]),b=delta(ps[1],ps[2]);need(Math.hypot(...a)>1e-7&&Math.hypot(...b)>1e-7,'لا يجوز أن تقع نقطة الزاوية على رأسها.');value=((deg(b)-deg(a)+540)%360)-180;if(mode==='threeAngle')value=Math.abs(value);unit='°';segments=[[ps[1],ps[0]],[ps[1],ps[2]]];
  }else if(mode==='area'||mode==='contour'){
   need(r.every(x=>x.points),'اختر خطوط الحد المغلق.');
   const found=mode==='contour'?connectedContour(paths,r[0].objectId,closedBoundary):null;
   const selected=found?paths.filter(p=>found.sourceObjectIds.includes(p.objectId)):r.map(x=>({objectId:x.objectId,points:x.points}));
   const region=measureClosedRegion(selected,closedBoundary);value=region.value;unit='mm²';extra={...region,sourceObjectIds:selected.map(p=>p.objectId)};segments=region.boundaries.flatMap(ring=>ring.map((p,i)=>[p,ring[(i+1)%ring.length]]));
  }
  need(Number.isFinite(value),'تعذر حساب القياس.');return{mode,value,unit,sourceObjectIds:r.map(x=>x.objectId),...extra,points:ps,segments,references:refs.map(r=>({...r})),partId,sizeKey,temporary:true,usesCachedGeometryInputs:false};
 }
 return{partId,sizeKey,paths:structuredClone(paths),points:structuredClone(points),resolve,measure};
}
export function pickDimensionReference(model,objectId,position){
 need(point(position),'موضع اختيار غير صالح.');const p=model.points.find(p=>p.objectId===objectId);if(p)return{objectId};
 const path=model.paths.find(p=>p.objectId===objectId)?.points;need(path,'اختر عنصرًا محسوبًا ظاهرًا.');let total=0,best=null;
 for(let i=0;i<path.length-1;i++){const a=path[i],d=path[i+1].map((x,k)=>x-a[k]),length=Math.hypot(...d);need(length>1e-7,'مسار منعدم.');const t=Math.max(0,Math.min(1,position.reduce((s,x,k)=>s+(x-a[k])*d[k],0)/length**2)),q=a.map((x,k)=>x+t*d[k]),error=distance(position,q);if(!best||error<best.error)best={error,arc:total+t*length};total+=length;}
 return{objectId,fraction:best.arc/total};
}
export function closedBoundary(paths){
 need(paths.length&&paths.length<=128&&new Set(paths.map(p=>p.objectId)).size===paths.length,'حدود المساحة مكررة أو غير صالحة.');
 need(paths.every(p=>Array.isArray(p.points)&&p.points.length>=2&&p.points.every((q,i)=>point(q)&&(!i||distance(q,p.points[i-1])>1e-7)))&&paths.reduce((s,p)=>s+p.points.length-1,0)<=1600,'حدود المساحة غير صالحة أو كبيرة جدًا.');
 const remaining=paths.slice(1),result=paths[0].points.map(p=>p.slice());
 while(remaining.length){const end=result.at(-1),hits=[];remaining.forEach((p,i)=>{if(distance(end,p.points[0])<.0001)hits.push({i,points:p.points});if(distance(end,p.points.at(-1))<.0001)hits.push({i,points:p.points.toReversed()});});need(hits.length===1,'الحد مفتوح أو متفرع؛ اختر حلقة واحدة مغلقة.');const hit=hits[0];result.push(...hit.points.slice(1));remaining.splice(hit.i,1);}
 need(result.length>=4&&result.length<=1601&&distance(result[0],result.at(-1))<.0001,'أغلق الحدود دون فجوة قبل قياس المساحة.');result.pop();
 for(let i=0;i<result.length;i++){const a=result[i],b=result[(i+1)%result.length],c=result[(i+2)%result.length],u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-b[k]);need(Math.abs(cross(u,v))>1e-12*Math.hypot(...u)*Math.hypot(...v)||u[0]*v[0]+u[1]*v[1]>0,'حدود متراكبة عند زاوية مرتدة.');}
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){
  if(j===i+1||i===0&&j===result.length-1)continue;const a=result[i],b=result[(i+1)%result.length],c=result[j],d=result[(j+1)%result.length],u=b.map((x,k)=>x-a[k]),v=d.map((x,k)=>x-c[k]),o=c.map((x,k)=>x-a[k]),den=cross(u,v);
  if(Math.abs(den)>1e-12){const t=cross(o,v)/den,s=cross(o,u)/den;need(!(t>=-1e-9&&t<=1+1e-9&&s>=-1e-9&&s<=1+1e-9),'حدود متقاطعة أو متلامسة ذاتيًا.');}
  else if(Math.abs(cross(o,u))<1e-9){const n=u[0]**2+u[1]**2;need(n>1e-14,'حد منعدم.');const t=o.reduce((s,x,k)=>s+x*u[k],0)/n,z=d.reduce((s,x,k)=>s+(x-a[k])*u[k],0)/n;need(Math.min(1,Math.max(t,z))<Math.max(0,Math.min(t,z))-1e-9,'حدود متراكبة.');}
 }
 return result;
}

