import{isEmptyNativeLinePart}from'./empty-native-line-part.mjs';
import{readNativeXValues}from'./native-x-values.js';
import{resolveScalarXRows}from'./native-alaa-z-scalars.mjs';
import{standardSizeContext}from'./standard-size-catalog.js';
import{createPartHistoryCalculation}from'./part-history-engine.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
/** Only values resolved at the call's construction position may drive a length. */
export function line10LengthChoices(doc,{partId,sizeKey,record=Infinity,model}={}){
 model??=createPartHistoryCalculation(doc,{sizeKey}).get(partId);need(model.historyFullyExecuted||model.emptyHistory&&isEmptyNativeLinePart(doc,{partId,sizeKey}),'سجل البارت غير مكتمل.');
 const table=readNativeXValues(doc,{partId}),sizeContext=standardSizeContext(doc),rows=[...resolveScalarXRows(table.localEntries,{sizeKey,sizeContext}),...resolveScalarXRows(table.globalEntries,{sizeKey,scope:'global',sizeContext})],out=[],seen=new Set();
 for(const r of rows){if(seen.has(r.name))continue;seen.add(r.name);const i=Number(r.name?.slice(1));if(r.status==='resolved-stored-input'&&/^X\d+$/.test(r.name)&&i>=1&&i<=80&&Number.isFinite(r.value)&&r.value>=.01&&r.value<=10000)out.push({name:r.name,code:i,value:r.value});}
 for(const r of model.scalarRows??[])if(r.status==='calculated-unverified'&&r.recordStep<=record&&Number.isInteger(r.index)&&r.index>=1&&r.index<65335&&Number.isFinite(r.value)&&r.value>=.01&&r.value<=10000)out.push({name:'Z'+r.index,code:200+r.index,value:r.value});
 return out;
}
export function resolveLine10Length(doc,context,operand){
 need(operand&&Object.keys(operand).sort().join(',')==='index,kind'&&['x','z'].includes(operand.kind)&&Number.isInteger(operand.index),'مرجع طول X/Z غير صالح.');
 const name=operand.kind.toUpperCase()+operand.index,row=line10LengthChoices(doc,context).find(r=>r.name===name);need(row,'معامل الطول غير متاح قبل إنشاء الخط، أو قيمته غير صالحة.');return row;
}
export function writeLine10LengthBinding(parameters,code){
 const p=parameters.slice(),v=new DataView(p.buffer,p.byteOffset,p.byteLength);let found=0;
 for(let at=0;at<p.length;){const n=v.getUint32(at,true)*8;need(n>=24&&at+n<=p.length,'Unknown Line10 parameter span');if(v.getInt16(at+4,true)===-12){const count=v.getUint32(at+20,true);need(count%8===0&&24+count<=n,'Unknown Line10 binding table');for(let i=at+24;i<at+24+count;i+=8)if(v.getUint32(i,true)===7){v.setUint32(i+4,code,true);found++;}}at+=n;}
 need(found===1,'Ambiguous Line10 length binding');return p;
}
