import {validateScalarFormula} from './native-alaa-z-scalars.mjs';
import {parseFormulaCases,buildFormulaCases} from './formula-cases.js';
/** Drafts only: applying and saving use the existing document parameter editor. */
export function createZFormulaAssistant({readX,readZ}){
 const modal=document.createElement('dialog'),$=s=>modal.querySelector(s);
 modal.id='z-formula-assistant';modal.className='native-dialog formula-assistant';modal.setAttribute('aria-labelledby','formula-assistant-title');
 const branch=i=>'<div class="formula-case-branch">'+(i?'<label><input type="checkbox" id="case-enable-'+i+'"> ELSE IF '+i+' / وإلا إذا</label>':'<strong>IF / إذا</strong>')+'<input id="case-condition-'+i+'" data-case-field aria-label="'+(i?'ELSE IF '+i:'IF')+' condition" maxlength="256" spellcheck="false"><label for="case-value-'+i+'">THEN / إذن <span class="case-z-label"></span></label><input id="case-value-'+i+'" data-case-field aria-label="THEN '+(i+1)+' result" maxlength="256" spellcheck="false"></div>';
 modal.innerHTML='<div class="dialog-caption"><h1 id="formula-assistant-title">Z value assistant / مساعد المعادلات</h1><button type="button" data-assistant-close aria-label="Close formula assistant">×</button></div>'+
 '<form id="formula-assistant-form" novalidate><div class="dialog-body"><fieldset class="formula-instruction"><legend>Calculation instruction / صيغة الحساب</legend><div class="formula-entry"><div class="formula-modes"><label><input type="radio" name="formula-mode" value="formula" checked> Formula / معادلة</label><label><input type="radio" name="formula-mode" value="cases"> Distinction of cases / تمييز الحالات</label></div>'+
 '<label for="formula-assistant-input" id="formula-assistant-label">Formula</label><textarea id="formula-assistant-input" maxlength="256" rows="3" spellcheck="false"></textarea><button type="button" id="formula-insert-case">CMDIF · تحرير الشروط</button><div id="formula-cases" hidden>'+branch(0)+branch(1)+branch(2)+'<div class="formula-case-fallback"><label for="case-fallback">ELSE / وإلا <span class="case-z-label"></span></label><input id="case-fallback" data-case-field aria-label="ELSE result" maxlength="256" spellcheck="false"></div></div></div><div class="formula-geometry" aria-label="Geometry references"></div></fieldset>'+
 '<fieldset class="formula-elements"><legend>Formula element / عناصر المعادلة</legend><label for="formula-category">Category / الفئة</label><select id="formula-category"><option value="operators">Operators / العمليات الحسابية</option><option value="local">Active part X / قيم القطعة</option><option value="global">Global X / القيم العامة</option><option value="z">Z values / معاملات Z</option><option value="math">Mathematical functions / الدوال الرياضية</option></select><div class="formula-element-panels"><div id="formula-elements-list"></div><div id="formula-logical-panel" hidden><strong>Logical operator / المقارنة</strong><div id="formula-logical-list"></div></div></div></fieldset>'+
 '<label id="case-preview-label" for="case-preview" hidden>CMDIF / الصيغة الناتجة</label><output id="case-preview" hidden></output><p id="formula-assistant-error" role="alert" class="field-error" hidden></p><p class="formula-help" dir="rtl">استخدام الصيغة ينقلها إلى محرر Z؛ اضغط «تطبيق» هناك لاعتمادها. يدعم المحرر IF وشرطين اختياريين ELSE IF ثم ELSE. الدوال الرياضية متاحة؛ الزوايا بالدرجات. اختيار المراجع الهندسية المعطلة غير متاح بعد.</p></div><div class="dialog-actions"><button type="submit">Use formula / استخدام الصيغة</button><button type="button" data-assistant-close>Cancel / إلغاء</button></div></form>';
 document.body.append(modal);
 const input=$('#formula-assistant-input'),error=$('#formula-assistant-error');let target=null,mode='formula',activeInput=input,lastCondition=null;
 const geometric=[['GL','طول خط'],['AB','مسافة بين نقطتين'],['TL','جزء من طول'],['RI','اتجاه'],['WS','زاوية خطين'],['WP','زاوية ثلاث نقاط'],['AX','مسافة أفقية'],['AY','مسافة رأسية'],['XK','إحداثي X'],['YK','إحداثي Y']];
 for(const [name,label]of geometric){const b=document.createElement('button');b.type='button';b.disabled=true;b.textContent=name;b.title=label+' — اختيار المراجع الهندسية من هذا المساعد غير متاح بعد';$('.formula-geometry').append(b);}
 const showError=e=>{error.textContent=e.message;error.hidden=false;};
 const draft=()=>({branches:[0,1,2].filter(i=>!i||$('#case-enable-'+i).checked).map(i=>({condition:$('#case-condition-'+i).value,value:$('#case-value-'+i).value})),fallback:$('#case-fallback').value});
 function preview(){error.hidden=true;if(mode!=='cases')return;try{$('#case-preview').textContent=buildFormulaCases(draft());}catch{$('#case-preview').textContent='أكمل حقول الشروط والنتائج لعرض الصيغة.';}}
 function enableBranches(){
  if(!$('#case-enable-1').checked)$('#case-enable-2').checked=false;
  $('#case-enable-2').disabled=!$('#case-enable-1').checked;
  for(const i of [1,2])for(const kind of ['condition','value'])$('#case-'+kind+'-'+i).disabled=!$('#case-enable-'+i).checked;
  if(activeInput.disabled)activeInput=$('#case-condition-0');if(lastCondition?.disabled)lastCondition=$('#case-condition-0');preview();
 }
 function fillCases(data){for(const i of [0,1,2]){const b=data.branches[i];$('#case-condition-'+i).value=b?.condition||'';$('#case-value-'+i).value=b?.value||'';if(i)$('#case-enable-'+i).checked=!!b;}$('#case-fallback').value=data.fallback;enableBranches();}
 function renderMode(){const cases=mode==='cases';$('[name="formula-mode"][value="'+mode+'"]').checked=true;input.hidden=cases;$('#formula-insert-case').hidden=cases;$('#formula-cases').hidden=!cases;$('#formula-logical-panel').hidden=!cases;$('#case-preview').hidden=!cases;$('#case-preview-label').hidden=!cases;$('.formula-geometry').hidden=cases;$('.formula-instruction').classList.toggle('has-cases',cases);}
 function setMode(next){
  if(next===mode)return;
  try{
   if(next==='cases'){let parsed=null;if(input.value.trim())parsed=parseFormulaCases(input.value.trim());fillCases(parsed||{branches:[{condition:'',value:''}],fallback:input.value.trim()});}
   else input.value=buildFormulaCases(draft());
   mode=next;renderMode();activeInput=mode==='cases'?$('#case-condition-0'):input;activeInput.focus();preview();
  }catch(e){$('[name="formula-mode"][value="'+mode+'"]').checked=true;showError(e);}
 }
 function insert(text,field=activeInput){if(!field||field.disabled||field.hidden)field=mode==='cases'?$('#case-condition-0'):input;field.focus();field.setRangeText(text,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));}
 for(const field of [input,...modal.querySelectorAll('[data-case-field]')]){field.addEventListener('focus',()=>{activeInput=field;if(field.id.startsWith('case-condition-'))lastCondition=field;});field.addEventListener('input',preview);}
 for(const [token,label]of [['=','equal / يساوي'],['<','less / أصغر'],['>','greater / أكبر'],['<>','unequal / لا يساوي'],['<=','less or equal / أصغر أو يساوي'],['>=','greater or equal / أكبر أو يساوي']]){const b=document.createElement('button');b.type='button';b.dataset.comparison=token;b.textContent=token+'   '+label;b.addEventListener('click',()=>insert(token,lastCondition||$('#case-condition-0')));$('#formula-logical-list').append(b);}
 function render(){
  const category=$('#formula-category').value,list=$('#formula-elements-list');list.replaceChildren();let items=[];
  if(category==='operators')items=[['+','جمع'],['-','طرح'],['*','ضرب'],['/','قسمة'],['()','أقواس'],['CMDIF[X1>0]{1}{0}','شرط داخل تعبير']];
  else if(category==='math')items=[['BTR()','Absolute value'],['SQR()','Square root'],['SIN()','Sine'],['COS()','Cosine'],['TAN()','Tangent'],['ATN()','Arc tangent'],['PI','Number Pi']];
  else if(category==='z')items=readZ().map(r=>['Z'+r.index,r.comment?.split('#F:')[0]||'']);
  else{const scope=category==='global'?'global':'local',seen=new Set();for(const r of readX(scope)){if(seen.has(r.index))continue;seen.add(r.index);items.push([(scope==='global'?'XG':'X')+r.index,r.label||'']);}}
  for(const [token,label]of items){const b=document.createElement('button');b.type='button';const name=document.createElement('code'),description=document.createElement('span');name.textContent=token;description.textContent=label;b.append(name,description);b.addEventListener('click',()=>{insert(token);if(token.endsWith('()'))activeInput.setSelectionRange(activeInput.selectionStart-1,activeInput.selectionStart-1);});list.append(b);}
  if(!items.length){const p=document.createElement('p');p.dir='rtl';p.textContent='لا توجد عناصر مقروءة في هذه الفئة. يمكنك كتابة المرجع مباشرة في الصيغة.';list.append(p);}
 }
 $('#formula-category').addEventListener('change',render);$('#formula-insert-case').addEventListener('click',()=>setMode('cases'));
 for(const radio of modal.querySelectorAll('[name="formula-mode"]'))radio.addEventListener('change',()=>setMode(radio.value));
 for(const i of [1,2])$('#case-enable-'+i).addEventListener('change',enableBranches);
 for(const button of modal.querySelectorAll('[data-assistant-close]'))button.addEventListener('click',()=>modal.close());
 modal.addEventListener('keydown',event=>event.stopPropagation());
 $('#formula-assistant-form').addEventListener('submit',event=>{event.preventDefault();try{const value=mode==='cases'?buildFormulaCases(draft()):input.value;validateScalarFormula(value);if(!target||!target.isConnected||target.disabled)throw Error('محرر الصيغة غير متاح.');target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));modal.close();target.focus();}catch(e){showError(e);}});
 return {show(editor,label){
  target=editor;input.value=editor.value;mode='formula';lastCondition=null;activeInput=input;fillCases({branches:[],fallback:''});$('#formula-assistant-label').textContent=label;
  for(const l of modal.querySelectorAll('.case-z-label'))l.textContent=label;
  try{const parsed=parseFormulaCases(input.value);if(parsed){fillCases(parsed);mode='cases';}}catch{/* Invalid existing text remains editable without replacement. */}
  renderMode();error.hidden=true;preview();render();modal.showModal();activeInput=mode==='cases'?$('#case-condition-0'):input;activeInput.focus();
 }};
}
