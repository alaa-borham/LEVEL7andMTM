import {createPartParameterSession} from './part-parameter-session.js';
import {parameterKey,canEditNativeScalarEntry} from './native-parameter-transfer.js';
import {serializeMdl} from './native-mdl.js';
import {createHistoryPrefixPreview} from './history-prefix-preview.js';
import {createZFormulaAssistant} from './z-formula-assistant.js';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
export function createXZTableEditing({workspace,refreshZ,context,applyVerified}) {
 const $=s=>document.querySelector(s),drafts=new Map(),session=createPartParameterSession();let selected=null,editing=null,saving=false,saved='';
 const historyPreview=createHistoryPrefixPreview();
 const banner=document.createElement('p');banner.id='parameter-pending-banner';banner.dir='rtl';banner.hidden=true;$('#canvas-frame').prepend(banner);
 const scope='التحرير متاح لجداول X وصيغ Z الحسابية المقروءة في كل بارت. القيم العامة مشتركة بين القطع، وكل صف مقاس مستقل. يُعاد حساب الرسم والبارتات التابعة عند اكتمال دعم سجلها. للجداول الأخرى استخدم مسار حفظ المعاملات وإعادة الحساب في Grafis.';
 function workspaceEdits(){const r=workspace.snapshot();if(!r)return[];return [...Object.entries(r.xOverrides).map(([index,value])=>({kind:'X',scope:'local',partId:2,sizeKey:'__HN40_0',index:Number(index),value})),...Object.entries(r.zOverrides).map(([index,formula])=>({kind:'Z',partId:2,index:Number(index),formula}))];}
 function allEdits(){const map=new Map(workspaceEdits().map(p=>[parameterKey(p),p]));for(const p of session.list())map.set(parameterKey(p),p);return [...map.values()];}
 function calculated(){const c=context();try{return session.values(c.document,c.partId,c.sizeKey,workspaceEdits());}catch{return null;}}
 const status=(kind,message)=>{$(`#${kind}-direct-status`).textContent=message;};
 for(const kind of ['x','z']){
  const modal=$(`#${kind}-values-dialog`),note=document.createElement('p');note.className='xz-table-note';note.id=`${kind}-direct-note`;note.dir='rtl';note.hidden=true;note.textContent=scope;modal.querySelector('.dialog-actions').before(note);
  const progress=document.createElement('p');progress.id=`${kind}-calculation-progress`;progress.className='xz-table-note';progress.dir='rtl';modal.querySelector('.dialog-actions').before(progress);
  const preview=document.createElement('button');preview.type='button';preview.id=`${kind}-history-preview`;preview.textContent='معاينة الجزء المحسوب';preview.addEventListener('click',()=>historyPreview.show(calculated()));modal.querySelector('.dialog-actions').prepend(preview);
  const output=document.createElement('p');output.id=`${kind}-direct-status`;output.className='xz-table-status';output.dir='rtl';output.setAttribute('role','status');modal.querySelector('.dialog-actions').before(output);
  const save=document.createElement('button');save.type='button';save.id=`${kind}-direct-save`;save.textContent='حفظ تعديلات البارتات في MDL';save.hidden=true;modal.querySelector('.dialog-actions').prepend(save);
  save.addEventListener('click',()=>void savePending(kind).catch(()=>{}));
  modal.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key.toLowerCase()==='s'){event.preventDefault();save.click();}event.stopPropagation();});
 }
 async function savePending(kind='x'){
  try{if(drafts.size)throw Error('طبّق أو ألغِ التعديلات المعلقة أولًا.');if(saving)return null;if(workspace.activity().working||workspace.activity().pending)throw Error('انتظر انتهاء حساب المعاملات وطبّق الإدخال المعلق أولًا.');const edits=allEdits();if(!edits.length)return null;saving=true;buttons();const c=context(),out=await window.desktop.exportParametersToMdl({bytes:serializeMdl(c.document),filename:c.filename.replace(/\.mdl$/i,'')+'-parameters.mdl',edits});if(out?.saved){saved=JSON.stringify(edits);for(const k of ['x','z'])status(k,`حُفظت ${out.name} (${out.changes} تعديلات). افتح النسخة في Grafis ثم Test run all (Ctrl+Shift+6) واحفظ لإعادة حساب التصميم الكامل.`);}return out;
  }catch(e){status(kind,e.message);throw e;}finally{saving=false;buttons();}
 }
 const form=document.createElement('form');form.id='z-direct-form';form.className='xz-table-editor';form.hidden=true;
 form.innerHTML='<label for="z-direct-formula">Formula / الصيغة</label><input id="z-direct-formula" maxlength="256" required spellcheck="false"><button type="submit">تطبيق</button><button type="button" id="z-direct-cancel">إلغاء</button>';
 $('#z-inspector-formula').after(form);
 const assistant=createZFormulaAssistant({readX:scope=>readNativeXValues(session.materialize(context().document,workspaceEdits()),{partId:context().partId,encoding:'windows-1256'})[scope==='global'?'globalEntries':'localEntries'],readZ:()=>readNativeZValues(context().document,{partId:context().partId,encoding:'windows-1256'}).entries}),assistantButton=document.createElement('button');assistantButton.type='button';assistantButton.id='z-formula-assistant-open';assistantButton.textContent='ƒ / مساعد المعادلات';assistantButton.disabled=true;$('#z-inspector-edit').before(assistantButton);
 assistantButton.addEventListener('click',()=>{if(!selected||assistantButton.disabled)return;$('#z-inspector-edit').click();assistant.show($('#z-direct-formula'),`Z${selected.index} =`);});
 function buttons(){const state=workspace.activity(),available=!!context().document;const c=available?calculated():null;const count=c?.rows.filter(r=>r.status==='calculated-unverified').length??0;const history=c?.historyCalculation;const summary=c?`بارت ${c.partId}: حُسبت ${count} من ${c.rows.length} قيم Z. ${history?.historyRecords?`تنفيذ الرسم ${history.throughRecord} / ${history.historyRecords} خطوة؛ ${history.stopped?history.stopped.dependencyChain?.length?`ينتظر اكتمال البارتات المصدر: ${history.stopped.dependencyChain.map(d=>`بارت ${d.partId}${d.record?` عند الخطوة ${d.record}`:''}`).join(' ← ')}.`:'توقف عند أمر يحتاج دعمًا إضافيًا.':'التحقق من مطابقة الرسم الكامل لم يكتمل.'}`:'لا يوجد سجل رسم قابل للتنفيذ هنا.'} ${history?.historyFullyExecuted?'سجل رسم البارت مكتمل الدعم.':'حساب التصميم الكامل غير مكتمل.'}`:'';for(const k of ['x','z'])$(`#${k}-calculation-progress`).textContent=summary;for(const kind of ['x','z']){const save=$(`#${kind}-direct-save`);save.hidden=!available;save.disabled=saving||state?.working||state?.pending||!allEdits().length||drafts.size>0;$(`#${kind}-direct-note`).hidden=!available;}for(const button of document.querySelectorAll('[data-direct-apply],#z-direct-form button'))button.disabled=saving||!!state?.working;}
 async function apply(p,value){const kind=p.kind.toLowerCase();try{if(String(value).trim()==='')throw Error('أدخل قيمة أولًا.');p={...p,...(p.kind==='X'?{value:Number(value)}:{formula:value.trim()})};const c=context();if(p.partId!==c.partId)throw Error('تغير البارت أثناء التحرير.');
  if(applyVerified&&!session.modified&&!workspaceEdits().length&&drafts.size<=1){const key=parameterKey(p),draft=drafts.get(key);drafts.delete(key);try{if(await applyVerified(p)){if(p.kind==='Z')editing=null;status(kind,'طُبّق تعديل X/Z وأُعيد حساب الهندسة والبارتات التابعة؛ استخدم حفظ التصميم العادي.');sync();return true;}}catch(error){if(draft!==undefined)drafts.set(key,draft);throw error;}}
  const state=workspace.state(),localPreview=!session.modified&&state&&(p.kind==='X'?p.scope==='local'&&p.sizeKey==='__HN40_0'&&[3,4,7,15].includes(p.index):p.index>=33&&p.index<=50);
  if(localPreview)await workspace.apply(kind,p.index,p.kind==='X'?p.value:p.formula);else session.apply(c.document,p);
  drafts.delete(parameterKey(p));if(p.kind==='Z')editing=null;status(kind,'طُبّق التعديل على معاملات البارت. الحساب الهندسي الكامل يحتاج Grafis؛ استخدم «حفظ تعديلات البارتات في MDL».');sync();return true;
 }catch(e){status(kind,`لم يُطبق التعديل: ${e.message}`);buttons();return false;}}
 let advancingX=false;
 async function applyXAndAdvance(p,input){
  if(advancingX||saving||workspace.activity().working)return;advancingX=true;
  const document=context().document;
  try{
   if(!await apply(p,input.value)){input.focus();input.select();return;}
   if(context().document!==document||context().partId!==p.partId||!$('#x-values-dialog').open||!$(`#x-scope-${p.scope}`)?.checked)return;
   const rows=[...$('#x-values-body').rows].filter(r=>!r.hidden&&r.dataset.xScope===p.scope&&Number(r.dataset.xIndex)>p.index&&r.querySelector('input:not(:disabled)'));
   const indices=[...new Set(rows.map(r=>Number(r.dataset.xIndex)))].sort((a,b)=>a-b);
   let next;
   for(const index of indices){const entries=rows.filter(r=>Number(r.dataset.xIndex)===index);next=entries.find(r=>r.dataset.xSizeKey===p.sizeKey)||entries.find(r=>!r.dataset.xSizeKey.trim());if(next)break;}
   const target=next?.querySelector('input')||input;if(target.isConnected){target.focus({preventScroll:true});target.select();target.closest('tr')?.scrollIntoView({block:'nearest'});}
  }finally{advancingX=false;}
 }
 function enhanceX(){
  const c=context(),computed=calculated();if(!computed)return;const state=workspace.state(),changes=new Map(allEdits().map(p=>[parameterKey(p),p]));
  $('#x-values-readonly-note').hidden=true;$('#x-values-edit-note').hidden=true;$('#x-values-warnings').textContent=scope;
  for(const row of $('#x-values-body').rows){if(!row.dataset.xScope)continue;const p={kind:'X',partId:c.partId,scope:row.dataset.xScope,index:Number(row.dataset.xIndex),sizeKey:row.dataset.xSizeKey},key=parameterKey(p);let input=row.querySelector('input');
   if(!input){const original=Number(row.cells[3].textContent);input=document.createElement('input');input.type='number';input.step='any';input.dataset.directX=p.index;input.dataset.original=original;input.setAttribute('aria-label',`Edit ${p.scope} X${p.index} ${p.sizeKey.trim()||'default'} part ${p.partId}`);input.title='اكتب القيمة ثم Enter لتطبيقها والانتقال إلى X التالي';row.cells[3].replaceChildren(input);const button=document.createElement('button');button.type='button';button.dataset.directApply=p.index;button.textContent='تطبيق';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='إلغاء';cancel.addEventListener('click',()=>{drafts.delete(key);sync();});row.cells[5].replaceChildren(button,cancel);input.addEventListener('input',()=>{drafts.set(key,input.value);buttons();});button.addEventListener('click',()=>void apply(p,input.value));input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!e.repeat)void applyXAndAdvance(p,input);}});}
   input.value=drafts.get(key)??String(changes.get(key)?.value??input.dataset.original);input.disabled=saving||!!state?.working;
  }buttons();$('#x-values-body').dispatchEvent(new Event('x-edit-controls-ready'));
 }
 function selection(entry){selected=entry;const c=context(),state=workspace.state(),enabled=!!c.document&&canEditNativeScalarEntry(entry);
  $('#z-inspector-edit').disabled=!enabled||saving||!!state?.working||!!state?.pending;$('#z-inspector-edit').title=enabled?'تعديل الصيغة لهذا البارت':'التعريف الهندسي أو غير المفكوك لا يُحرّر كصيغة حسابية';
  assistantButton.disabled=$('#z-inspector-edit').disabled;
  $('#z-inspector-edit-reason').textContent=enabled?'عدّل الصيغة هنا. يعاد حساب الرسم والبارتات التابعة المدعومة مباشرة؛ وتبقى الجداول الأخرى ضمن مسار حفظ المعاملات.':'هذا التعريف مرتبط بمراجع هندسية أو تخزين غير مدعوم للتحرير؛ لا يُستبدل برقم.';
  form.hidden=!(enabled&&editing===parameterKey({kind:'Z',partId:c.partId,index:entry.index}));if(!form.hidden){$('#z-direct-formula').value=drafts.get(editing)??formula(entry);$('#z-direct-formula').disabled=saving||!!state?.working;}buttons();
 }
 function formula(entry){const c=context();return allEdits().find(p=>p.kind==='Z'&&p.partId===c.partId&&p.index===entry.index)?.formula??entry.formula;}
 $('#z-inspector-edit').addEventListener('click',()=>{if(!selected||$('#z-inspector-edit').disabled)return;editing=parameterKey({kind:'Z',partId:context().partId,index:selected.index});selection(selected);$('#z-direct-formula').focus();});
 $('#z-direct-formula').addEventListener('input',()=>{drafts.set(editing,$('#z-direct-formula').value);buttons();});
 $('#z-direct-cancel').addEventListener('click',()=>{drafts.delete(editing);editing=null;selection(selected);});
 form.addEventListener('submit',event=>{event.preventDefault();void apply({kind:'Z',partId:context().partId,index:selected.index},$('#z-direct-formula').value);});
 function sync(){banner.hidden=!allEdits().length;banner.textContent='توجد تعديلات X/Z. الرسم الرئيسي هو الأصل قبل التعديل؛ احفظ نسخة من جدول القيم وأعد حسابها في Grafis لرؤية التصميم الكامل المحدّث.';enhanceX();refreshZ();selection(selected);buttons();}
 workspace.subscribe(sync);
 return {selection,formula,calculated,savePending,hasPending:()=>drafts.size>0||allEdits().length>0||workspace.activity().pending||workspace.activity().working,
  document:()=>context().document?session.materialize(context().document,workspaceEdits()):null,
  async changeTable(operation){if(drafts.size||saving||workspace.activity().working||workspace.activity().pending)throw Error('طبّق أو ألغِ الإدخال المعلق أولًا.');if(workspaceEdits().length)throw Error('احفظ تجربة X/Z وأعد فتح النسخة قبل تغيير بنية الجدول.');session.changeTable(context().document,{...operation,partId:context().partId});status('x','تم تعديل جدول X. استخدم حفظ تعديلات البارتات في MDL؛ هندسة التصميم لم تُعد حسابها كاملة.');},
  hasGeneralChanges:()=>session.modified,
  async prepare(){session.attach(context().document);await workspace.prepare();sync();},
  hasUnsaved:()=>drafts.size>0||JSON.stringify(allEdits())!==(saved||'[]'),
  reset(){banner.hidden=true;session.reset();drafts.clear();editing=null;selected=null;saved='';for(const k of ['x','z'])status(k,'');buttons();}};
}
