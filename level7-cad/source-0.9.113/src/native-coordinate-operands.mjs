import{readNativeXValues}from'./native-x-values.js';import{resolveScalarXRows}from'./native-alaa-z-scalars.mjs';import{standardSizeContext}from'./standard-size-catalog.js';import{createPartHistoryCalculation}from'./part-history-engine.mjs';
export function coordinateOperandChoices(document,{partId,sizeKey}={}){
 const model=createPartHistoryCalculation(document,{sizeKey}).get(partId);if(!model.historyFullyExecuted&&!model.emptyHistory)return[];
 const rows=resolveScalarXRows(readNativeXValues(document,{partId}).localEntries,{sizeKey,sizeContext:standardSizeContext(document)}),finite=n=>Number.isFinite(n)&&Math.abs(n)<=1e6;
 return[...rows.filter(r=>r.status==='resolved-stored-input'&&/^X(?:[1-9]|[1-7]\d|80)$/.test(r.name)&&finite(r.value)).map(r=>({name:r.name,value:r.value})),...model.scalarRows.filter(r=>r.status==='calculated-unverified'&&r.index>=1&&r.index<=99&&r.recordStep<=model.historyRecords+1&&finite(r.value)).map(r=>({name:'Z'+r.index,value:r.value}))];
}
