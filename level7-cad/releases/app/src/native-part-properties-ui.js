// WORK ONLY read-only manager. Selection/activation changes the viewport, never native bytes.
import {readNativePartProperties} from './native-part-properties.js';
import {inspectProductionProperties,updateProductionProperties,MATERIALS,CATEGORIES} from './native-production-properties.js';
const $=selector=>document.querySelector(selector);
const labels=[['partType','Part type · Draft / Production'],['markerExport','Marker and export'],['stitchPart','Stitch part'],['material','Material'],['normalAmount','Amount · normal'],['mirroredAmount','Amount · mirrored'],['totalAmount','Total per style'],['category','Part category'],['lastEdit','Last edit'],['sourceStyle','Source style'],['parentRelationships','Parent / dependency part IDs'],['locked','Locked state']];
const text=(node,value)=>node.textContent=String(value??'—');
const displayCount=field=>field.status==='known'?field.value:'—';

export function createPartPropertiesUi(host){
 let document=null,snapshot=null,selectedPart=null,filter='';
 const dialog=$('#part-properties-dialog'),body=$('#part-properties-body');
 function selected(){return snapshot?.parts.find(part=>part.partId===selectedPart)||null;}
 function partLabel(part){return `${String(part.partId).padStart(3,'0')} — ${part.name??'Name unavailable'}`;}
 function field(list,label,value,source=''){
  const dt=documentElement('dt',label),dd=documentElement('dd',value);if(source){dd.title=source;dd.dataset.source=source;}list.append(dt,dd);
 }
 function documentElement(tag,value){const element=globalThis.document.createElement(tag);element.textContent=String(value??'—');return element;}
 function updateRows(){for(const row of body.querySelectorAll('[data-manager-part-id]')){const id=Number(row.dataset.managerPartId);row.classList.toggle('selected',id===selectedPart);row.classList.toggle('active-part-row',id===host.context().activePart);row.setAttribute('aria-selected',String(id===selectedPart));row.tabIndex=id===selectedPart?0:-1;}}
 function productionControls(){
  const available=!!document&&inspectProductionProperties(document,selectedPart).eligible,enabled=available&&!host.context().busy,production=$('#production-part').checked;
  $('#production-flags').disabled=!enabled;
  for(const key of ['marker','stitch','material','normal','mirrored'])$('#production-'+key).disabled=!enabled||!production;
  $('#production-category').disabled=!enabled;$('#production-apply').disabled=!enabled;
  $('#production-total').value=production?String(Number($('#production-normal').value)+Number($('#production-mirrored').value)):'';
 }
 function renderProduction(){
  const p=inspectProductionProperties(document,selectedPart),known=p.eligible;
  $('#production-note').textContent=known?'تُحفظ الخصائص في ملف MDL عند الحفظ. لا تتضمن هذه العملية فحصًا آليًا لصلاحية حدود القص.':p.reason;
  $('#production-draft').checked=known&&!p.production;$('#production-part').checked=known&&p.production;
  $('#production-marker').checked=known&&p.markerExport;$('#production-stitch').checked=known&&p.stitchPart;
  $('#production-normal').value=known?(p.normal??''):'';$('#production-mirrored').value=known?(p.mirrored??''):'';
  const material=$('#production-material');material.replaceChildren();for(const[code,label]of Object.entries(MATERIALS)){const option=documentElement('option',label?code+' · '+label:'(not defined)');option.value=code;material.append(option);}if(known&&!Object.hasOwn(MATERIALS,p.materialCode)){const option=documentElement('option',p.materialCode+' · '+p.material);option.value=p.materialCode;material.append(option);}material.value=known?p.materialCode:' ';
  const category=$('#production-category');category.replaceChildren();for(const[id,label]of Object.entries(CATEGORIES)){const option=documentElement('option',label||'(not defined)');option.value=id;category.append(option);}if(known&&p.categoryId!==null&&!Object.hasOwn(CATEGORIES,p.categoryId)){const option=documentElement('option',p.category);option.value=p.categoryId;category.append(option);}category.value=known?String(p.categoryId??''):'';
  $('#production-date').value=known?(p.lastEdit||'غير متاح'):'';productionControls();
 }
 function renderDetails(){
  const part=selected(),known=$('#part-properties-known'),unknown=$('#part-properties-unavailable');known.replaceChildren();unknown.replaceChildren();
  $('#part-properties-activate').disabled=!part||host.context().busy;
  for(const kind of ['x','z'])$('#part-properties-'+kind).disabled=!part||host.context().busy;
  if(!part){text($('#part-properties-selected'),'No part selected');return;}
  text($('#part-properties-selected'),partLabel(part));renderProduction();
  field(known,'Part number',String(part.partId).padStart(3,'0'),'Native part block/list number');
  field(known,'Part name',part.name??'Unavailable',part.nameSource||'Native name unavailable');
  if(part.summaryName!==null&&part.summaryName!==part.name)field(known,'#TLIST name',part.summaryName,'Preserved separately because names differ');
  field(known,'RS · construction records',displayCount(part.history),part.history.source||part.history.reason);
  field(known,'Obj · stored objects',displayCount(part.objects),part.objects.source||part.objects.reason);
  field(known,'Mother-part list marker',part.mother.status==='known'?(part.mother.value?'Yes · *':'No marker'):'Unavailable',part.mother.source||part.mother.reason);
  field(known,'Persistent native ID',part.persistentId??'Unavailable','#TLIST persistentID; retained without modification');
  field(known,'Base size',snapshot.referenceSize??'Unavailable','Native base-size metadata');
  for(const[key,label]of labels){const info=part.fields[key];field(unknown,label,info.status==='known'?(info.value??'—'):'Unavailable / غير متاح',info.source||info.reason);}
  text($('#part-properties-warnings'),part.warnings.length?part.warnings.join('\n'):'Verified name/count fields are shown read-only. A mother marker does not identify the parent part IDs.');
  const svg=$('#part-properties-preview');svg.replaceChildren();
  const info=host.preview(svg,part.partId);
  text($('#part-properties-preview-caption'),info?.caption||part.preview.reason||'No stored geometry preview.');
  text($('#part-properties-source'),`Opened file: ${host.context().filename}\n${part.history.source||part.history.reason}\n${part.objects.source||part.objects.reason}`);
 }
 function choose(id,focus=false){if(!snapshot.parts.some(part=>part.partId===id))return;selectedPart=id;updateRows();renderDetails();if(focus)body.querySelector(`[data-manager-part-id="${id}"]`)?.focus();}
 function renderTable(){
  body.replaceChildren();const query=filter.trim().toLocaleLowerCase();let visible=0;
  for(const part of snapshot?.parts||[]){
   if(query&&!String(part.partId).includes(query)&&!String(part.partId).padStart(3,'0').includes(query)&&!(part.name||'').toLocaleLowerCase().includes(query))continue;
   const row=documentElement('tr','');row.dataset.managerPartId=part.partId;row.setAttribute('aria-label',partLabel(part));row.setAttribute('aria-selected',String(part.partId===selectedPart));row.tabIndex=part.partId===selectedPart?0:-1;
   for(const value of[part.mother.status==='known'&&part.mother.value?'*':'',String(part.partId).padStart(3,'0'),part.name??'Unavailable',displayCount(part.history),displayCount(part.objects)])row.append(documentElement('td',value));
   row.firstChild.title=part.mother.source||part.mother.reason;body.append(row);visible++;
  }
  text($('#part-properties-count'),`${visible} / ${snapshot?.parts.length||0} parts`);
  if(!visible){const row=documentElement('tr',''),cell=documentElement('td','No matching parts / لا توجد قطع مطابقة');cell.colSpan=5;cell.className='manager-empty';row.append(cell);body.append(row);}
  updateRows();
 }
 function refresh(){
  if(!dialog.open)return;const context=host.context();
  if(context.document!==document){document=context.document;snapshot=document?readNativePartProperties(document):null;selectedPart=context.activePart;filter='';$('#part-properties-search').value='';renderTable();}
  updateRows();renderDetails();
 }
 function open(){
  const context=host.context();if(!context.document||context.busy)return;
  try{document=context.document;snapshot=readNativePartProperties(document);selectedPart=context.activePart;filter='';$('#part-properties-search').value='';renderTable();renderDetails();dialog.showModal();$('#part-properties-search').focus();}
  catch(error){host.notice(error.message,true);}
 }
 function activate(){const part=selected();if(!part||host.context().busy)return;host.activate(part.partId);updateRows();text($('#part-properties-action-status'),`Active part: ${partLabel(part)}`);$('#part-properties-activate').focus();}
 $('#production-part').addEventListener('change',()=>{if(!$('#production-marker').checked&&!$('#production-stitch').checked){$('#production-marker').checked=true;$('#production-stitch').checked=true;}if($('#production-normal').value==='')$('#production-normal').value='1';if($('#production-mirrored').value==='')$('#production-mirrored').value='0';productionControls();});
 $('#production-draft').addEventListener('change',productionControls);
 for(const name of ['normal','mirrored'])$('#production-'+name).addEventListener('input',productionControls);
 $('#production-apply').addEventListener('click',()=>{if(host.context().busy||host.context().document!==document)return;try{const partId=selectedPart,next=updateProductionProperties(document,{partId,production:$('#production-part').checked,markerExport:$('#production-marker').checked,stitchPart:$('#production-stitch').checked,materialCode:$('#production-material').value,normal:Number($('#production-normal').value),mirrored:Number($('#production-mirrored').value),categoryId:$('#production-category').value});host.commit(next,'Updated part properties');selectedPart=partId;updateRows();renderDetails();text($('#part-properties-action-status'),'تم تطبيق الخصائص؛ احفظ الملف لحفظ التغيير.');}catch(error){host.notice(error.message,true);text($('#part-properties-action-status'),error.message);}});
 $('#part-properties-search').addEventListener('input',event=>{filter=event.target.value;renderTable();});
 body.addEventListener('click',event=>{const row=event.target.closest('[data-manager-part-id]');if(row)choose(Number(row.dataset.managerPartId));});
 body.addEventListener('dblclick',event=>{const row=event.target.closest('[data-manager-part-id]');if(row){choose(Number(row.dataset.managerPartId));activate();}});
 body.addEventListener('keydown',event=>{
  const row=event.target.closest('[data-manager-part-id]');if(!row)return;
  if(event.key==='Enter'){event.preventDefault();event.stopPropagation();activate();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const rows=[...body.querySelectorAll('[data-manager-part-id]')],index=rows.indexOf(row),next=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)));
  const target=rows[next];if(target){choose(Number(target.dataset.managerPartId),true);target.scrollIntoView({block:'nearest'});}
 });
 $('#part-properties-activate').addEventListener('click',activate);
 for(const kind of ['x','z'])$('#part-properties-'+kind).addEventListener('click',()=>{const part=selected();if(!part||host.context().busy)return;dialog.close();host.activate(part.partId);host.showValues(kind);});
 window.addEventListener('resize',()=>{if(dialog.open)renderDetails();});
 return{open,refresh};
}
