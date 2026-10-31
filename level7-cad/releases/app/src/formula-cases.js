import {validateScalarFormula} from './native-alaa-z-scalars.mjs';

// Preserve each expression as text, including nested CMDIF blocks. The existing
// scalar compiler remains the authority on syntax and calculation limits.
export function parseFormulaCases(formula) {
 const compiled=validateScalarFormula(formula);
 if(compiled.ast.type!=='case')return null;
 const text=compiled.text;let at=5;
 function group(open,close){
  if(text[at]!==open)throw Error('صيغة الشرط غير مكتملة.');
  const start=++at;let depth=1;
  while(at<text.length){const c=text[at++];if(c===open)depth++;if(c===close&&!--depth)return text.slice(start,at-1);}
  throw Error('صيغة الشرط غير مكتملة.');
 }
 const branches=[];
 while(text[at]==='[')branches.push({condition:group('[',']'),value:group('{','}')});
 const fallback=group('{','}');
 if(at!==text.length)throw Error('توجد كتابة بعد نهاية الشرط.');
 return {branches,fallback};
}

export function buildFormulaCases({branches,fallback}) {
 if(!Array.isArray(branches)||branches.length<1||branches.length>3)throw Error('أدخل شرط IF وبحد أقصى شرطين ELSE IF.');
 const clean=(value,label)=>{if(typeof value!=='string'||!value.trim())throw Error(`أكمل حقل ${label}.`);return value.trim();};
 const formula='CMDIF'+branches.map((branch,index)=>{
  const label=index?'ELSE IF '+index:'IF';
  const condition=clean(branch.condition,label),value=clean(branch.value,'THEN '+(index+1));
  // Reject a field that attempts to terminate the enclosing condition/value.
  const probe=parseFormulaCases(`CMDIF[${condition}]{${value}}{0}`);
  if(probe.branches.length!==1||probe.branches[0].condition!==condition.toUpperCase().replace(/ /g,'')||probe.branches[0].value!==value.toUpperCase().replace(/ /g,''))throw Error(`تحقق من حدود حقل ${label}.`);
  return `[${condition}]{${value}}`;
 }).join('')+`{${clean(fallback,'ELSE')}}`;
 const parsed=parseFormulaCases(formula);
 if(parsed.branches.length!==branches.length||parsed.fallback!==fallback.trim().toUpperCase().replace(/ /g,''))throw Error('تحقق من حدود حقل ELSE.');
 return formula;
}
