import {appendOriginalLinkedPoint} from './original-linked-point.mjs';
import {inspectOriginalPaths,offsetOriginalPath} from './original-geometry-edit.mjs';
const $=s=>document.querySelector(s);
export function createOriginalGeometryUi(host){
 let opened=null,paths=[];
 const current=()=>{const c=host.context();return opened&&c.document===opened.document&&c.partId===opened.partId&&c.full&&!c.busy;};
 function error(message){$('#original-path-error').textContent=message;}
 function operation(){const point=$('#original-path-operation').value!=='offset';$('#original-path-intro').textContent=point?'إنشاء نقطة بنسبة أو مسافة على الأصل، مع بقاء ارتباطها به عند التعديل.':'إزاحة الأصل مع بقاء هويته وإعادة حساب البارتات التابعة المدعومة.';$('#original-offset-fields').hidden=point;$('#original-linked-point-fields').hidden=!point;$('#original-linked-unit').textContent=$('#original-path-operation').value==='fraction'?'النسبة (%)':'المسافة (مم)';error('');}
 $('#original-path-operation').addEventListener('change',operation);
 function refresh(){const c=host.context();$('#original-path-command').disabled=!c.document||!c.full||c.busy;}
 function open(id){const c=host.context();if(!c.document||!c.full||c.busy)return;
  const result=inspectOriginalPaths(c.document,c);if(!result.eligible||!result.paths.length){host.notice(result.reason||'لا توجد خطوط أصلية مدعومة للتحرير في هذا البارت.',true);return;}
  if(id!==undefined&&!result.paths.some(p=>p.id===id)){host.notice('العنصر المحدد غير مدعوم بهذه الأداة؛ لم يتم اختيار عنصر بديل.',true);return;}
  paths=result.paths;opened=c;const select=$('#original-path-select');select.replaceChildren();paths.forEach((p,i)=>{const option=document.createElement('option');option.value=p.id;option.textContent=(p.curve?'منحنى ':'خط ')+(i+1);select.append(option);});
  if(paths.some(p=>p.id===id))select.value=id;
  $('#original-path-operation').value='offset';operation();$('#original-linked-value').value='50';$('#original-linked-from-end').checked=false;$('#original-offset-start').value='1';$('#original-offset-end').value='1';error('');host.dialog('original-path-dialog');$('#original-offset-start').select();
 }
 $('#original-path-command').addEventListener('click',e=>{e.stopPropagation();open();});
 $('#original-path-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!current())return;const c=opened;
  try{
   const numeric=id=>{const t=$(id).value.trim(),n=Number(t);if(!t||!Number.isFinite(n))throw Error('أدخل قيمة عددية صحيحة.');return n;};
   const mode=$('#original-path-operation').value,objectId=Number($('#original-path-select').value),args=mode==='offset'?{startOffset:numeric('#original-offset-start'),endOffset:numeric('#original-offset-end')}:{type:mode,value:numeric('#original-linked-value')/(mode==='fraction'?100:1),fromEnd:$('#original-linked-from-end').checked};host.busy(true);await new Promise(requestAnimationFrame);
   const result=(mode==='offset'?offsetOriginalPath:appendOriginalLinkedPoint)(c.document,{...c,objectId,...args});
   const now=host.context();if(!$('#original-path-dialog').open||now.document!==c.document||now.partId!==c.partId)throw Error('تغير الملف أو البارت أو أُغلقت نافذة التحرير؛ لم يُطبّق التعديل.');
   host.commit(result.document,mode==='offset'?'Edited original path and recalculated linked parts':'Created point linked to original path');$('#original-path-dialog').close();opened=null;
   host.notice((mode==='offset'?'طُبّق تعديل الأصل':'أُنشئت نقطة مرتبطة بالأصل')+' مع حساب البارتات المتغيرة: '+result.changedPartIds.map(n=>String(n).padStart(3,'0')).join('، ')+'. استخدم حفظ باسم لحفظ نسخة MDL.',false);
  }catch(e){error(e.message);}finally{host.busy(false);}
 });
 $('#original-path-dialog').addEventListener('cancel',e=>{if(host.context().busy)e.preventDefault();});
 $('#original-path-dialog').addEventListener('close',()=>{opened=null;});
 return{refresh,open};
}
