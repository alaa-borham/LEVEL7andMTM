import{readInsertedPart}from'./insert-part-kernel.mjs';import{INSERT_PART_PARAMETER_HEX}from'./native-insert-part-template.mjs';
const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),eq=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
/** One complete native TO part call; previous definitions remain byte exact. */
export function appendedInteractivePartReferences(a,b){try{
 if(b.history.length!==a.history.length+32||!eq(a.history,b.history.subarray(0,a.history.length))||!eq(a.references,b.references.subarray(0,a.references.length)))return null;
 const raw=b.history.subarray(a.history.length);if(String.fromCharCode(...raw.subarray(12))!=='GraPrg_GK_TO_c006_03')return null;const index=v(raw).getUint16(4,true),key=`3.${a.partId}.3.${index}`,parameters=b.parameters.get(key),template=Uint8Array.from(INSERT_PART_PARAMETER_HEX.match(/../g),n=>parseInt(n,16));
 if(!parameters||a.parameters.has(key)||b.parameters.size!==a.parameters.size+1||!eq(parameters,template)||[...a.parameters].some(([k,p])=>!eq(p,b.parameters.get(k)??new Uint8Array())))return null;
 const suffix=b.references.subarray(a.references.length),plan=readInsertedPart({historyRecord:raw,record:b.history.length/32,parameters,references:suffix});return plan.variant==='direct'&&plan.sourcePartId<a.partId&&plan.mappings.length<=128&&suffix.length===160+24*plan.mappings.length?plan:null;
}catch{return null;}}
