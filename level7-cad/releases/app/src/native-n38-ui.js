import {appendNativePath} from './drawing-path.js';
import {createLinkedPointPositionUi} from './linked-point-position-ui.js';
// WORK ONLY UI adapter. All native validation, arithmetic and mutations belong to the engine.
import {serializeMdl} from './native-mdl.js';
const $=selector=>document.querySelector(selector), $$=selector=>[...document.querySelectorAll(selector)];
const equal=(a,b)=>a.length===b.length&&a.every((v,n)=>v===b[n]);
const operandName=code=>code===0?'number':code<200?'X'+code:'Z'+(code-200);
const binding=name=>({kind:name[0].toLowerCase(),index:Number(name.slice(1))});

export function createN38Ui(host){
 let engine=null,loadError='',parameterContext=null,pointContext=null;
 const checks=new WeakMap();
 const context=()=>host.context(),capability=(partId=context().partId)=>checks.get(context().document)?.get(partId)?.result||null;
 const eligible=()=>!!capability()?.eligible;
 const reason=()=>capability()?.reason||loadError||(engine?'Checking authenticated New-N38 capability…':'Loading the work-only N38 engine…');
 const same=c=>context().document===c.document&&context().partId===c.partId;
 const linkedPointEditor=createLinkedPointPositionUi({context,canvas:document.querySelector('#native-canvas'),apply:args=>mutate('updateExperimentalLinkedPoint',args,'Updated linked native point position','#linked-point-position'),select:id=>host.select('point',id)});
 function put(doc,partId,result){let parts=checks.get(doc);if(!parts){parts=new Map();checks.set(doc,parts);}parts.set(partId,{result});}
 function inspect(){
  const c=context();if(!engine||!c.document)return;
  let parts=checks.get(c.document);if(!parts){parts=new Map();checks.set(c.document,parts);}if(parts.has(c.partId))return;
  const check={result:null};parts.set(c.partId,check);
  Promise.resolve().then(()=>engine.inspectExperimentalParametricEngine(c.document,{partId:c.partId})).then(result=>{
   check.result=result;if(!same(c))return;host.render();if(result.eligible){host.fit();host.notice(`${result.workOnly?'تجربة N38':'نموذج N38 المعتمد'}: إنشاء وتعديل X1..X80 وZ1..Z99 المحليّة متاح هنا، مع ربط إحداثيات النقاط المعتمدة اختياريًا.`,false,true);}
  }).catch(error=>{check.result={eligible:false,reason:error.message};if(same(c))host.render();});
 }
 function approvedBindings(){const c=capability(),result=[];for(const kind of['x','z'])for(const entry of c?.bindingEligibility?.[kind]||[]){const name=kind.toUpperCase()+entry.index;if(entry.eligible&&Number.isFinite(c.calculatedValues?.[name]))result.push(name);}return result;}
 function fillBindings(select,current='number',freeLabel='Number'){
  select.replaceChildren();const empty=document.createElement('option');empty.value='number';empty.textContent=freeLabel;select.append(empty);
  for(const name of approvedBindings()){const option=document.createElement('option');option.value=name;option.textContent=`${name} = ${capability().calculatedValues[name]}`;select.append(option);}
  select.value=[...select.options].some(o=>o.value===current)?current:'number';
 }
 function renderControls(){
  linkedPointEditor.refresh();
  const c=context(),cap=capability(),allowed=!!cap?.eligible&&!c.busy&&c.cursor===c.totalRecords;
  for(const kind of['x','z']){
   const button=$(`#n38-add-${kind}`),entries=cap?.[kind+'Entries']||[];
   button.hidden=kind==='x'||!cap?.eligible;button.disabled=!allowed||entries.length>=(kind==='x'?80:99);
   button.textContent=entries.length<(kind==='x'?80:99)?`إضافة ${kind.toUpperCase()}${entries.length+1}`:`${kind.toUpperCase()}1..${kind==='x'?80:99} defined`;
   button.title=c.cursor!==c.totalRecords?'Restore the full record position before authoring.':'Create the next sequential supported local parameter.';
   const explanation=$(`#n38-${kind}-scope`);explanation.hidden=!c.document||!cap?.eligible;
   explanation.textContent=cap?.eligible?`${cap.workOnly?'WORK ONLY · ':''}New-N38 · local X1..X80 and Z1..Z99 · active part ${c.partId}.`:`New-N38 authoring unavailable: ${reason()}`;
  }
  $('#n38-drawing-bindings').hidden=!cap?.eligible;
  for(const select of $$('#n38-drawing-bindings select')){const selected=select.value;fillBindings(select,selected,'Canvas click');select.disabled=!allowed;}
  for(const selector of['#n38-parameter-dialog','#n38-point-dialog'])for(const field of $$(`${selector} input,${selector} select,${selector} button`))field.disabled=c.busy;
  $$('#n38-point-dialog input[data-n38-number]').forEach(input=>{input.disabled=c.busy||$(`#n38-point-${input.dataset.n38Number}-source`).value!=='number';});
  $('#n38-parameter-note').textContent=`${cap?.workOnly?'تجربة مقيدة':'إنشاء وتعديل مقيد'} لنموذج N38 المعتمد: X1..X80 وZ1..Z99 المحليّة فقط. الحساب من المحرّك؛ لا تُنفذ تعبيرات CMDIF أو أوامر التصميم العامة. يطبّق التغيير وإعادة الحساب كعملية تراجع واحدة.`;
  $$('[data-n38-edit-x],[data-n38-edit-z]').forEach(button=>button.disabled=!allowed);
 }
 function projectedModel(base,full,cursor){
  const cap=capability();if(!cap?.eligible)return base;
  let record=0;const objects=[];
  for(const object of cap.objects){record+=object.kind==='point'?(object.binding?(object.binding.type==='fraction'?2:3):4):3;if(full||record<=cursor)objects.push(object);}
  const points=objects.filter(o=>o.kind==='point').map(o=>({...o,id:o.objectId}));
  const lines=objects.filter(o=>o.kind==='line').map(o=>({...o,id:o.objectId,length:Math.hypot(o.b.x-o.a.x,o.b.y-o.a.y)}));
  return{...base,points,lines,totalRecords:cap.recordCount,cacheStale:cap.cacheStale,n38Eligible:true};
 }
 async function mutate(method,args,label,dialogId=null){
  const c=context();if(c.busy||!eligible())throw Error(reason());
  if(c.cursor!==c.totalRecords&&method!=='recalculateExperimentalEngine')throw Error('Restore the complete construction record before editing.');
  const payload={...args,partId:c.partId};host.busy(true);
  try{
   const result=await (typeof method==='function'?method:engine[method])(c.document,payload);
   const next=await engine.inspectExperimentalParametricEngine(result.document,{partId:c.partId});
   if(!same(c)||(dialogId&&($(dialogId).tagName==='DIALOG'?!$(dialogId).open:$(dialogId).hidden)))throw Error('Document context changed; no edit was applied.');
   if(!next.eligible)throw Error(next.reason||'Engine output was refused.');
   if(equal(serializeMdl(c.document),serializeMdl(result.document))){host.status('لم يتغير المستند؛ لم يُنشأ تعديل أو سجل تراجع.');return{...result,changed:false};}
   put(result.document,c.partId,next);host.commit(result.document,label);return{...result,changed:true};
  }finally{host.busy(false);}
 }
 function row(body,values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value??'');tr.append(td);}body.append(tr);return tr;}
 function renderValues(kind){
  const cap=capability();
  // Restore the frozen reader's column label whenever the new work capability is absent.
  $('#z-values-dialog th:nth-child(4)').textContent=cap?.eligible?'Calculated preview':'Comment';
  if(!cap?.eligible)return false;
  const body=$(`#${kind}-values-body`);body.replaceChildren();
  const entries=cap[kind+'Entries']||[],isX=kind==='x';
  $(`#${kind}-values-empty-example`).hidden=true;$(`#${kind}-values-readonly-note`).hidden=true;$(`#${kind}-values-edit-note`).hidden=true;
  $(`#${kind}-values-part`).textContent='Active part '+String(context().partId).padStart(3,'0')+' · authenticated own New-N38';
  $(`#${kind}-values-summary`).textContent=`${cap.workOnly?'WORK ONLY · ':''}${entries.length} local ${kind.toUpperCase()} definition(s) · Add/Edit supported within the restricted N38 family`;
  if(!entries.length){const tr=row(body,['لا توجد معاملات بعد. استخدم زر الإضافة لإنشاء المعامل المحلي الأول.']);tr.className='empty-values-row';tr.firstChild.colSpan=isX?6:7;tr.firstChild.dir='rtl';}
  for(const entry of entries){
   const calculated=cap.calculatedValues?.['Z'+entry.index];
   const tr=row(body,isX?['Local',entry.index,'Default',entry.value,'—','']: [entry.index,1,entry.formula,Number.isFinite(calculated)?calculated:'Unavailable','—','—','']);
   tr.dataset[isX?'n38XIndex':'n38ZIndex']=entry.index;
   if(isX){const input=document.createElement('input');input.type='number';input.step='any';input.min='-10000';input.max='10000';input.value=String(entry.value);input.dataset.n38InlineX=entry.index;input.setAttribute('aria-label','X'+entry.index);input.disabled=context().busy||context().cursor!==context().totalRecords;const opened=context();input.addEventListener('keydown',async event=>{if(event.key==='Escape'){input.value=String(entry.value);return;}if(event.key!=='Enter'||event.repeat)return;event.preventDefault();if(context().busy||!same(opened))return;try{const text=input.value.trim(),value=Number(text);if(!text||!Number.isFinite(value)||Math.abs(value)>10000)throw Error('أدخل قيمة بين −10000 و10000 مم.');await mutate('setExperimentalEngineX',{index:entry.index,value},'Updated local X'+entry.index);focusValues('x',entry.index);}catch(error){host.status(error.message);input.classList.add('n38-invalid');input.title=error.message;}});tr.cells[3].replaceChildren(input);}

   const edit=document.createElement('button');edit.type='button';edit.dataset[isX?'n38EditX':'n38EditZ']=entry.index;edit.textContent=isX?`Edit X${entry.index}…`:`Edit Z${entry.index}…`;edit.disabled=context().busy||context().cursor!==context().totalRecords;tr.lastChild.append(edit);
  }
  $(`#${kind}-values-warnings`).textContent=isX?'Stored local scalar values. A universal measurement unit is not inferred.':cap.calculatedValuesNativeVerified===true?'Calculated values are provided by the verified bounded engine.':'Calculated values are an experimental arithmetic preview from the bounded engine. This is not general native GRAFIS evaluation; CMDIF and unsupported formulas remain refused.';
  return true;
 }
 function openParameter(kind,index){
  if(!eligible()||context().busy||context().cursor!==context().totalRecords)return;
  const cap=capability(),entry=(cap[kind+'Entries']||[]).find(e=>e.index===index);
  parameterContext={...context(),kind,index};
  $('#n38-parameter-title').textContent=`${entry?'Edit':'Create'} local ${kind.toUpperCase()}${index}`;
  $('#n38-parameter-value-field').hidden=kind!=='x';$('#n38-parameter-formula-field').hidden=kind!=='z';
  $('#n38-parameter-value').value=entry?.value??0;$('#n38-parameter-formula').value=entry?.formula??'';
  $('#n38-parameter-error').hidden=true;$('#n38-parameter-error').textContent='';
  host.dialog('n38-parameter-dialog');(kind==='x'?$('#n38-parameter-value'):$('#n38-parameter-formula')).select();
 }
 function focusValues(kind,index){
  const parent=$(`#${kind}-values-dialog`);if(!parent.open)return;
  // Row controls are rebuilt by late capability inspections; Close is a stable focus target.
  const target=(kind==='x'?parent.querySelector(`[data-n38-inline-x="${index}"]:not(:disabled)`):null)||parent.querySelector('.dialog-actions [data-action="close-dialog"]:not(:disabled)')||parent.querySelector(`[data-n38-edit-${kind}="${index}"]:not(:disabled)`);
  target?.focus();if(target?.tagName==='INPUT')target.select();
 }
 function readOperand(axis){const source=$(`#n38-point-${axis}-source`).value;if(source!=='number'){if(!approvedBindings().includes(source))throw Error('Coordinate binding is undefined or not verified.');return binding(source);}const text=$(`#n38-point-${axis}`).value.trim(),value=Number(text);if(!text||!Number.isFinite(value))throw Error('أدخل إحداثيًا عدديًا صحيحًا.');return value;}
 function pointEditor(id=null){
  if(!eligible())return false;if(context().busy||context().cursor!==context().totalRecords)return true;
  const point=id===null?null:capability().objects.find(o=>o.kind==='point'&&o.objectId===Number(id));if(id!==null&&!point)return true;
  if(point?.binding){linkedPointEditor.open(point);return true;}linkedPointEditor.close();pointContext={...context(),objectId:point?.objectId??null};
  $('#n38-point-title').textContent=point?`Point ${point.objectId} — native coordinate inputs`:'Create point — coordinate inputs';
  for(const axis of['x','y']){fillBindings($(`#n38-point-${axis}-source`),point?operandName(point[axis+'Binding']):'number');$(`#n38-point-${axis}`).value=point?.[axis]??0;}
  $('#n38-point-error').hidden=true;host.dialog('n38-point-dialog');renderControls();$('#n38-point-x-source').focus();return true;
 }
 function drawingPosition(position,endpoint){
  if(!eligible()||position.constructionBinding||position.pointConstruction)return position;const next={...position};let bound=false;
  for(const axis of['x','y']){const name=$(`#n38-bind-${endpoint}-${axis}`).value;if(name==='number')continue;if(!approvedBindings().includes(name))throw Error('Selected endpoint binding is no longer available.');next[axis]=capability().calculatedValues[name];next[axis+'Operand']=binding(name);bound=true;}
  if(bound){delete next.pointId;next.bound=true;}return next;
 }
 const endpoint=p=>p.constructionBinding?{constructionBinding:p.constructionBinding}:p.pointId&&!p.bound?{pointId:p.pointId}:{x:p.xOperand??p.x,y:p.yOperand??p.y};
 const drawPoint=p=>p.constructionBinding?mutate('appendExperimentalLinkedPoint',p.constructionBinding,'Created reference-linked native point'):mutate('appendExperimentalBoundPoint',{x:p.xOperand??p.x,y:p.yOperand??p.y},'Created native N38 point');
 const drawSegment=(a,b)=>mutate('appendExperimentalBoundSegment',{start:endpoint(a),end:endpoint(b)},'Created native N38 segment with explicit coordinate inputs');
 const drawPath=vertices=>mutate((doc,args)=>appendNativePath(doc,args,engine.appendExperimentalBoundSegment),{vertices:vertices.map(endpoint),closed:true},'Created native rectangle');
 const referenceSegment=(a,b)=>mutate('appendExperimentalBoundSegment',{start:{pointId:a},end:{pointId:b}},'Created native N38 referenced line','#new-line-dialog');
 const recalculate=()=>mutate('recalculateExperimentalEngine',{},'Recalculated restricted N38 geometry');
 function reset(){parameterContext=null;pointContext=null;for(const id of['n38-point-dialog','n38-parameter-dialog'])$('#'+id).close();for(const select of $$('#n38-drawing-bindings select'))select.value='number';}
 async function addX(){const c=context(),cap=capability();if(!cap?.eligible||c.busy||c.cursor!==c.totalRecords)throw Error('انتظر اكتمال الحساب قبل الإضافة.');const index=Math.max(0,...cap.xEntries.map(e=>e.index))+1;if(index>80)throw Error('وصلت إلى X80، وهو الحد المدعوم حاليًا.');await mutate('setExperimentalEngineX',{index,value:0},'Added local X'+index,'#x-values-dialog');focusValues('x',index);}
 $('#n38-add-x').addEventListener('click',()=>void addX().catch(error=>host.status(error.message)));
 $('#n38-add-z').addEventListener('click',()=>openParameter('z',(capability()?.zEntries?.length||0)+1));
 document.addEventListener('click',event=>{const x=event.target.closest('[data-n38-edit-x]'),z=event.target.closest('[data-n38-edit-z]');if(x||z){const button=x||z;if(!button.disabled)openParameter(x?'x':'z',Number(x?x.dataset.n38EditX:z.dataset.n38EditZ));}});
 $('#n38-parameter-form').addEventListener('submit',async event=>{
  event.preventDefault();const c=parameterContext;if(!c||!same(c)||context().busy)return;
  try{
   let args;if(c.kind==='x'){const text=$('#n38-parameter-value').value.trim(),value=Number(text);if(!text||!Number.isFinite(value)||Math.abs(value)>10000)throw Error('أدخل قيمة عددية بين −10000 و10000 مم.');args={index:c.index,value};}
   else {const formula=$('#n38-parameter-formula').value.trim();if(!formula)throw Error('أدخل صيغة Z.');args={index:c.index,formula};}
   await mutate(c.kind==='x'?'setExperimentalEngineX':'setExperimentalEngineZ',args,`Updated local ${c.kind.toUpperCase()}${c.index}`,'#n38-parameter-dialog');
   $('#n38-parameter-dialog').close();parameterContext=null;host.fit();focusValues(c.kind,c.index);
  }catch(error){$('#n38-parameter-error').textContent=error.message;$('#n38-parameter-error').hidden=false;}
 });
 $('#n38-point-form').addEventListener('submit',async event=>{
  event.preventDefault();const c=pointContext;if(!c||!same(c)||context().busy)return;
  try{const args={x:readOperand('x'),y:readOperand('y'),...(c.objectId===null?{}:{objectId:c.objectId})};const result=await mutate(c.objectId===null?'appendExperimentalBoundPoint':'updateExperimentalBoundPoint',args,`${c.objectId===null?'Created':'Updated'} N38 point inputs`,'#n38-point-dialog');$('#n38-point-dialog').close();pointContext=null;host.select('point',c.objectId??result.pointId);host.fit();}
  catch(error){$('#n38-point-error').textContent=error.message;$('#n38-point-error').hidden=false;}
 });
 for(const axis of['x','y'])$(`#n38-point-${axis}-source`).addEventListener('change',renderControls);
 for(const id of['n38-point-dialog','n38-parameter-dialog']){$('#'+id).addEventListener('cancel',event=>{if(context().busy)event.preventDefault();});$('#'+id).addEventListener('close',()=>{if(id==='n38-point-dialog')pointContext=null;else{const previous=parameterContext;parameterContext=null;if(previous)focusValues(previous.kind,previous.index);}});}
 for(const select of $$('#n38-drawing-bindings select'))select.addEventListener('change',()=>{host.clearDrawing();host.status('تغيرت مراجع طرفَي الخط؛ اختر البداية ثم النهاية. المراجع المختارة تنشئ نقاطًا أصلية جديدة.');});
 import('./native-owned-parts.js').then(module=>{engine=module;inspect();host.render();}).catch(error=>{loadError=`Browser engine unavailable: ${error.message}`;host.render();});
 return{addX,capability,eligible,reason,inspect,renderControls,projectedModel,renderValues,pointEditor,drawingPosition,drawPoint,drawSegment,drawPath,referenceSegment,recalculate,reset};
}
