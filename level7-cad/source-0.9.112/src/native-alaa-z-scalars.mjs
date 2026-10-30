/** WORK ONLY: actual ALAA scalar/CMDIF calculations; no native history or MDL writing. */
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
import {readNativeMetadata} from './native-measurements.js';

const VERIFIED_SOURCE='468db71ba5aa19d73b56c6c3b15ce814eed96a33f47eb2103ff11d81248ea54c';
const SIZE='__HN40_0',DEFAULT='        ',MAX_TEXT=256,MAX_TOKENS=256,MAX_DEPTH=32,MAX_OPS=512,MAX_VALUE=1e9;
const privateSources=new WeakMap();
function error(code,message){const e=new Error(message);e.code=code;return e;}
function ensure(value,code,message){if(!value)throw error(code,message);}
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
const unavailable=(code,message,dependencies=[])=>freeze({status:'unavailable',reasonCode:code,reason:message,dependencies:[...new Set(dependencies)],nativeCurrentValueVerified:false});
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=MAX_VALUE;

function compile(input){
 ensure(typeof input==='string'&&input.length>0&&input.length<=MAX_TEXT,'FORMULA_LENGTH','Formula is empty or exceeds the work limit.');
 ensure(/^[\x20-\x7e]+$/.test(input),'FORMULA_ENCODING','Only stored ASCII formula syntax is accepted.');
 const text=input.toUpperCase().replace(/ /g,''),tokens=[],references=new Set(),process=new Set();let offset=0;
 while(offset<text.length){
  ensure(tokens.length<MAX_TOKENS,'FORMULA_BOUNDS','Formula token limit exceeded.');
  const rest=text.slice(offset),m=/^(?:\d+(?:\.\d*)?|\.\d+)|^(?:CMDIF|BTR|SQR|SIN|COS|TAN|ATN|PI|XG\d+|X\d+|Z\d+|G\d+|AB|GL)|^(?:>=|<=|<>|[+*/(){}\[\]<>=-])/.exec(rest);
  ensure(m,'UNSUPPORTED_FORMULA_TOKEN','Unsupported formula token at offset'+offset+'.');tokens.push(m[0]);offset+=m[0].length;
 }
 let cursor=0,nodes=0;const at=()=>tokens[cursor],take=expected=>{ensure(at()===expected,'MALFORMED_FORMULA','Expected '+expected+' at token'+cursor+'.');cursor++;};
 const node=(type,data)=>{ensure(++nodes<=MAX_OPS,'FORMULA_BOUNDS','Formula node limit exceeded.');return freeze({type,...data});};
 function atom(depth){
  ensure(depth<=MAX_DEPTH,'FORMULA_BOUNDS','Formula nesting limit exceeded.');const token=at();ensure(token,'MALFORMED_FORMULA','Expected an operand; formula ends after an operator.');
  if(token==='+'||token==='-'){cursor++;return node('unary',{operator:token,value:atom(depth+1)});}
  if(token==='('){cursor++;const value=sum(depth+1);take(')');return node('group',{value});}
  if(token==='PI'){cursor++;return node('number',{value:Math.PI});}
  if(['BTR','SQR','SIN','COS','TAN','ATN'].includes(token)){cursor++;take('(');const argument=sum(depth+1);take(')');return node('function',{name:token,argument});}
  if(token==='CMDIF'){
   cursor++;const branches=[];while(at()==='['){cursor++;const left=sum(depth+1),operator=at();ensure(['>','<','>=','<=','=','<>'].includes(operator),'MALFORMED_FORMULA','Expected a CMDIF comparison.');cursor++;const right=sum(depth+1);take(']');take('{');const value=sum(depth+1);take('}');branches.push(freeze({left,operator,right,value}));ensure(branches.length<=3,'FORMULA_BOUNDS','Only up to3 native case conditions are considered.');}
   ensure(branches.length>0,'MALFORMED_FORMULA','CMDIF has no condition.');take('{');const fallback=sum(depth+1);take('}');return node('case',{branches:freeze(branches),fallback});
  }
  if(/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)){cursor++;const value=Number(token);ensure(finite(value),'NUMERIC_BOUNDS','Numeric literal is outside the calculation limit.');return node('number',{value});}
  if(/^(?:XG|X|Z|G)\d+$/.test(token)){cursor++;const name=token.replace(/^(XG|X|Z|G)0+(\d)/,'$1$2');ensure(/^(?:XG|X|Z|G)[1-9]\d*$/.test(name),'INVALID_REFERENCE','Parameter index must be positive.');references.add(name);return node('reference',{name});}
  if(token==='AB'||token==='GL'){cursor++;process.add(token);return node('process',{name:token});}
  throw error('MALFORMED_FORMULA','Expected an operand, found '+token+'.');
 }
 function product(depth){let left=atom(depth);while(at()==='*'||at()==='/'){const operator=tokens[cursor++];left=node('binary',{operator,left,right:atom(depth)});}return left;}
 function sum(depth){let left=product(depth);while(at()==='+'||at()==='-'){const operator=tokens[cursor++];left=node('binary',{operator,left,right:product(depth)});}return left;}
 const ast=sum(0);ensure(cursor===tokens.length,'MALFORMED_FORMULA','Unexpected trailing formula token.');return freeze({text,ast,references:[...references],process:[...process]});
}

