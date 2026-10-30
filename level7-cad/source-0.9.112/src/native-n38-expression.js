/** Bounded WORK-ONLY arithmetic; not a claim of native Grafis evaluation. */
const MAX_TEXT=128,MAX_TOKENS=128,MAX_DEPTH=20,MAX_OPERATIONS=128,MAX_RESULT=1_000_000;
function fail(message){const error=new Error(message);error.code='EXPERIMENTAL_EXPRESSION_REFUSED';throw error;}
function ensure(condition,message){if(!condition)fail(message);}
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=MAX_RESULT;

export function parseExperimentalExpression(input){
  ensure(typeof input==='string'&&input.length>0&&input.length<=MAX_TEXT,'Formula must have 1 to128 characters.');
  ensure(/^[\x20-\x7e]+$/.test(input),'Only ASCII arithmetic formulas are accepted.');
  const text=input.toUpperCase().replace(/\s/g,''),tokens=[];let offset=0;
  while(offset<text.length){
    ensure(tokens.length<MAX_TOKENS,'Too many formula tokens.');
    const rest=text.slice(offset),number=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(rest),reference=/^(?:XG|X|Z)[1-9]\d*/.exec(rest);
    if(number){const value=Number(number[0]);ensure(finite(value),'Numeric literal is outside the experiment bounds.');tokens.push({type:'number',value,text:number[0]});offset+=number[0].length;}
    else if(reference){const name=reference[0];ensure(/^(?:X(?:[1-9]|[1-7]\d|80)|Z[1-9]\d?)$/.test(name),'Only local X1..X80 and Z1..Z99 are supported.');tokens.push({type:'reference',name});offset+=name.length;}
    else{const symbol=text[offset++];ensure('+-*/()'.includes(symbol),'Unsupported formula token.');tokens.push({type:symbol});}
  }
  ensure(tokens.length>0,'Formula is empty.');let cursor=0,operations=0;
  const peek=type=>tokens[cursor]?.type===type;
  function node(type,data){ensure(++operations<=MAX_OPERATIONS,'Too many formula operations.');return Object.freeze({type,...data});}
  function atom(depth){
    ensure(depth<=MAX_DEPTH,'Formula nesting limit exceeded.');const token=tokens[cursor++];ensure(token,'Expected a formula operand.');
    if(token.type==='number')return node('number',{value:token.value});
    if(token.type==='reference')return node('reference',{name:token.name});
    if(token.type==='('){const result=sum(depth+1);ensure(peek(')'),'Unbalanced formula parentheses.');cursor++;return node('group',{value:result});}
    fail('Expected a numeric literal, parameter or parenthesized expression.');
  }
  function unary(depth){ensure(depth<=MAX_DEPTH,'Formula nesting limit exceeded.');if(peek('+')||peek('-')){const operator=tokens[cursor++].type;return node('unary',{operator,value:unary(depth+1)});}return atom(depth);}
  function product(depth){let left=unary(depth);while(peek('*')||peek('/')){const operator=tokens[cursor++].type;left=node('binary',{operator,left,right:unary(depth)});}return left;}
  function sum(depth){let left=product(depth);while(peek('+')||peek('-')){const operator=tokens[cursor++].type;left=node('binary',{operator,left,right:product(depth)});}return left;}
  const ast=sum(0);ensure(cursor===tokens.length,'Unexpected trailing formula token.');
  const references=new Set();function walk(item){if(item.type==='reference')references.add(item.name);if(item.left)walk(item.left);if(item.right)walk(item.right);if(item.value&&typeof item.value==='object')walk(item.value);}walk(ast);
  return Object.freeze({text,ast,references:Object.freeze([...references]),experimental:true,nativeEvaluationVerified:false});
}

export function evaluateExperimentalExpression(parsed,explicitValues){
  ensure(parsed&&typeof parsed==='object'&&parsed.ast&&Array.isArray(parsed.references),'Expected a parsed experimental formula.');
  ensure(explicitValues instanceof Map,'An explicit Map of numeric parameter values is required.');
  const values=new Map();for(const name of parsed.references){ensure(explicitValues.has(name),'Undefined parameter '+name+'.');const value=explicitValues.get(name);ensure(finite(value),'Invalid explicit parameter '+name+'.');values.set(name,value);}
  let operations=0;function evaluate(node,depth){
    ensure(++operations<=MAX_OPERATIONS&&depth<=MAX_DEPTH,'Evaluation bounds exceeded.');let result;
    if(node.type==='number')result=node.value;
    else if(node.type==='reference'){ensure(values.has(node.name),'Undefined parameter '+node.name+'.');result=values.get(node.name);}
    else if(node.type==='group')result=evaluate(node.value,depth+1);
    else if(node.type==='unary'){const value=evaluate(node.value,depth+1);result=node.operator==='-'?-value:value;}
    else if(node.type==='binary'){const a=evaluate(node.left,depth+1),b=evaluate(node.right,depth+1);switch(node.operator){case '+':result=a+b;break;case '-':result=a-b;break;case '*':result=a*b;break;case '/':ensure(b!==0,'Division by zero.');result=a/b;break;default:fail('Unknown arithmetic operator.');}}
    else fail('Unknown arithmetic node.');ensure(finite(result),'Calculated result is outside the experiment bounds.');return result;
  }
  return evaluate(parsed.ast,0);
}

export function evaluateExperimentalDefinitions(xEntries,zEntries){
  ensure(Array.isArray(xEntries)&&Array.isArray(zEntries),'Expected explicit parameter entry arrays.');
  const values=new Map(),formulas=new Map(),visiting=new Set(),evaluated=new Map();
  for(const entry of xEntries){const name='X'+entry.index;ensure(/^X(?:[1-9]|[1-7]\d|80)$/.test(name)&&!values.has(name)&&finite(entry.value),'Invalid or duplicate local X entry.');values.set(name,entry.value);}
  for(const entry of zEntries){const name='Z'+entry.index;ensure(/^Z[1-9]\d?$/.test(name)&&!formulas.has(name),'Invalid or duplicate Z entry.');formulas.set(name,parseExperimentalExpression(entry.formula));}
  function resolve(name){if(values.has(name))return values.get(name);ensure(formulas.has(name),'Undefined parameter '+name+'.');ensure(!visiting.has(name),'Cyclic parameter dependency.');if(evaluated.has(name))return evaluated.get(name);visiting.add(name);const parsed=formulas.get(name),context=new Map();for(const ref of parsed.references)context.set(ref,resolve(ref));const value=evaluateExperimentalExpression(parsed,context);visiting.delete(name);evaluated.set(name,value);return value;}
  for(const name of formulas.keys())resolve(name);
  return Object.freeze({values:new Map([...values,...evaluated]),experimental:true,nativeEvaluationVerified:false});
}
