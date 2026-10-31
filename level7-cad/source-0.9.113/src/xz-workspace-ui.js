import {previewMeasuredZConstruction} from './parametric-construction-preview.mjs';
import {serializeXZProject,restoreXZProject} from './xz-project.js';
import {serializeMdl} from './native-mdl.js';
import {readCachedPreview} from './native-cache-preview.js';
import {validateNativeScalarFormula} from './native-parameter-transfer.js';
const NS='http://www.w3.org/2000/svg';
export function createXZWorkspace(host){
 const modal=document.createElement('dialog');modal.id='xz-workspace';modal.className='xz-workspace';
 modal.setAttribute('aria-labelledby','xz-workspace-title');
 modal.innerHTML=`<header class="xz-header"><div><span class="xz-eyebrow">LEVEL7 CAD 0.8.6 · X / Z</span><h1 id="xz-workspace-title">القيم والرسم المرجعي</h1></div><button id="xz-close" type="button" aria-label="Close X/Z workspace">×</button></header>
 <p class="xz-scope" dir="rtl">معاينة جزئية: 49 نقطة وخطًا من البارت 002، مقاس HN40. لحفظ القيم في MDL اختر «نسخة لـGrafis»، ثم افتح النسخة في Grafis ونفّذ Test run all ‏(Ctrl+Shift+6) واحفظها. المنحنيات وبقية الأجزاء تُعاد حسابها هناك.</p>
 <div id="xz-unavailable" role="alert" hidden></div><div class="xz-layout" id="xz-content" hidden>
 <section class="xz-drawing"><div class="xz-legend"><span>● المحسوب حاليًا: 49 عنصرًا</span><label><input type="checkbox" id="xz-baseline" checked> الأصل بالرمادي — لم يُعد حسابه</label><button type="button" id="xz-fit">Fit</button></div><p id="xz-reference-note" dir="rtl"></p><svg id="xz-preview" xmlns="http://www.w3.org/2000/svg" aria-label="Partial recalculated X/Z drawing with unchanged original reference" role="img"></svg><output id="xz-selection" dir="rtl">اختر خطًا لعرض رقمه.</output></section>
 <form id="xz-form" class="xz-parameters"><div class="xz-form-heading"><strong>قيم X</strong><span>Local · HN40</span></div><div id="xz-x-inputs" class="xz-x-grid"></div>
 <div class="xz-form-heading"><strong>قيم Z المحسوبة من الرسم</strong></div><div id="xz-measured" class="xz-measured"></div>
 <div class="xz-form-heading"><strong>صيغ Z المرتبطة</strong><span>Arithmetic · CMDIF</span></div><div class="xz-formulas-scroll"><table><thead><tr><th>Z</th><th>الصيغة</th><th>القيمة</th></tr></thead><tbody id="xz-z-inputs"></tbody></table></div>
 <div class="xz-form-actions"><button type="submit" id="xz-apply">تطبيق القيم</button><button type="button" id="xz-undo">تراجع</button><button type="button" id="xz-reset">القيم الأصلية</button></div></form></div>
 <p id="xz-error" role="alert" hidden></p><p id="xz-transfer-result" role="status" dir="rtl" hidden></p><footer class="xz-footer"><output id="xz-status" aria-live="polite" dir="rtl"></output><div><button type="button" id="xz-load">فتح تجربة</button><button type="button" id="xz-save">حفظ تجربة X/Z</button><button type="button" id="xz-native">نسخة MDL لـGrafis</button><button type="button" id="xz-export">تصدير الرسم SVG</button></div></footer>`;
 document.body.append(modal);
 const $=s=>modal.querySelector(s);let source=null,result=null,baseline=null,reference=null,history=[],saved='',working=false,pending=false,ticket=0;
 const listeners=new Set(),emit=()=>listeners.forEach(f=>f());
 const validContext=()=>{const c=host.context();return !host.externalChanges?.()&&source===c.document&&c.partId===2&&c.sizeKey==='__HN40_0'&&c.cursor===286;};
 const stateText=()=>pending?'توجد قيم لم تُطبق بعد':result&&serializeXZProject(result)!==saved?'تجربة غير محفوظة':'تم حفظ التجربة';
 const changed=()=>pending||!!result&&serializeXZProject(result)!==saved;
 const error=message=>{$('#xz-error').hidden=!message;$('#xz-error').textContent=message;};
 function controls(){
  for(const input of modal.querySelectorAll('input,button'))input.disabled=working;
  for(const id of ['#xz-save','#xz-export','#xz-native'])$(id).disabled=working||!result||pending;
  $('#xz-undo').disabled=working||!history.length;$('#xz-apply').disabled=working||!result;
  $('#xz-reset').disabled=working||!result;$('#xz-load').disabled=working||!result;
  if(!validContext()){for(const el of modal.querySelectorAll('input,button:not(#xz-close)'))el.disabled=true;}
  $('#xz-status').textContent=working?'جارٍ الحساب…':result?`${stateText()} · 49 عنصرًا فقط · نسخة MDL تحتاج إعادة حساب في Grafis`:'';
 }
 function forms(){
  $('#xz-x-inputs').replaceChildren();
  for(const index of [3,4,7,15]){
   const label=document.createElement('label');label.textContent='X'+index;
   const input=document.createElement('input');input.type='number';input.step='any';input.required=true;input.min=index===15?'0':'0.000001';input.max=index===15?'1000':'2000';input.dataset.xzX=index;input.setAttribute('aria-label','X'+index);input.value=result.scalarInputs.find(e=>e.name==='X'+index).value;
   label.append(input);$('#xz-x-inputs').append(label);
  }
  $('#xz-measured').replaceChildren();
  for(const z of result.measuredZ){const cell=document.createElement('span');cell.textContent=`Z${z.index} = ${z.value.toFixed(5)}`;$('#xz-measured').append(cell);}
  $('#xz-z-inputs').replaceChildren();
  for(const z of result.zValues.filter(z=>z.index>=33&&z.index<=50)){
   const tr=document.createElement('tr'),name=document.createElement('td'),formula=document.createElement('td'),value=document.createElement('td'),input=document.createElement('input');
   name.textContent='Z'+z.index;input.dataset.xzZ=z.index;input.value=z.formula;input.maxLength=256;input.required=true;input.spellcheck=false;input.setAttribute('aria-label','Z'+z.index+' formula');formula.append(input);value.textContent=Number.isFinite(z.value)?Number(z.value.toFixed(5)).toString():'—';value.dataset.xzValue=z.index;tr.append(name,formula,value);$('#xz-z-inputs').append(tr);
  }
 }
 function draw(fit=true){
  const svg=$('#xz-preview');svg.replaceChildren();
  if(!result)return;
  const drawObjects=(objects,reference)=>{
   const group=document.createElementNS(NS,'g');group.setAttribute('class',reference?'xz-reference':'xz-current');
   for(const object of objects){
    const node=document.createElementNS(NS,object.points.length===1?'circle':'polyline');node.dataset.objectId=object.id;
    if(object.points.length===1){node.setAttribute('cx',object.points[0][0]);node.setAttribute('cy',-object.points[0][1]);node.setAttribute('r','2.2');}
    else node.setAttribute('points',object.points.map(([x,y])=>`${x},${-y}`).join(' '));
    const title=document.createElementNS(NS,'title');title.textContent=`Object ${object.id}`;node.append(title);
    if(!reference)node.addEventListener('click',()=>{$('#xz-selection').textContent=`العنصر ${object.id} · ${object.points.map(p=>p.map(n=>n.toFixed(4)).join(', ')).join(' → ')} mm`;});
    group.append(node);
   }svg.append(group);
  };
  const original=reference?.objects??baseline.objects;
  if($('#xz-baseline').checked)drawObjects(original,true);drawObjects(result.objects,false);
  $('#xz-reference-note').textContent=reference?`الرمادي: ${reference.objects.length} من ${reference.totalObjects} عنصرًا مخزّنًا قبل التعديل، منها المنحنيات المقروءة. ${reference.omitted} عناصر غير معروضة. السماوي فقط أُعيد حسابه؛ شكل التصميم بعد التعديل غير مكتمل.`:'الرمادي معاينة جزئية للأصل؛ السماوي فقط أُعيد حسابه.';
  if(fit){const points=[...($('#xz-baseline').checked?original:baseline.objects),...result.objects].flatMap(o=>o.points),xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,pad=Math.max(w,h)*.04+5;svg.setAttribute('viewBox',`${x-pad} ${y-pad} ${w+pad*2} ${h+pad*2}`);}
 }
 const options=r=>({xOverrides:r.xOverrides,zOverrides:r.zOverrides});
 function fieldOptions(){const xOverrides={},zOverrides={};for(const i of modal.querySelectorAll('[data-xz-x]')){if(i.value.trim()==='')throw Error('أدخل قيمة لكل معامل X.');xOverrides[i.dataset.xzX]=Number(i.value);}for(const i of modal.querySelectorAll('[data-xz-z]')){const original=baseline.zValues.find(z=>String(z.index)===i.dataset.xzZ).formula;if(i.value.trim()!==original)zOverrides[i.dataset.xzZ]=i.value.trim();}return{xOverrides,zOverrides};}
 async function calculate(next,{push=true,direct=false}={}){
  if(working||!source||!validContext())throw Error('سياق X/Z غير متاح حاليًا.');working=true;controls();emit();error('');$('#xz-transfer-result').hidden=true;
  const version=ticket,document=source;let success=false;
  try{for(const formula of Object.values(next.zOverrides??{}))validateNativeScalarFormula(formula);const updated=await previewMeasuredZConstruction(source,next);if(version!==ticket||source!==document||!validContext())throw Error('تغير الملف أو البارت أثناء الحساب.');if(push&&result){history.push(options(result));if(history.length>30)history.shift();}result=updated;pending=false;forms();draw();success=true;}
  catch(e){if(direct)throw e;error(`لم تُطبق القيم: ${e.message} — الرسم يعرض آخر نتيجة ناجحة.`);pending=true;}
  finally{working=false;controls();emit();}return success;
 }
 async function show({display=true}={}){
  const context=host.context();if(working)return;
  if(source!==context.document){if(changed()&&!confirm('تغير ملف MDL. ترك تجربة X/Z غير المحفوظة وبدء تجربة أخرى؟'))return;reset();source=context.document;}
  if(display)modal.showModal();
  if(!validContext()){if(display){$('#xz-content').hidden=true;$('#xz-unavailable').hidden=false;$('#xz-unavailable').textContent='هذه معاينة هندسية جزئية للبارت 002 فقط. بعد تعديل معاملات أخرى استخدم جدولي X وZ لحفظ جميع التغييرات وإعادة الحساب الكامل في Grafis.';}controls();return null;}
  if(result){$('#xz-unavailable').hidden=true;$('#xz-content').hidden=false;controls();return result;}
  $('#xz-content').hidden=true;$('#xz-unavailable').hidden=true;
  working=true;controls();const current=++ticket;
  try{
   if(!source||context.partId!==2||context.sizeKey!=='__HN40_0'||context.cursor!==286)throw Error('اختر البارت 002 من ملف ALAA الأصلي، بالمقاس HN40 والسجل الكامل. التجربة غير متاحة للملفات المعدلة أو الأجزاء الأخرى.');
   const initial=await previewMeasuredZConstruction(source);if(current!==ticket||!validContext())return;
   result=baseline=initial;saved=serializeXZProject(initial);
   try{const cache=readCachedPreview(source,{partId:2,sizeId:1});reference={totalObjects:cache.totalObjects,omitted:cache.unsupported.length,objects:cache.objects.map(o=>({id:o.objectId,points:o.points.map(p=>[p.x,p.y])}))};}catch{reference=null;}
   $('#xz-content').hidden=false;forms();draw();
  }catch(e){if(current===ticket){$('#xz-unavailable').hidden=false;$('#xz-unavailable').textContent=e.message;}}
  finally{if(current===ticket){working=false;controls();emit();}}return result;
 }
 async function save(){
  if(working||pending||!result)return;working=true;controls();error('');
  try{const text=serializeXZProject(result),out=await window.desktop.saveFile({kind:'project',filename:host.context().filename.replace(/\.mdl$/i,'')+'-XZ.level7.json',text});if(out?.saved)saved=text;}
  catch(e){error(e.message);}finally{working=false;controls();emit();}
 }
 async function load(){
  if(working||!result)return;if(changed()&&!confirm('فتح تجربة أخرى وترك التغييرات غير المحفوظة؟'))return;
  working=true;controls();error('');$('#xz-transfer-result').hidden=true;
  try{const file=await window.desktop.openFile();if(!file)return;const updated=await restoreXZProject(source,file.text);history.push(options(result));result=updated;saved=serializeXZProject(result);pending=false;forms();draw();}
  catch(e){error(e.message);}finally{working=false;controls();emit();}
 }
 function reset(){ticket++;source=null;result=baseline=reference=null;history=[];saved='';pending=false;working=false;modal.close();error('');$('#xz-content').hidden=true;$('#xz-transfer-result').hidden=true;controls();emit();}
 $('#xz-close').addEventListener('click',()=>modal.close());modal.addEventListener('cancel',event=>{if(working)event.preventDefault();});
 $('#xz-form').addEventListener('input',()=>{pending=true;$('#xz-transfer-result').hidden=true;controls();emit();});
 $('#xz-form').addEventListener('submit',event=>{event.preventDefault();try{void calculate(fieldOptions());}catch(e){error(e.message);}});
 $('#xz-baseline').addEventListener('change',()=>draw(false));$('#xz-fit').addEventListener('click',()=>draw());
 $('#xz-reset').addEventListener('click',()=>void calculate({}));
 $('#xz-undo').addEventListener('click',async()=>{if(working||!history.length)return;const previous=history.at(-1);await calculate(previous,{push:false});if(!pending)history.pop();controls();});
 $('#xz-save').addEventListener('click',()=>void save());$('#xz-load').addEventListener('click',()=>void load());
 async function transfer(){
  if(working||pending||!result||!validContext())throw Error('تطبيق القيم واختيار سياق الرسم مطلوبان قبل الحفظ.');working=true;controls();emit();error('');$('#xz-transfer-result').hidden=true;
  try{
   const out=await window.desktop.exportXZToMdl({bytes:serializeMdl(source),filename:host.context().filename.replace(/\.mdl$/i,'')+'-XZ-recalculate.mdl',...options(result)});
   if(out?.saved){$('#xz-transfer-result').hidden=false;$('#xz-transfer-result').textContent=`حُفظت ${out.name} وفيها ${out.changes} تغييرات. افتحها في Grafis، ثم Test run all ‏(Ctrl+Shift+6)، ثم احفظ. الرسم الكامل في النسخة لم يُحدّث بعد؛ الملف الأصلي لم يتغير.`;}return out;
  }catch(e){error(e.message);throw e;}finally{working=false;controls();emit();}
 }
 $('#xz-native').addEventListener('click',()=>void transfer().catch(()=>{}));
 $('#xz-export').addEventListener('click',async()=>{
  if(working||pending||!result)return;working=true;controls();error('');
  try{const svg=$('#xz-preview').cloneNode(true);svg.querySelector('.xz-reference')?.remove();svg.querySelectorAll('polyline').forEach(p=>{p.setAttribute('fill','none');p.setAttribute('stroke','#152f40');p.setAttribute('stroke-width','0.5');});svg.querySelectorAll('circle').forEach(p=>p.setAttribute('fill','#152f40'));const vb=svg.getAttribute('viewBox').split(' ').map(Number);svg.setAttribute('width',vb[2]+'mm');svg.setAttribute('height',vb[3]+'mm');const title=document.createElementNS(NS,'title');title.textContent='LEVEL7 CAD partial X/Z preview: 49 objects only; not a complete cutting pattern';svg.prepend(title);await window.desktop.saveFile({kind:'svg',filename:'ALAA-part002-partial-XZ.svg',text:new XMLSerializer().serializeToString(svg)});}catch(e){error(e.message);}finally{working=false;controls();emit();}
 });
 modal.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key.toLowerCase()==='s'){event.preventDefault();void save();}event.stopPropagation();});
 return {show,reset,hasUnsaved:changed,activity:()=>({working,pending}),snapshot:()=>source===host.context().document?result:null,prepare:()=>show({display:false}),
  state:()=>validContext()&&result?{result,working,pending,modified:serializeXZProject(result)!==serializeXZProject(baseline)}:null,
  subscribe:f=>listeners.add(f),transfer,
  apply:async(kind,index,value)=>{if(!validContext()||!result||pending)throw Error('طبّق القيم المعلقة في نافذة الرسم أولًا.');const next=options(result);next.xOverrides={...next.xOverrides};next.zOverrides={...next.zOverrides};if(kind==='x')next.xOverrides[index]=value;else next.zOverrides[index]=value;return calculate(next,{direct:true});}
 };
}
