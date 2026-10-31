import {polarSegment,parallelSegment,unequalParallelSegment,perpendicularSegment,midpoint,axisSegment,pointOnLine} from './drawing-construction.js';
export const constructionModes=['draw-polar','draw-parallel','draw-parallel-ends','draw-resize','draw-perpendicular','draw-midpoint','draw-horizontal','draw-vertical','draw-fraction','draw-distance'];
const $=s=>document.querySelector(s);
export function createConstructionUi(host){
  let origin=null,reference=null,pointer=null;
  const linked=mode=>['draw-fraction','draw-distance'].includes(mode);
  const editableReference=mode=>linked(mode)||mode==='draw-resize';
  const axis=mode=>['draw-horizontal','draw-vertical'].includes(mode);
  const owns=mode=>constructionModes.includes(mode);
  const pending=()=>!!origin||!!reference;
  const clear=()=>{origin=null;reference=null;pointer=null;$('#construction-error').textContent='';};
  const number=(id,optional=false)=>{const s=$(id).value.trim();if(optional&&!s)return null;const value=Number(s);if(!s||!Number.isFinite(value))throw Error('أدخل قيمة عددية صحيحة.');return value;};
  function position(event){const p=host.world(event),q={x:p.x,y:-p.y};if($('#drawing-grid').checked){q.x=Math.round(q.x);q.y=Math.round(q.y);}return q;}
  function candidate(){
    const mode=host.mode();if(axis(mode)&&origin&&pointer&&(mode==='draw-horizontal'?origin.x!==pointer.x:origin.y!==pointer.y))return axisSegment(origin,pointer,mode==='draw-horizontal'?'horizontal':'vertical');
    if(linked(mode)&&reference)return pointOnLine(reference,number('#construction-point-value'),{percentage:mode==='draw-fraction',fromEnd:$('#construction-from-end').checked});
    if(mode==='draw-polar'&&origin)return polarSegment(origin,number('#construction-length'),number('#construction-angle'));
    if(reference&&pointer){if(mode==='draw-parallel')return parallelSegment(reference,pointer,number('#construction-offset',true));if(mode==='draw-parallel-ends')return unequalParallelSegment(reference,number('#construction-offset-start'),number('#construction-offset-end'));if(mode==='draw-perpendicular')return perpendicularSegment(reference,pointer);}
    return null;
  }
  function controls(){
    const mode=host.mode(),active=owns(mode),enabled=host.eligible()&&!host.busy();
    $('#construction-options').hidden=!active;
    if(active)$('#n38-drawing-bindings').hidden=true;
    $('#construction-point-options').hidden=!linked(mode);$('#construction-point-unit').textContent=mode==='draw-fraction'?'%':'mm';
    $('#construction-polar-options').hidden=mode!=='draw-polar';$('#construction-parallel-options').hidden=mode!=='draw-parallel';
    $('#construction-parallel-ends-options').hidden=mode!=='draw-parallel-ends';$('#construction-resize-options').hidden=mode!=='draw-resize';
    for(const input of document.querySelectorAll('#construction-options input'))input.disabled=!enabled;
    for(const button of document.querySelectorAll('[data-parallel-distance]')){button.disabled=!enabled;button.setAttribute('aria-pressed',String(Number($('#construction-offset').value)===Number(button.dataset.parallelDistance)));}
    $('#construction-hint').textContent=linked(mode)?'أدخل المسافة أو النسبة، ثم انقر خطًا جديدًا قابلًا للتحرير. تبدأ القيمة من بداية الخط؛ اعكس الاتجاه عند الحاجة.':axis(mode)?'انقر البداية ثم النهاية؛ لا تحتاج إلى إنشاء نقطة مسبقًا.':mode==='draw-polar'?'الزاوية: 0° يمين، 90° أعلى. اختر البداية ثم انقر لتثبيت الخط.':mode==='draw-parallel'?'اختر خطًا ثم موضع النسخة. المسافة الموجبة إلى يسار اتجاه الخط.':mode==='draw-perpendicular'?'اختر خطًا ثم نقطة؛ يُسقط منها عمود على الخط أو امتداده.':'انقر خطًا لإنشاء نقطة منتصفه.';
    $('#construction-snapshot').hidden=mode==='draw-polar'||axis(mode)||linked(mode);$('#construction-linked-note').hidden=!linked(mode);
    if(mode==='draw-resize')$('#construction-hint').textContent='أدخل الطول النهائي أو مقدار الزيادة/النقصان ثم انقر الخط الجديد قرب الطرف المراد تغييره. يبقى الطرف الآخر ثابتًا. الروابط المشتركة تتبع الطرف المعدّل.';
    if(mode==='draw-parallel-ends')$('#construction-hint').textContent='اختر خطًا مستقيمًا ثم انقر لتثبيت نسخة بمسافتين عن بدايته ونهايته. النتيجة عددية ثابتة؛ لا تتبع المصدر تلقائيًا.';
    if(mode==='draw-resize')$('#construction-snapshot').hidden=true;
    for(const action of constructionModes){const button=$('[data-action="'+action+'"]');button.disabled=!enabled||(editableReference(action)?!host.linkedLines().length:action!=='draw-polar'&&!axis(action)&&!host.lines().length);}
  }
  function render(layer){
    if(!owns(host.mode()))return false;
    $('#construction-error').textContent='';
    const attrs={stroke:'#7bdfef','stroke-width':1.3,'vector-effect':'non-scaling-stroke','stroke-dasharray':'5 4','pointer-events':'none'};
    if(reference)layer.append(host.svg('line',{x1:reference.a.x,y1:-reference.a.y,x2:reference.b.x,y2:-reference.b.y,stroke:'#f8a849','stroke-width':3,'vector-effect':'non-scaling-stroke','pointer-events':'none','data-construction-reference':''}));
    try{
      const result=candidate();if(result&&linked(host.mode())){layer.append(host.svg('circle',{cx:result.x,cy:-result.y,r:3/host.scale(),fill:'#7bdfef','pointer-events':'none','data-construction-point-preview':''}));$('#drawing-measure').textContent=host.decimal(result.x)+' · '+host.decimal(result.y)+' mm';}
      else if(result){const {start:a,end:b}=result;layer.append(host.svg('line',{...attrs,x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,'data-construction-preview':''}));$('#drawing-measure').textContent=host.decimal(Math.hypot(b.x-a.x,b.y-a.y))+' mm'+(result.offset===undefined?'':' · Δ '+host.decimal(result.offset));}
      else $('#drawing-measure').textContent=host.mode()==='draw-polar'||axis(host.mode())?'اختر بداية الخط':'اختر خطًا مستقيمًا';
    }catch(error){$('#construction-error').textContent=error.message;$('#drawing-measure').textContent='';}
    return true;
  }
  async function click(event){
    if(host.busy()||!host.eligible())return;
    const mode=host.mode();pointer=position(event);
    try{
      if(axis(mode)&&!origin){origin=pointer;host.redraw();return;}
      if(mode==='draw-polar'&&!origin){number('#construction-length');number('#construction-angle');origin=pointer;candidate();host.redraw();return;}
      if(mode!=='draw-polar'&&!axis(mode)&&!reference){
        const target=event.target.closest('[data-line-id],[data-reference-line-id]'),id=Number(target?.dataset.lineId??target?.dataset.referenceLineId),line=(editableReference(mode)?host.linkedLines():host.lines()).find(l=>(l.id??l.objectId)===id);
        if(!line){host.status('اختر خطًا مستقيمًا ظاهرًا في البارت.');return;}
        reference={id:line.id??line.objectId,a:{...line.a},b:{...line.b}};
        if(mode==='draw-resize'){
          const fromStart=Math.hypot(pointer.x-line.a.x,pointer.y-line.a.y)<Math.hypot(pointer.x-line.b.x,pointer.y-line.b.y);
          const saved=await host.resizeLine({objectId:reference.id,value:number('#construction-resize-value'),by:$('#construction-resize-by').checked,fromStart});
          clear();host.select('line',saved.lineId);host.status('حُفظ طول الخط مع بقاء معرفاته وحساب النقاط المرتبطة به.');host.redraw();return;
        }
        if(linked(mode)){candidate();const saved=await host.linkedPoint({lineId:reference.id,type:mode==='draw-fraction'?'fraction':'distance',value:number('#construction-point-value')/(mode==='draw-fraction'?100:1),fromEnd:$('#construction-from-end').checked});clear();host.select('point',saved.pointId);host.status('حُفظت النقطة مع ارتباطها بالخط؛ تتحرك عند تعديل نقاط الخط المصدر.');host.redraw();return;}
        if(mode==='draw-midpoint'){
          const p=midpoint(reference),existing=host.points().find(q=>q.x===p.x&&q.y===p.y);
          if(existing){host.select('point',existing.id??existing.objectId);clear();host.status('نقطة المنتصف موجودة بالفعل؛ لم تُكرر.');host.redraw();return;}
          const result=await host.point(p);clear();host.select('point',result.pointId);host.status('أُنشئت نقطة منتصف عددية.');host.redraw();return;
        }
        pointer=null;host.status(mode==='draw-parallel'?'حدد موضع النسخة الموازية، أو أدخل المسافة ثم انقر.':'اختر نقطة إسقاط العمود.');host.redraw();return;
      }
      const result=candidate();if(!result)return;
      const saved=await host.segment(result.start,result.end);clear();host.select('line',saved.lineId);host.status('حُفظ خط بإحداثيات عددية؛ يمكنك التراجع عنه.');host.redraw();
    }catch(error){if(editableReference(mode))reference=null;$('#construction-error').textContent=error.message;host.notice(error.message,true);}
  }
  function move(event){if(host.busy())return;pointer=position(event);host.redraw();}
  for(const button of document.querySelectorAll('[data-parallel-distance]'))button.addEventListener('click',()=>{if(host.busy()||!host.eligible())return;$('#construction-offset').value=button.dataset.parallelDistance;controls();host.redraw();});
  for(const input of document.querySelectorAll('#construction-options input'))input.addEventListener('input',()=>{if(!host.busy()){controls();host.redraw();}});
  return{owns,pending,clear,controls,render,click,move};
}
