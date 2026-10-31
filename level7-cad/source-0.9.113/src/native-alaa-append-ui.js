import {appendNativePath} from './drawing-path.js';
// Work-only UI adapter. Authentication, limits and native mutations belong to the engine.
// This module is not activated until a native-verified browser engine is supplied by the host.
import {serializeMdl} from './native-mdl.js';
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const equal=(a,b)=>a.length===b.length&&a.every((byte,index)=>byte===b[index]);
export function createAlaaAppendUi(host){
 let engine=null,loadError='',pointContext=null,announced=null;
 const checks=new WeakMap(),context=()=>host.context();
 const capability=(partId=context().partId)=>checks.get(context().document)?.get(partId)?.result||null;
 const eligible=()=>!!capability()?.eligible;
 const reason=()=>capability()?.reason||loadError||(engine?'Checking the authenticated selected-part drawing capability…':'Loading the bounded selected-part drawing engine…');
 const same=previous=>{const current=context();return current.document===previous.document&&current.partId===previous.partId&&current.cursor===previous.cursor&&current.totalRecords===previous.totalRecords;};
 const objects=()=>eligible()?capability().newObjects:[];
 const points=()=>objects().filter(object=>object.kind==='point');
 const reusablePoints=()=>points().filter(object=>capability()?.reusablePointIds?.includes(object.objectId));
 const canEditPoints=()=>eligible()&&capability()?.canEditNewPoints===true;
 const full=()=>context().cursor===context().totalRecords;
 function put(document,partId,result){let parts=checks.get(document);if(!parts){parts=new Map();checks.set(document,parts);}parts.set(partId,{result});}
 function inspect(){
  const c=context();if(!engine||!c.document)return;
  let parts=checks.get(c.document);if(!parts){parts=new Map();checks.set(c.document,parts);}if(parts.has(c.partId))return;
  const check={result:null};parts.set(c.partId,check);
  Promise.resolve().then(()=>engine.inspectAlaa2Append(c.document,{partId:c.partId})).then(result=>{
   check.result=result;if(!same(c))return;host.render();
   if(result.eligible&&(announced?.document!==c.document||announced?.partId!==c.partId)){announced={document:c.document,partId:c.partId};host.notice(`الرسم متاح على البارت ${c.partId} المحدد. اختر أداة الرسم ثم ارسم مباشرة. يمكن تعديل النقاط العددية المدعومة؛ لإزاحة عناصر الأصل المدعومة استخدم «تحرير الأصل».`,false,true);}
  }).catch(error=>{check.result={eligible:false,reason:error.message};if(same(c))host.render();});
 }
 function projectedModel(base){
  if(!eligible())return base;
  const tail=objects(),tailPoints=tail.filter(object=>object.kind==='point').map(object=>({...object,id:object.objectId}));
  const tailLines=tail.filter(object=>object.kind==='line').map(object=>({...object,id:object.objectId,length:Math.hypot(object.b.x-object.a.x,object.b.y-object.a.y)}));
  // General core eligibility is deliberately preserved. Only this known append tail is projected.
  return{...base,points:tailPoints,lines:tailLines,alaaAppendEligible:true};
 }
 async function mutate(method,args,label,dialogId=null){
  const c=context();if(c.busy||!eligible())throw Error(reason());if(!full())throw Error('The complete current native record position is required.');
  if(typeof method!=='function'&&typeof engine?.[method]!=='function')throw Error('This native append operation is unavailable.');
  host.busy(true);
  try{
   const result=await (typeof method==='function'?method:engine[method])(c.document,{partId:c.partId,...args});
   const next=await engine.inspectAlaa2Append(result.document,{partId:c.partId});
   if(!same(c)||(dialogId&&!$(dialogId).open))throw Error('Document or part changed; no edit was applied.');
   if(!next.eligible)throw Error(next.reason||'The appended native document was refused.');
   if(equal(serializeMdl(c.document),serializeMdl(result.document))){host.status('لم يتغير المستند؛ لم يُنشأ تعديل أو سجل تراجع.');return{...result,changed:false};}
   put(result.document,c.partId,next);announced={document:result.document,partId:c.partId};host.commit(result.document,label);return{...result,changed:true};
  }finally{host.busy(false);}
 }
 const endpoint=position=>position.pointId?{pointId:position.pointId}:{x:position.x,y:position.y};
 const drawPoint=position=>mutate('appendAlaa2Point',{x:position.x,y:position.y},'Created native literal point');
 const drawLinkedPoint=options=>mutate('appendAlaa2LinkedPoint',options,'Created point linked to its source line');
 const resizeLine=options=>mutate('resizeAlaa2Line',options,'Resized native line preserving endpoint identities');
 const drawSegment=(start,end)=>mutate('appendAlaa2Segment',{start:endpoint(start),end:endpoint(end)},'Created native literal line');
 const drawPath=vertices=>mutate((doc,args)=>appendNativePath(doc,args,engine.appendAlaa2Segment),{vertices:vertices.map(endpoint),closed:true},'Created native rectangle');
 const referenceSegment=(startPointId,endPointId)=>mutate('appendAlaa2Segment',{start:{pointId:startPointId},end:{pointId:endPointId}},'Created native literal line between new points','#new-line-dialog');
 function renderControls(){
  for(const field of $$('#alaa-point-dialog input,#alaa-point-dialog button'))field.disabled=context().busy;
 }
 function pointEditor(id=null){
  if(!eligible())return false;if(context().busy||!full())return true;
  const point=id===null?null:points().find(object=>object.objectId===Number(id));
  if(id!==null&&!point){host.notice('يمكن تعديل النقاط الجديدة المعتمدة فقط؛ هندسة التصميم الأصلية للقراءة.',true);return true;}
  if(point?.binding){host.notice('هذه النقطة مرتبطة بالخط المصدر؛ عدّل نقاط الخط لتحريكها مع الحفاظ على العلاقة.',true);return true;}
  if(id!==null&&(!canEditPoints()||typeof engine.updateAlaa2Point!=='function')){host.notice('تعديل النقطة الجديدة لم يُعتمد في هذا المحرّك بعد.',true);return true;}
  pointContext={...context(),objectId:point?.objectId??null};host.clearDrawing();
  $('#alaa-point-title').textContent=point?`New literal point ${point.objectId} — absolute X / Y`:'Create literal point — absolute X / Y';
  $('#alaa-point-x').value=point?.x??0;$('#alaa-point-y').value=point?.y??0;
  $('#alaa-point-error').hidden=true;$('#alaa-point-error').textContent='';host.dialog('alaa-point-dialog');renderControls();$('#alaa-point-x').select();return true;
 }
 function reset(){pointContext=null;$('#alaa-point-dialog').close();}
 $('#alaa-point-form').addEventListener('submit',async event=>{
  event.preventDefault();const previous=pointContext;if(!previous||!same(previous)||context().busy)return;
  try{
   const xText=$('#alaa-point-x').value.trim(),yText=$('#alaa-point-y').value.trim(),x=Number(xText),y=Number(yText);
   if(!xText||!yText||!Number.isFinite(x)||!Number.isFinite(y))throw Error('أدخل إحداثيين عدديين صحيحين.');
   const creating=previous.objectId===null,args={x,y,...(creating?{}:{objectId:previous.objectId})};
   const result=await mutate(creating?'appendAlaa2Point':'updateAlaa2Point',args,creating?'Created native literal point':'Updated new literal point and dependent new lines','#alaa-point-dialog');
   $('#alaa-point-dialog').close();pointContext=null;host.select('point',creating?result.pointId:previous.objectId);host.fit();
  }catch(error){$('#alaa-point-error').hidden=false;$('#alaa-point-error').textContent=error.message;}
 });
 $('#alaa-point-dialog').addEventListener('cancel',event=>{if(context().busy)event.preventDefault();});
 $('#alaa-point-dialog').addEventListener('close',()=>{pointContext=null;if(!document.querySelector('dialog[open]'))$('#native-canvas')?.focus({preventScroll:true});});
 Promise.resolve().then(()=>host.loadEngine()).then(module=>{engine=module;inspect();host.render();}).catch(error=>{loadError=error.message;host.render();});
 return Object.freeze({capability,eligible,reason,inspect,objects,points,reusablePoints,canEditPoints,projectedModel,renderControls,drawPoint,drawLinkedPoint,resizeLine,drawSegment,drawPath,referenceSegment,pointEditor,reset});
}
