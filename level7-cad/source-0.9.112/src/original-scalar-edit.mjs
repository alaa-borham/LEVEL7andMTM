import{createPartHistoryCalculation}from'./part-history-engine.mjs';
import{parseMdl,serializeMdl}from'./native-mdl.js';
import{createNativeParameterTransfer}from'./native-parameter-transfer.js';
import{commitOriginalDefinition}from'./original-geometry-edit.mjs';
import{commitUnchangedParameters}from'./unchanged-parameter-commit.mjs';
/** Numeric table edits use the same guarded full-cache commit as original geometry. */
export function editOriginalScalarValue(document,{sizeKey,edit}){
 if(!edit||!['X','Z'].includes(edit.kind))throw Error('اختر قيمة X أو صيغة Z مدعومة.');
 const transfer=createNativeParameterTransfer(document,[edit]),next=parseMdl(transfer.bytes);
 let result;if(createPartHistoryCalculation(document,{sizeKey}).get(edit.partId).emptyHistory)result=commitUnchangedParameters(document,next,{sizeKey});else try{result=commitOriginalDefinition(document,next,{sizeKey});}catch(error){if(error.message!=='لم تتغير الهندسة.')throw error;result=commitUnchangedParameters(document,next,{sizeKey});}
 return{...result,bytes:serializeMdl(result.document),geometryRecalculated:true};
}