/** Pure stored-row resolver. Missing unequal size overrides never silently become default values. */
export function resolveScalarXRows(rows,{sizeKey,scope='local',sizeContext=null}={}){
 ensure(Array.isArray(rows)&&rows.length<=10000,'INVALID_X_ROWS','An explicit bounded X row array is required.');
 ensure(typeof sizeKey==='string'&&sizeKey.length===8&&/^[\x20-\x7e]{8}$/.test(sizeKey),'INVALID_SIZE','An explicit8-byte size key is required.');
 ensure(scope==='local'||scope==='global','INVALID_X_SCOPE','X scope must be local or global.');
 const groups=new Map(),seen=new Set();
 for(const row of rows){const index=row?.index,key=row?.sizeKey,value=row?.value,label=row?.label??'';ensure(Number.isInteger(index)&&index>=1&&index<=80&&typeof key==='string'&&/^[\x20-\x7e]{8}$/.test(key)&&finite(value)&&typeof label==='string','INVALID_X_ROWS','An X row is malformed.');ensure(!seen.has(index+'\0'+key),'DUPLICATE_X_ROW','Duplicate X index/size key.');seen.add(index+'\0'+key);const copy={index,sizeKey:key,value,label};if(!groups.has(index))groups.set(index,[]);groups.get(index).push(copy);}
 const result=[];
 for(const[index,entries]of groups){
  const name=(scope==='global'?'XG':'X')+index,exact=entries.find(e=>e.sizeKey===sizeKey),def=entries.find(e=>e.sizeKey===DEFAULT),unique=[...new Set(entries.map(e=>e.value))];
  if(entries.some(e=>/=>\s*\{/.test(e.label))){result.push(freeze({name,index,...unavailable('X_REDIRECTION_UNSUPPORTED','Native X redirection requires separate interpretation.')}));continue;}
  let value,method;if(exact){value=exact.value;method='exact-named-assignment';}else if(entries.length===1&&def){value=def.value;method='only-default-assignment';}else if(def&&unique.length===1){value=unique[0];method='all-stored-assignments-agree';}
  else if(sizeContext?.classify(sizeKey)){
   const target=sizeContext.classify(sizeKey),anchors=entries.map(e=>({entry:e,size:sizeContext.classify(e.sizeKey)})).filter(a=>a.size?.group===target.group).sort((a,b)=>a.size.position-b.size.position);
   if(!anchors.length&&def){value=def.value;method='figure-type-default';}
   else if(anchors.length===1){value=anchors[0].entry.value;method='figure-type-single-assignment';}
   else if(anchors.length>=2){let upper=anchors.findIndex(a=>a.size.position>target.position);if(upper<0)upper=anchors.length-1;else if(upper===0)upper=1;const a=anchors[upper-1],b=anchors[upper];ensure(b.size.position>a.size.position,'INVALID_SIZE_ORDER','Ambiguous standard size order');value=a.entry.value+(b.entry.value-a.entry.value)*(target.position-a.size.position)/(b.size.position-a.size.position);method=target.position<anchors[0].size.position||target.position>anchors.at(-1).size.position?'figure-type-extrapolation':'figure-type-interpolation';}
   if(!finite(value)){result.push(freeze({name,index,...unavailable('X_INTERPOLATION_UNAVAILABLE','No bounded value is available for this standard figure type.')}));continue;}
  }
  else{result.push(freeze({name,index,...unavailable('X_SIZE_INTERPOLATION_REQUIRED','No exact current-size assignment; figure-type/interpolation/X-reference semantics are required.')}));continue;}
  result.push(freeze({name,index,status:'resolved-stored-input',value,method,sizeKey,nativeCurrentValueVerified:false}));
 }
 return freeze(result);
}

/** Pure dependency evaluation in physical definition order; never writes or executes geometry. */
export function calculateScalarDefinitions(xInputs,definitions,{allowStoredTrailingDivision=false}={}){
 ensure(Array.isArray(xInputs)&&Array.isArray(definitions)&&definitions.length<=10000,'INVALID_DEFINITIONS','Explicit bounded inputs and definitions are required.');
 const context=new Map(),defined=new Set(),outputs=[];
 for(const input of xInputs){const name=input?.name,status=input?.status,value=input?.value;ensure(/^(?:XG|X)[1-9]\d*$/.test(name||'')&&!context.has(name),'INVALID_X_INPUT','Invalid or duplicate explicit X input.');if(status==='resolved-stored-input'){ensure(finite(value),'INVALID_X_INPUT','Nonfinite X input.');context.set(name,{status:'resolved',value});}else context.set(name,unavailable(input?.reasonCode||'X_UNAVAILABLE',input?.reason||'X input unavailable.',[name]));}
 for(const source of definitions){
  const index=source?.index,formula=source?.formula,recordStep=source?.recordStep,referenceCount=source?.referenceCount??source?.geometricReferences?.length??0;
  ensure(Number.isInteger(index)&&index>0&&!defined.has(index),'INVALID_Z_INDEX','Z indices must be positive and physically unique.');ensure(Number.isInteger(recordStep)&&recordStep>=1&&Number.isInteger(referenceCount)&&referenceCount>=0,'INVALID_Z_CONTEXT','Invalid native definition context.');defined.add(index);
  const base={index,formula,recordStep,ordinal:outputs.length,nativeCurrentValueVerified:false};let compiled,result;
  // Legacy stored single-X expressions with a dangling division retain the
  // operand in native replay. This read compatibility does not relax the
  // validator used to author formulas or repair the document's original text.
  const legacy=allowStoredTrailingDivision&&/^X[1-9]\d*\/$/i.test(formula);
  if(legacy)base.storedSyntaxCompatibility='single-x-trailing-division';
  try{compiled=compile(legacy?formula.slice(0,-1):formula);}catch(e){result=unavailable(e.code||'MALFORMED_FORMULA',e.message,['Z'+index]);}
  if(!result&&(referenceCount||compiled.process.length))result=unavailable('NATIVE_GEOMETRIC_OPERAND_REQUIRED','AB/GL needs native selectors and geometry at the stored Rstep boundary.',['Z'+index]);
  if(!result){const blockers=[];let missing=false;for(const name of compiled.references){const value=context.get(name);if(!value||(name.startsWith('Z')&&value.recordStep>recordStep)){missing=true;blockers.push(name);}else if(value.status!=='resolved')blockers.push(...(value.dependencies||[name]));}if(blockers.length)result=unavailable(missing?'UNDEFINED_OR_LATER_REFERENCE':'DEPENDENCY_UNAVAILABLE',missing?'Formula references an undefined/later parameter or an unsupported G chart value.':'A required parameter is unavailable; no substitute value was used.',blockers);}
  if(!result){
   let operations=0;const evaluate=(n,depth=0)=>{ensure(++operations<=MAX_OPS&&depth<=MAX_DEPTH,'CALCULATION_BOUNDS','Calculation work limit exceeded.');let value;
    if(n.type==='number')value=n.value;else if(n.type==='reference')value=context.get(n.name).value;else if(n.type==='group')value=evaluate(n.value,depth+1);else if(n.type==='unary'){const operand=evaluate(n.value,depth+1);value=n.operator==='-'?-operand:operand;}
    else if(n.type==='binary'){const a=evaluate(n.left,depth+1),b=evaluate(n.right,depth+1);if(n.operator==='+')value=a+b;else if(n.operator==='-')value=a-b;else if(n.operator==='*')value=a*b;else{ensure(b!==0,'DIVISION_BY_ZERO','Formula divides by zero.');value=a/b;}}
    else if(n.type==='function'){
     const a=evaluate(n.argument,depth+1),r=(a%360)*Math.PI/180;
     if(n.name==='BTR')value=Math.abs(a);
     else if(n.name==='SQR'){ensure(a>=0,'SQUARE_ROOT_DOMAIN','Square root requires a nonnegative argument.');value=Math.sqrt(a);}
     else if(n.name==='SIN')value=Math.sin(r);
     else if(n.name==='COS')value=Math.cos(r);
     else if(n.name==='TAN'){ensure(Math.abs(Math.cos(r))>1e-12,'TANGENT_DOMAIN','Tangent is undefined at an odd multiple of90degrees.');value=Math.tan(r);}
     else if(n.name==='ATN')value=Math.atan(a)*180/Math.PI;
     else throw error('UNSUPPORTED_FUNCTION','Unknown scalar function.');
    }
    else if(n.type==='case'){let selected=n.fallback;for(const branch of n.branches){const a=evaluate(branch.left,depth+1),b=evaluate(branch.right,depth+1),condition=branch.operator==='>'?a>b:branch.operator==='<'?a<b:branch.operator==='>='?a>=b:branch.operator==='<='?a<=b:branch.operator==='='?a===b:a!==b;if(condition){selected=branch.value;break;}}value=evaluate(selected,depth+1);}else throw error('NATIVE_GEOMETRIC_OPERAND_REQUIRED','Process data is unavailable.');
    ensure(finite(value),'NUMERIC_BOUNDS','Calculated result is not finite within the work limit.');return value;};
   try{result=freeze({status:'calculated-unverified',value:evaluate(compiled.ast),dependencies:compiled.references,nativeCurrentValueVerified:false});}catch(e){result=unavailable(e.code||'CALCULATION_FAILED',e.message,['Z'+index]);}
  }
  outputs.push(freeze({...base,...result}));context.set('Z'+index,result.status==='calculated-unverified'?{status:'resolved',value:result.value,recordStep}:{...result,recordStep});
 }
 return freeze(outputs);
}

async function authenticated(doc){
 ensure(globalThis.crypto?.subtle,'WEBCRYPTO_UNAVAILABLE','WebCrypto is required to verify the actual ALAA source.');
 let pending=privateSources.get(doc);if(!pending){
  const bytes=serializeMdl(doc); // authenticate original identity and take a copy before awaiting
  pending=(async()=>{const sourceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');ensure(sourceSha256===VERIFIED_SOURCE,'UNVERIFIED_SOURCE','Only the exact frozen actual ALAA source is admitted by this work candidate.');return{sourceSha256,document:parseMdl(bytes)};})();privateSources.set(doc,pending);
 }
 return pending;
}

export async function inspectActualALAAZScalars(doc,options={}){
 const partId=options.partId??2,sizeKey=options.sizeKey??SIZE,throughRecord=options.throughRecord;
 const common={readOnly:true,workOnly:true,productionEnabled:false,nativeHistoryExecuted:false,nativeCurrentValuesVerified:false,MDLWritten:false};
 try{
  ensure(partId===2,'UNVERIFIED_PART','This work candidate is bounded to actual ALAA part002.');ensure(sizeKey===SIZE,'UNVERIFIED_SIZE','Only actual current base size __HN40_0 is verified for stored-row resolution.');
  const source=await authenticated(doc),metadata=readNativeMetadata(source.document),size=metadata.sizes.find(s=>s.name===sizeKey),h=source.document.blocks.find(b=>b.id.join('.')==='3.2.2.0');ensure(h&&h.payloadSize%32===0,'INVALID_HISTORY_CONTEXT','Native history boundary is unavailable.');const totalRecords=h.payloadSize/32;
  ensure(throughRecord===undefined||throughRecord===totalRecords,'PARTIAL_RECORD_CONTEXT_UNVERIFIED','Only the complete current record position is considered; partial Rstep value availability is not calibrated.');ensure(size&&Object.values(size.rawReferenceField).every(n=>n===32),'X_REFERENCE_CONTEXT_UNSUPPORTED','A nonblank/unknown X-reference requires separate resolution.');
  const xt=readNativeXValues(source.document,{partId,sizeKey}),zt=readNativeZValues(source.document,{partId});ensure(xt.tables.local.status==='available'&&xt.tables.global.status==='available'&&zt.tableStatus==='available','UNVERIFIED_TABLE_LAYOUT','A complete measured X/Z layout is required.');
  const inputs=freeze([...resolveScalarXRows(xt.localEntries,{sizeKey,scope:'local'}),...resolveScalarXRows(xt.globalEntries,{sizeKey,scope:'global'})]);
  const rows=calculateScalarDefinitions(inputs,zt.entries.map(e=>({index:e.index,formula:e.formula,recordStep:e.recordStep,referenceCount:e.geometricReferences.length})));
  return freeze({...common,eligible:true,sourceSha256:source.sourceSha256,partId,sizeKey,totalRecords,rows,inputs,calculatedCount:rows.filter(e=>e.status==='calculated-unverified').length,unavailableCount:rows.filter(e=>e.status==='unavailable').length,numericSemantics:'Bounded JavaScript double arithmetic; native rounding/precision comparisons are pending.',evidenceState:'Actual ALAA scalar/conditional predictions only; native F11 comparison for all75 candidates is required before release.'});
 }catch(e){return freeze({...common,eligible:false,reasonCode:e.code||'INVALID_DOCUMENT',reason:e.message});}
}

export function validateScalarFormula(text){return compile(text);}
