import {standardSizeContext} from './standard-size-catalog.js';
import {parseMdl} from './native-mdl.js';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
import {createNativeParameterTransfer,parameterKey} from './native-parameter-transfer.js';
import {resolveScalarXRows,calculateScalarDefinitions} from './native-alaa-z-scalars.mjs';
// Document-scoped parameter changes survive part navigation. No geometry is fabricated.
export function createPartParameterSession(){
 let source=null,edits=new Map(),tableOperations=[],serial=0,revision=0;const cache=new Map(),historyGraphs=new Map();let stagedKey=null,stagedDocument=null;
 function attach(doc){if(doc!==source){source=doc;edits.clear();tableOperations=[];revision++;cache.clear();historyGraphs.clear();stagedKey=null;stagedDocument=null;}}
 function list(){return [...tableOperations,...edits.values()].map(p=>({...p}));}
 function apply(doc,p){attach(doc);p={...p,...(p.kind==='X'?{value:Math.fround(p.value)}:{})};const key=parameterKey(p),next=new Map(edits);next.set(key,{...p});const base=p.kind==='X'?readNativeXValues(tableOperations.length?parseMdl(createNativeParameterTransfer(source,tableOperations).bytes):source,{partId:p.partId})[p.scope+'Entries'].find(x=>x.index===p.index&&x.sizeKey===p.sizeKey)?.value:readNativeZValues(source,{partId:p.partId}).entries.find(z=>z.index===p.index)?.formula;
  if((p.kind==='X'?Math.fround(p.value):p.formula)===base)next.delete(key);
  if(next.size||tableOperations.length)createNativeParameterTransfer(source,[...tableOperations,...next.values()]);
  edits=next;revision++;cache.clear();return list();
 }
 function materialize(doc,extra=[]){attach(doc);const combined=new Map(extra.map(p=>[parameterKey(p),p]));for(const p of list())combined.set(parameterKey(p),p);const changes=[...combined.values()],nextKey=JSON.stringify(changes);if(stagedKey!==nextKey){stagedDocument=changes.length?parseMdl(createNativeParameterTransfer(source,changes).bytes):source;stagedKey=nextKey;historyGraphs.clear();}return stagedDocument;}
 function changeTable(doc,operation,extra=[]){attach(doc);const before=materialize(doc,extra),rows=readNativeXValues(before,{partId:operation.partId})[operation.scope+'Entries'];const last=Math.max(0,...rows.map(r=>r.index));const op={...operation,kind:'XTABLE',serial:++serial},next=new Map(edits);
 if(op.action==='delete-last'||op.action==='remove-size')for(const[k,e]of next)if(e.kind==='X'&&e.scope===op.scope&&(op.scope==='global'||e.partId===op.partId)&&e.index===(op.action==='delete-last'?last:op.index)&&(op.action==='delete-last'||e.sizeKey===op.sizeKey))next.delete(k);
 createNativeParameterTransfer(source,[...extra,...tableOperations,op,...next.values()]);tableOperations.push(op);edits=next;revision++;cache.clear();stagedKey=null;return list();
 }
 function values(doc,partId,sizeKey,extra=[]){attach(doc);const combined=new Map(extra.map(p=>[parameterKey(p),p]));for(const p of list())combined.set(parameterKey(p),p);const changes=[...combined.values()],key=JSON.stringify([partId,sizeKey,revision,extra]);if(cache.has(key))return cache.get(key);
  const current=materialize(doc,extra),x=readNativeXValues(current,{partId}),z=readNativeZValues(current,{partId});
  const rows=scope=>x[scope+'Entries'].map(row=>({...row,value:combined.get(parameterKey({kind:'X',partId,scope,index:row.index,sizeKey:row.sizeKey}))?.value??row.value}));
  const definitions=z.entries.map(row=>({...row,formula:combined.get(parameterKey({kind:'Z',partId,index:row.index}))?.formula??row.formula}));
  const inputs=[...resolveScalarXRows(rows('local'),{sizeKey,scope:'local',sizeContext:standardSizeContext(current)}),...resolveScalarXRows(rows('global'),{sizeKey,scope:'global',sizeContext:standardSizeContext(current)})];
  const calculated=calculateScalarDefinitions(inputs,definitions.map(e=>({...e,referenceCount:e.opaque?1:e.geometricReferences.length})));
  let historyCalculation=null,historyError=null;
  try{const nextKey=JSON.stringify(changes);if(stagedKey!==nextKey){stagedDocument=changes.length?parseMdl(createNativeParameterTransfer(source,changes).bytes):source;stagedKey=nextKey;historyGraphs.clear();}if(!historyGraphs.has(sizeKey))historyGraphs.set(sizeKey,createPartHistoryCalculation(stagedDocument,{sizeKey}));historyCalculation=historyGraphs.get(sizeKey).get(partId);}catch(e){historyError=e.message;}
  const result={partId,sizeKey,inputs,definitions,rows:historyCalculation?.scalarRows??calculated,changed:changes.length>0,geometryRecalculated:false,historyCalculation,historyError};cache.set(key,result);return result;
 }
 return {attach,apply,list,values,materialize,changeTable,reset(){source=null;edits.clear();tableOperations=[];revision++;cache.clear();historyGraphs.clear();stagedKey=null;stagedDocument=null;},get modified(){return edits.size>0||tableOperations.length>0;}};
}
