// Presentation only. No native history, formula evaluator or MDL writer lives here.
export function createZInspectorUi(host) {
  const $=selector=>document.querySelector(selector), modal=$('#z-values-dialog');
  let source=null, sourcePart=null, sourceEncoding=null, sourceCursor=null, sourceSize=null, entries=[], selectedIndex=null, filtered=[], evidence=null, request=0;
  const cell=(row,value)=>{const td=document.createElement('td');td.textContent=String(value??'');row.append(td);return td;};
  const cleanComment=value=>{
    const full=String(value??'');
    const start=full.search(/#F\s*:/i);
    return {current:(start<0?full:full.slice(0,start)).trim(),history:start<0?'':full.slice(start).trim()};
  };
  const selected=()=>entries.find(entry=>entry.index===selectedIndex);
  const formulaFor=entry=>host.formula?.(entry)??host.workspaceState?.()?.result.zValues.find(z=>z.index===entry.index)?.formula??entry.formula;
  const currentValue=entry=>{const workspace=host.workspaceState?.();if(workspace?.modified){const z=workspace.result.zValues.find(z=>z.index===entry.index);return z&&Number.isFinite(z.value)?{displayedValue:String(Number(z.value.toFixed(5))),calculated:true}:null;}const scalar=host.parameterValues?.();if(scalar?.changed||!evidence?.eligible){const z=scalar?.rows.find(z=>z.index===entry.index);return z?.status==='calculated-unverified'?{displayedValue:String(Number(z.value.toFixed(5))),calculated:true,scalarOnly:true,measuredGeometry:z.dependsOnMeasuredGeometry}:null;}return evidence?.eligible?evidence.rows.find(row=>row.index===entry.index):null;};
  function details() {
    const entry=selected();
    $('#z-inspector-selected').textContent=entry?`Z${entry.index} · Rstep ${entry.recordStep}`:'Select a definition';
    $('#z-inspector-formula').textContent=entry?(entry.opaque?'Opaque native definition — formula unavailable':formulaFor(entry)):'';
    const value=entry&&currentValue(entry);
    $('#z-inspector-value-source').textContent=value?.calculated?`${value.displayedValue} · ${value.scalarOnly?(value.measuredGeometry?'حساب تجريبي من خطوط أُعيد بناؤها ومعادلاتها؛ المطابقة الكاملة لم تُثبت':'حساب عددي للصيغة؛ الدقة الأصلية لكل بارت لم تُثبت بعد'):'حساب جزئي مقارن مع Grafis'}. هندسة التصميم لم تُعد كاملة.`:value?`${value.displayedValue} · Native-observed F11 display · ${evidence.sizeKey} · complete record ${evidence.totalRecords}. Read-only snapshot; not recalculated here.`:entry?`Current numerical value unavailable. ${(host.workspaceState?.()?.modified||host.parameterValues?.()?.changed)?'لم تُحسب هذه القيمة بعد التعديل؛ لا تُعرض قيمة Grafis القديمة كأنها نتيجة حالية.':host.parameterValues?.()?.rows.find(r=>r.index===entry.index)?.reason||evidence?.reason||'No historical or substitute number is used.'}`:'';
    host.onSelection?.(entry);
    const comment=cleanComment(entry?.comment);
    $('#z-inspector-history').hidden=!comment.history;
    $('#z-inspector-history-text').textContent=comment.history;
    const refs=entry?.geometricReferences||[];
    $('#z-inspector-raw-text').textContent=entry?`Flags: ${typeof entry.flags==='number'?'0x'+entry.flags.toString(16):String(entry.flags??'unknown')}\nGeometric references: ${refs.length}\n${refs.map(bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(' ')).join('\n')||'None stored'}`:'';
  }
  function select(index,{focus=false,scroll=false}={}) {
    selectedIndex=index;
    for(const row of $('#z-inspector-body').rows){const selected=Number(row.dataset.zIndex)===index;row.classList.toggle('selected',selected);row.setAttribute('aria-selected',String(selected));row.tabIndex=selected?0:-1;if(selected){if(focus)row.focus({preventScroll:true});if(scroll)row.scrollIntoView({block:'nearest'});}}
    $('#z-inspector-history').open=false;$('#z-inspector-raw').open=false;details();
  }
  function renderRows() {
    const query=$('#z-inspector-search').value.trim().toLocaleLowerCase();
    filtered=entries.filter(entry=>!query||[`Z${entry.index}`,String(entry.index),entry.formula,entry.comment].some(value=>String(value??'').toLocaleLowerCase().includes(query)));
    const body=$('#z-inspector-body');body.replaceChildren();
    for(const entry of filtered){
      const row=document.createElement('tr');row.dataset.zIndex=entry.index;row.dataset.zRecordStep=entry.recordStep;row.tabIndex=-1;
      cell(row,entry.recordStep);
      const formula=cell(row,entry.opaque?`Z${entry.index} = —`:`Z${entry.index}=${formulaFor(entry)}`);formula.title=entry.formula||'';
      const comment=cell(row,cleanComment(entry.comment).current||'—');comment.dir='auto';
      const value=currentValue(entry);const number=cell(row,value?.displayedValue??'—');number.dataset.valueKind=value?.calculated?'calculated-partial':value?'native-observed':'unavailable';number.title=value?.calculated?'Partial local calculation':value?'Native-observed F11 snapshot, not evaluated here':'No verified current numerical value';
      for(const name of ['Min','Max']){const bound=cell(row,'—');bound.title=`${name}: القيمة الأصلية غير مقروءة؛ لم تُفترض قيمة.`;}
      row.addEventListener('click',()=>select(entry.index,{focus:true}));
      row.addEventListener('dblclick',()=>{select(entry.index);$('#z-inspector-edit').click();});
      row.addEventListener('keydown',event=>{
        const position=filtered.findIndex(item=>item.index===entry.index);let next;
        if(event.key==='Enter'||event.key==='F2'){event.preventDefault();$('#z-inspector-edit').click();return;}if(event.key==='ArrowDown')next=Math.min(position+1,filtered.length-1);else if(event.key==='ArrowUp')next=Math.max(0,position-1);else if(event.key==='Home')next=0;else if(event.key==='End')next=filtered.length-1;else return;
        event.preventDefault();event.stopPropagation();select(filtered[next].index,{focus:true,scroll:true});
      });body.append(row);
    }
    if(!filtered.length){const row=document.createElement('tr'),empty=cell(row,entries.length?'No matching definitions / لا توجد نتائج':'No stored Z definitions in this part / لا توجد معاملات Z في هذه القطعة');empty.colSpan=6;row.className='z-inspector-empty';body.append(row);}
    $('#z-inspector-count').textContent=`${filtered.length} / ${entries.length} definitions`;
    $('#z-inspector-clear').disabled=!query;
    if(!filtered.some(entry=>entry.index===selectedIndex))selectedIndex=filtered[0]?.index??null;
    select(selectedIndex);
  }
  function renderValuesOnly() {
    for(const row of $('#z-inspector-body').rows){const entry=entries.find(entry=>entry.index===Number(row.dataset.zIndex));if(!entry)continue;const value=currentValue(entry),number=row.cells[3];number.textContent=value?.displayedValue??'—';number.dataset.valueKind=value?.calculated?'calculated-partial':value?'native-observed':'unavailable';number.title=value?.calculated?'Partial local calculation':value?'Native-observed F11 snapshot, not evaluated here':'No verified current numerical value';}
    details();
  }
  function state() {
    const context=host.context();
    $('#z-inspector-context').textContent=`${context.sizeKey||'Unknown size'} · current size · record ${context.cursor}/${context.totalRecords}`;
    $('#z-inspector-value-status').textContent=(host.workspaceState?.()?.modified||host.parameterValues?.()?.changed)?'حساب محلي جزئي · القيم غير المحسوبة لا تُعرض':evidence?.eligible?'Native-observed / مرصودة من Grafis · الأصل قبل التعديل':host.parameterValues?.()?'حساب عددي للصيغ المتاحة · المراجع الهندسية غير المحسوبة تظهر —':'Stored definitions · current values unavailable';
  }
  function hide(){request++;modal.classList.remove('compact-z-mode');$('#z-inspector').hidden=true;}
  function render(result) {
    const context=host.context();
    const changed=source!==context.document||sourcePart!==context.partId||sourceEncoding!==context.encoding||sourceCursor!==context.cursor||sourceSize!==context.sizeKey;
    modal.classList.add('compact-z-mode');$('#z-inspector').hidden=false;
    $('#z-values-title').textContent='Z Values — native definitions';
    if(changed){source=context.document;sourcePart=context.partId;sourceEncoding=context.encoding;sourceCursor=context.cursor;sourceSize=context.sizeKey;entries=result.entries;selectedIndex=entries[0]?.index??null;evidence=null;$('#z-inspector-search').value='';renderRows();}
    state();
    // The evidence provider must authenticate the private document and exact size/record context.
    // In its absence the Current value column deliberately contains no inferred numbers.
    const ticket=++request;
    if(host.inspectCurrentValues)Promise.resolve(host.inspectCurrentValues(context)).then(next=>{
      const current=host.context();if(ticket!==request||source!==current.document||sourcePart!==current.partId||context.cursor!==current.cursor||context.sizeKey!==current.sizeKey||!modal.classList.contains('compact-z-mode'))return;
      evidence=next;state();renderValuesOnly();
    }).catch(()=>{if(ticket!==request)return;evidence=null;state();renderValuesOnly();});
    return true;
  }
  $('#z-inspector-search').addEventListener('input',renderRows);
  $('#z-inspector-clear').addEventListener('click',()=>{$('#z-inspector-search').value='';renderRows();$('#z-inspector-search').focus();});
  return Object.freeze({hide,render,refresh(){if(modal.classList.contains('compact-z-mode')){renderRows();state();}}});
}
