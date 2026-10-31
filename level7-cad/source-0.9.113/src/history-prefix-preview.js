/** Deliberately separate from the original design: these objects are the
 * contiguous portion of history that has been independently recalculated. */
export function createHistoryPrefixPreview(){
 const dialog=document.createElement('dialog');dialog.id='history-prefix-dialog';dialog.className='native-dialog history-prefix-dialog';
 dialog.setAttribute('aria-labelledby','history-prefix-title');
 dialog.innerHTML='<div class="dialog-caption"><h1 id="history-prefix-title">معاينة الجزء المحسوب</h1><button type="button" aria-label="إغلاق">×</button></div><div class="dialog-body"><p id="history-prefix-status" dir="rtl"></p><svg id="history-prefix-canvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="الجزء المعاد حسابه من سجل البارت"></svg><p class="dialog-note" dir="rtl">تعرض المعاينة الهندسة التي استطاع المحرك حسابها. اكتمال عدد خطوات بارت واحد لا يثبت اكتمال جميع البارتات أو تطابق كل العناصر الأصلية. تتغير العناصر المحسوبة عند تطبيق X أو Z. حفظ MDL من جدول القيم ينقل المعاملات؛ تحديث التصميم الكامل ما زال يحتاج Grafis.</p></div><div class="dialog-actions"><button type="button">العودة إلى القيم</button></div>';
 document.body.append(dialog);
 for(const button of dialog.querySelectorAll('button'))button.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 return {show(result){
  const history=result?.historyCalculation,svg=dialog.querySelector('svg'),status=dialog.querySelector('#history-prefix-status');svg.replaceChildren();
  const allObjects=history?.objects??[],objects=allObjects.filter(o=>!o.hidden),curves=objects.filter(o=>o.geometryKind==='sampled-curve').length;
  status.textContent=`بارت ${result?.partId??'—'} · ${history?.throughRecord??0} / ${history?.historyRecords??0} خطوة · ${objects.length} عنصر · ${curves} منحنى محسوب. ${history?.stopped?`توقف الحساب عند الخطوة ${history.stopped.record}.`:''}`;
  svg.dataset.partId=String(result?.partId??'');svg.dataset.throughRecord=String(history?.throughRecord??0);svg.dataset.hiddenObjects=String(allObjects.length-objects.length);
  if(objects.length){
   let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
   for(const object of objects)for(const[x,y]of object.points){minX=Math.min(minX,x);minY=Math.min(minY,-y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,-y);}
   const margin=Math.max(3,Math.max(maxX-minX,maxY-minY)*.06);
   svg.setAttribute('viewBox',`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`);
   for(const object of objects){
    const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
    line.dataset.historyObjectId=object.id;line.dataset.geometryKind=object.geometryKind??'straight';
    line.setAttribute('points',object.points.map(([x,y])=>`${x},${-y}`).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',object.geometryKind==='sampled-curve'?'#56e5cf':'#d6e1eb');line.setAttribute('stroke-width','1.6');line.setAttribute('vector-effect','non-scaling-stroke');
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=`${object.id} · الخطوة ${object.record}`;line.append(title);svg.append(line);
   }
  }else{svg.setAttribute('viewBox','0 0 500 200');const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x','250');text.setAttribute('y','100');text.setAttribute('text-anchor','middle');text.setAttribute('fill','#c6d6e2');text.textContent='لا توجد هندسة محسوبة لهذا البارت بعد';svg.append(text);}
  dialog.showModal();
 }};
}
