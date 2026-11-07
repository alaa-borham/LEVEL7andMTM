import {inspectOriginalPartName,renameOriginalPart} from './original-part-name.mjs';
import {inspectOwnedParts,changeOwnedParts} from './native-owned-parts.js';
export function createOwnedPartsUi(host){
 const bar=document.createElement('div');bar.id='part-operations';bar.setAttribute('aria-label','إدارة البارتس');
 const labels={add:'＋ إضافة',insert:'إدراج قبل',duplicate:'نسخ البارت',rename:'تسمية',up:'↑ لأعلى',down:'↓ لأسفل',delete:'حذف البارت'};
 const icons={add:'M12 5v14M5 12h14',insert:'M4 5h16M4 11h16v10H4zM12 1v7M9 4l3-3 3 3',duplicate:'M8 8h12v13H8zM16 8V3H3v14h5',rename:'m5 16-1 5 5-1L21 8l-4-4zM14 7l4 4M4 21h16',up:'M12 20V4M6 10l6-6 6 6',down:'M12 4v16M6 14l6 6 6-6',delete:'M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 10v7M14 10v7'};
 const descriptions={add:'إضافة بارت',insert:'إدراج بارت قبل البارت النشط',duplicate:'نسخ البارت',rename:'إعادة تسمية البارت',up:'تحريك البارت لأعلى',down:'تحريك البارت لأسفل',delete:'حذف البارت'};
 for(const[action,label]of Object.entries(labels)){const b=document.createElement('button');b.type='button';b.id='part-'+action;b.title=descriptions[action];b.setAttribute('aria-label',descriptions[action]);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icons[action]);svg.append(path);b.append(svg);b.disabled=true;bar.append(b);b.addEventListener('click',()=>open(action));}
 const note=document.createElement('small');note.id='part-operations-note';note.dir='rtl';note.style.cssText='grid-column:1/-1;line-height:1.4;color:var(--text-muted,#547086)';bar.append(note);document.querySelector('.parts-visibility-bar').after(bar);
 const dialog=document.createElement('dialog');dialog.id='part-operation-dialog';dialog.style.cssText='max-width:440px;width:calc(100% - 40px);padding:20px';dialog.innerHTML='<form><h3 id="part-operation-title"></h3><p id="part-operation-description" dir="rtl"></p><label id="part-operation-name-label">اسم البارت<input id="part-operation-name" maxlength="23" autocomplete="off" /></label><p id="part-operation-error" role="alert" dir="rtl"></p><div class="dialog-actions"><button type="button" id="part-operation-cancel">إلغاء</button><button type="submit" id="part-operation-apply">تطبيق</button></div></form>';document.body.append(dialog);
 const $=s=>dialog.querySelector(s),checks=new WeakMap();let operation=null;
 function render(){const c=host.context();let cap=c.document?checks.get(c.document):null;if(c.document&&!cap){const doc=c.document;checks.set(doc,{pending:true});inspectOwnedParts(doc).then(result=>{checks.set(doc,result);if(host.context().document===doc)render();});cap={pending:true};}
 const allowed=cap?.eligible&&!c.busy&&c.complete;const rename=c.document&&!c.busy&&c.complete&&inspectOriginalPartName(c.document,{partId:c.partId}).eligible;
 for(const action of Object.keys(labels))bar.querySelector('#part-'+action).disabled=!(action==='rename'?rename:allowed)||(action==='up'&&c.partId===1)||(action==='down'&&c.partId===cap?.count)||(action==='delete'&&cap?.count===1)||(['add','insert','duplicate'].includes(action)&&cap?.count===99);
 note.textContent=!c.document?'':cap?.pending?'فحص البارتس…':cap?.eligible?'بارتس مستقلة · إضافة ونسخ وترتيب وحفظ MDL':rename?'تسمية البارت مع تحديث النصوص المرتبطة.':'إدارة البارتس متاحة للرسومات الجديدة N38 المدعومة. علاقات البارتس في هذا الملف غير مدعومة بعد.';
 }
 async function add(){
  const c=host.context();if(c.busy||bar.querySelector('#part-add').disabled)return;
  host.busy(true);
  try{
   const result=await changeOwnedParts(c.document,{action:'add',partId:c.partId});
   if(host.context().document!==c.document||host.context().partId!==c.partId)throw Error('تغير المستند؛ أعد إضافة البارت.');
   host.commit(result.document,result.partId,labels.add);
  }catch(error){host.error(error.message);}
  finally{host.busy(false);render();}
 }
 function open(action){const c=host.context();if(bar.querySelector('#part-'+action).disabled)return;if(action==='add'){void add();return;}operation={...c,action};$('#part-operation-title').textContent=labels[action];const named=['insert','duplicate','rename'].includes(action);$('#part-operation-name-label').hidden=!named;$('#part-operation-name').value=action==='rename'||action==='duplicate'?c.name:'Part '+((checks.get(c.document)?.count||0)+1);$('#part-operation-description').textContent=action==='delete'?'سيُحذف البارت النشط ورسمه من المستند. يمكنك التراجع قبل إغلاق الملف.':action==='up'||action==='down'?'يتغير ترتيب البارت وترقيمه في ملف MDL، وتبقى رسوماته ومعاملاته معه.':action==='rename'?'اسم حتى 23 حرفًا لاتينيًا أو رقمًا؛ تحتفظ القطعة بمعرّفها وروابطها وتُحدّث النصوص المرتبطة بها.':'اسم حتى 23 حرفًا لاتينيًا أو رقمًا. البارت المنسوخ مستقل عن الأصل.';$('#part-operation-error').textContent='';dialog.showModal();if(named)$('#part-operation-name').select();}
 $('#part-operation-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{operation=null;});dialog.addEventListener('submit',async e=>{e.preventDefault();const op=operation;if(!op||host.context().busy)return;host.busy(true);$('#part-operation-apply').disabled=true;try{const result=op.action==='rename'?renameOriginalPart(op.document,{partId:op.partId,name:$('#part-operation-name').value.trim()}):await changeOwnedParts(op.document,{action:op.action,partId:op.partId,name:$('#part-operation-name').value.trim()});if(host.context().document!==op.document||host.context().partId!==op.partId||!dialog.open)throw Error('تغير المستند؛ أعد اختيار العملية.');host.commit(result.document,result.partId,labels[op.action]);dialog.close();}catch(error){$('#part-operation-error').textContent=error.message;}finally{host.busy(false);$('#part-operation-apply').disabled=false;render();}});
 return{render};
}
