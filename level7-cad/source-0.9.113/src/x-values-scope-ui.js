import {standardSizeContext} from './standard-size-catalog.js';
import {resolveScalarXRows} from './native-alaa-z-scalars.mjs';
import {readNativeXValues} from './native-x-values.js';
/** Presentation only: filters native rows without merging or rewriting scopes. */
export function createXValuesScopeUi(host){
 const $=s=>document.querySelector(s),body=$('#x-values-body'),select=$('#x-values-part-select');
 let scope='local',documentRef=null,partSignature='',selectedKey=null,sizeSignature='';
 const interpolation=document.createElement('section');interpolation.id='x-interpolation-panel';interpolation.hidden=true;
 const interpolationNote=document.createElement('p');interpolationNote.dir='rtl';interpolationNote.textContent='استيفاء X للمقاسات القياسية المدعومة في 50-Werte-OPTIMASS. هذه قيم محسوبة؛ لم يُنفّذ تدريج هندسة التصميم كاملة.';
 const interpolationTable=document.createElement('table');interpolationTable.className='native-table';interpolationTable.innerHTML='<thead><tr><th>X</th><th>Size / المقاس</th><th>Value / القيمة</th><th>Method / الطريقة</th></tr></thead><tbody></tbody>';
 interpolation.append(interpolationNote,interpolationTable);$('.x-list-layout').after(interpolation);
 function refreshInterpolation(){
  const active=$('#x-values-dialog').dataset.listView==='interpolation';interpolation.hidden=!active;$('.x-list-layout').hidden=active;if(!active)return;
  const tbody=interpolationTable.tBodies[0];tbody.replaceChildren();const c=host.context(),doc=c.parameterDocument||c.document;if(!doc)return;
  const ctx=standardSizeContext(doc),index=Number($('#x-current-index').value),entries=readNativeXValues(doc,{partId:c.activePart})[scope+'Entries'].filter(e=>e.index===index);
  const keys=new Set(ctx?.sizes||[]);for(const e of entries)if(!e.isDefault){keys.add(e.sizeKey);for(const k of ctx?.keysFor(e.sizeKey)||[])keys.add(k);}for(const k of ctx?.sizes||[])for(const key of ctx.keysFor(k))keys.add(key);
  if(!keys.size){const tr=tbody.insertRow();const td=tr.insertCell();td.colSpan=4;td.textContent='لا تتوفر مقاسات قياسية معروفة لهذا النظام.';return;}
  const labels={'exact-named-assignment':'قيمة مخزنة','only-default-assignment':'افتراضي','all-stored-assignments-agree':'قيم متساوية','figure-type-default':'افتراضي لنوع المقاس','figure-type-single-assignment':'قيمة واحدة لنوع المقاس','figure-type-interpolation':'استيفاء خطي','figure-type-extrapolation':'امتداد خطي'};
  for(const sizeKey of keys){const value=resolveScalarXRows(entries,{sizeKey,scope,sizeContext:ctx})[0],tr=tbody.insertRow();tr.dataset.sizeKey=sizeKey;tr.dataset.xIndex=index;for(const text of ['X'+index,sizeKey,value?.value!==undefined?Number(value.value.toFixed(6)).toString():'غير متاح',labels[value?.method]||value?.reason||'لا توجد قيمة'])tr.insertCell().textContent=text;}
 }

 const key=r=>`${r.dataset.xScope||'local'}:${r.dataset.xIndex||r.dataset.n38XIndex}:${r.dataset.xSizeKey||''}`;
 function selectRow(row,focus=false){
  selectedKey=row?key(row):null;
  for(const r of body.rows){const selected=r===row;r.classList.toggle('x-selected',selected);r.setAttribute('aria-selected',String(selected));r.tabIndex=selected?0:-1;}
  $('#x-current-index').value=row?(row.dataset.xIndex||row.dataset.n38XIndex):'';
  $('#x-edit-entry').disabled=!row||!row.querySelector('input:not(:disabled),button:not(:disabled)');
  if(focus&&row){if($('#x-values-dialog').dataset.listView!=='interpolation'){row.focus({preventScroll:true});row.scrollIntoView({block:'nearest'});}}
  refreshInterpolation();
 }
 function refresh(){
  const c=host.context();if(c.document!==documentRef){documentRef=c.document;scope='local';partSignature='';selectedKey=null;sizeSignature='';}
  const signature=JSON.stringify(c.parts);if(signature!==partSignature){partSignature=signature;select.replaceChildren();for(const p of c.parts){const o=document.createElement('option');o.value=p.id;o.textContent=`${String(p.id).padStart(3,'0')} — ${p.name}`;select.append(o);}}
  select.value=String(c.activePart);select.disabled=scope==='global'||c.busy;
  const rowScope=r=>r.dataset.xScope||(r.dataset.n38XIndex?'local':null),rowIndex=r=>r.dataset.xIndex||r.dataset.n38XIndex;
  const rows=[...body.rows].filter(rowScope),chosen=rows.filter(r=>rowScope(r)===scope);
  const sizeSelect=$('#x-size-list'),sizes=[...new Set(chosen.map(r=>r.dataset.xSizeKey??''))],nextSizeSignature=JSON.stringify(sizes);
  if(sizeSignature!==nextSizeSignature){const previous=sizeSelect.value;sizeSignature=nextSizeSignature;sizeSelect.replaceChildren();for(const size of sizes){const o=document.createElement('option');o.value=size;o.textContent=size.trim()||'Default / افتراضي';sizeSelect.append(o);}if(sizes.includes(previous))sizeSelect.value=previous;else sizeSelect.selectedIndex=0;}
  const allSizes=$('#x-all-sizes').checked,seen=new Set();
  for(const r of body.rows){r.hidden=rows.length?!rowScope(r)||rowScope(r)!==scope||!allSizes&&(r.dataset.xSizeKey??'')!==sizeSelect.value:scope==='global';
   if(!rowScope(r)||r.cells.length!==6)continue;
   const index=rowIndex(r),group=`${rowScope(r)}:${index}`,first=!r.hidden&&!seen.has(group);if(!r.hidden)seen.add(group);
   r.classList.add('x-value-entry');r.classList.toggle('x-group-start',first);r.cells[1].textContent=`X${index}   ${r.cells[4].textContent.trim()}`;
   if(!r.dataset.listBound){r.dataset.listBound='true';r.addEventListener('click',()=>selectRow(r));r.addEventListener('focusin',()=>selectRow(r));r.addEventListener('dblclick',()=>{selectRow(r);$('#x-edit-entry').click();});r.addEventListener('keydown',event=>{if(event.target!==r)return;const visible=[...body.rows].filter(r=>!r.hidden&&r.classList.contains('x-value-entry')),i=visible.indexOf(r);let n;if(event.key==='ArrowDown')n=Math.min(i+1,visible.length-1);else if(event.key==='ArrowUp')n=Math.max(i-1,0);else if(event.key==='Home')n=0;else if(event.key==='End')n=visible.length-1;else if(event.key==='Enter'){event.preventDefault();$('#x-edit-entry').click();return;}else return;event.preventDefault();selectRow(visible[n],true);});}
  }
  selectRow(chosen.find(r=>!r.hidden&&key(r)===selectedKey)||chosen.find(r=>!r.hidden));
  for(const kind of ['global','local']){const items=rows.filter(r=>rowScope(r)===kind);$(`#x-scope-${kind}`).checked=kind===scope;$(`#x-scope-${kind}-count`).textContent=String(new Set(items.map(rowIndex)).size);}
  const label=c.parts.find(p=>p.id===c.activePart)?.name||'';
  $('#x-scope-heading').textContent=scope==='global'?'Global X · القيم العامة للتصميم':`Active part X · ${String(c.activePart).padStart(3,'0')} — ${label}`;
  $('#x-scope-description').textContent=scope==='global'?'القيم العامة مشتركة في الملف؛ اكتب القيمة ثم Enter لتطبيقها والانتقال إلى X التالي.':'تظهر مقاسات كل قيمة تحت اسمها. اكتب القيمة ثم Enter لتطبيقها والانتقال إلى X التالي للمقاس نفسه أو قيمته الافتراضية.';
  $('#x-scope-empty').hidden=chosen.length>0||rows.length===0&&scope==='local'&&body.rows.length>0;
  $('#x-scope-empty').textContent=scope==='global'?'لا توجد قيم X عامة مخزنة في هذا الملف.':'لا توجد قيم X محلية مخزنة لهذه القطعة. يمكنك عرض Global للاطلاع على القيم العامة.';
  $('#x-values-dialog').dataset.xScope=scope;
 }
 for(const kind of ['global','local'])$(`#x-scope-${kind}`).addEventListener('change',()=>{scope=kind;refresh();});
 select.addEventListener('change',()=>{host.activate(Number(select.value));refresh();});
 $('#x-size-list').addEventListener('change',()=>{$('#x-all-sizes').checked=false;refresh();});
 $('#x-all-sizes').addEventListener('change',refresh);
 const actionBar=document.createElement('div');actionBar.id='x-report-actions';
 const actionStatus=document.createElement('p');actionStatus.id='x-list-action-status';actionStatus.setAttribute('role','status');actionStatus.dir='rtl';
 $('.x-list-layout').after(actionBar,actionStatus);
 const structureActions=document.createElement('div');structureActions.id='x-table-actions';$('.x-scope-toolbar').after(structureActions,actionStatus);let tableBusy=false;
 for(const[action,label]of [['add','Add New X / إضافة X'],['delete-last','Delete Last X / حذف آخر X'],['remove-size','Remove Size / إزالة المقاس']]){const b=document.createElement('button');b.id='x-table-'+action;b.type='button';b.textContent=label;structureActions.append(b);b.addEventListener('click',async()=>{if(tableBusy)return;tableBusy=true;const r=[...body.rows].find(r=>!r.hidden&&key(r)===selectedKey);b.disabled=true;try{await host.changeTable({action,scope,index:r?Number(r.dataset.xIndex):null,sizeKey:r?.dataset.xSizeKey});refresh();actionStatus.textContent='تم تعديل الجدول؛ احفظ نسخة MDL من زر حفظ تعديلات البارتات.';}catch(e){actionStatus.textContent=e.message;}finally{b.disabled=false;tableBusy=false;}});}
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function report(){
  const title=$('#x-scope-heading').textContent;if(!interpolation.hidden)return {title,text:title+'\nCalculated interpolation / استيفاء محسوب؛ ليس تدريجًا هندسيًا\n'+[...interpolationTable.rows].map(r=>[...r.cells].map(c=>c.textContent).join('\t')).join('\n')};const lines=[title,'Displayed values / القيم المعروضة (قد تشمل إدخالًا لم يطبّق بعد)',''];
  for(const r of body.rows){if(r.hidden||!r.classList.contains('x-value-entry'))continue;const n=r.dataset.xIndex||r.dataset.n38XIndex;if(r.classList.contains('x-group-start'))lines.push('X'+n+'  '+r.cells[4].textContent.trim());lines.push('  '+(r.dataset.xSizeKey?.trim()||'Default')+' = '+(r.cells[3].querySelector('input')?.value??r.cells[3].textContent.trim()));}
  return {text:lines.join('\n'),title};
 }
 for(const [name,label]of [['copy','Copy / نسخ القائمة'],['save','Save list / حفظ القائمة'],['pdf','Print PDF / طباعة PDF']]){
  const button=document.createElement('button');button.type='button';button.id='x-list-'+name;button.textContent=label;actionBar.append(button);
  button.addEventListener('click',async()=>{const buttons=[...actionBar.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{const {text,title}=report();let result;if(name==='copy'){result=await window.desktop.copyText(text);if(result?.copied)actionStatus.textContent='نُسخت القيم المعروضة.';}
   else if(name==='save'){result=await window.desktop.saveFile({kind:'text',filename:'X-'+scope+'-values.txt',text});if(result?.saved)actionStatus.textContent='حُفظت القائمة النصية: '+result.name;}
   else{result=await window.desktop.printPdf({filename:'X-'+scope+'-values.pdf',html:'<!doctype html><html><head><meta charset="utf-8"><title>'+escape(title)+'</title><style>@page{size:A4;margin:16mm}body{font:12px Arial,sans-serif;color:#18364b}pre{font:12px/1.7 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><pre>'+escape(text)+'</pre></body></html>'});if(result?.saved)actionStatus.textContent='حُفظ ملف الطباعة: '+result.name;}
   if(!result)actionStatus.textContent='أُلغي حفظ القائمة.';
  }catch(e){actionStatus.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}});
 }
 function jump(){const control=$('#x-current-index'),index=Number(control.value),row=[...body.rows].find(r=>!r.hidden&&Number(r.dataset.xIndex||r.dataset.n38XIndex)===index);if(!Number.isInteger(index)||!row){control.setAttribute('aria-invalid','true');actionStatus.textContent='قيمة X غير موجودة في القائمة أو المقاس المعروض.';return;}control.removeAttribute('aria-invalid');actionStatus.textContent='';selectRow(row,true);}
 $('#x-current-index').addEventListener('change',jump);
 $('#x-current-index').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jump();}});
 for(const radio of document.querySelectorAll('[name="x-list-view"]'))radio.addEventListener('change',()=>{$('#x-values-dialog').dataset.listView=radio.value;refreshInterpolation();});
 $('#x-edit-entry').addEventListener('click',()=>{const row=[...body.rows].find(r=>!r.hidden&&key(r)===selectedKey),input=row?.querySelector('input:not(:disabled)');if(input){$('#x-values-dialog').dataset.listView='edit';document.querySelector('[name="x-list-view"][value="edit"]').checked=true;refreshInterpolation();input.focus();input.select();}else row?.querySelector('button:not(:disabled)')?.click();});
 // Native and N38 renderers both replace the table; keep their edit controls intact.
 new MutationObserver(refresh).observe(body,{childList:true});
 body.addEventListener('x-edit-controls-ready',()=>selectRow([...body.rows].find(r=>!r.hidden&&key(r)===selectedKey)||[...body.rows].find(r=>!r.hidden&&r.classList.contains('x-value-entry'))));
 return {refresh,selectLocal(){scope='local';refresh();}};
}
