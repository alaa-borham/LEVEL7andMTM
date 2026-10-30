// WORK ONLY read-only part inventory. No part-property writer or guessed binary flags.
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeMetadata} from './native-measurements.js';
import {readCachedPreview} from './native-cache-preview.js';
import {inspectProductionProperties} from './native-production-properties.js';
const snapshots=new WeakMap();
const unavailable=reason=>Object.freeze({status:'unavailable',value:null,readOnly:true,reason});
const known=(value,source)=>Object.freeze({status:'known',value,source,readOnly:true});
const idKey=block=>block.id.join('.');
function countField(line,start,end){const text=line?.slice(start,end);return typeof text==='string'&&/^ *\d+ *$/.test(text)?Number(text.trim()):null;}

/** Uses private authenticated serialization; public doc.bytes/blocks are never trusted. */
export function readNativePartProperties(document){
 if(snapshots.has(document))return snapshots.get(document);
 const bytes=serializeMdl(document),checked=parseMdl(bytes),metadata=readNativeMetadata(bytes);
 const parts=[];
 for(const part of metadata.parts){
  const warnings=[];
  const select=key=>{const matches=checked.blocks.filter(b=>idKey(b)===key);if(matches.length>1){warnings.push(`Duplicate native block ${key}; the field is unavailable.`);return null;}return matches[0]||null;};
  const recordBlock=select(`3.${part.id}.2.0`),listRecordCount=countField(part.summaryRawLine,32,37),listObjectCount=countField(part.summaryRawLine,37,41);
  let history=unavailable('No verified native construction-record count is available.');
  if(recordBlock&&recordBlock.payloadSize%32===0)history=known(recordBlock.payloadSize/32,`block 3.${part.id}.2.0 payload / 32`);
  else if(!recordBlock&&listRecordCount===0)history=known(0,'#TLIST count; no construction-record block');
  else if(recordBlock)warnings.push('Native construction-record payload is not aligned to32-byte records.');
  if(history.status==='known'&&listRecordCount!==null&&history.value!==listRecordCount)warnings.push(`Record count differs: native payload ${history.value}; #TLIST ${listRecordCount}.`);
  const sizeId=metadata.referenceSize?.index??1,cacheBlock=select(`3.${part.id}.7.${sizeId}`);
  let objects=unavailable('No verified stored-object count is available.'),preview={available:false,shown:0,omitted:0,total:null,reason:'No stored geometry cache.'};
  if(cacheBlock){
   try{const result=readCachedPreview(checked,{partId:part.id,sizeId});objects=known(result.totalObjects,`base-size cache 3.${part.id}.7.${sizeId}`);preview={available:true,shown:result.objects.length,omitted:result.unsupported.length,total:result.totalObjects,partial:result.unsupported.length>0,reason:null};}
   catch(error){preview={...preview,reason:error.message};warnings.push(`Stored preview unavailable: ${error.message}`);}
  }
  if(objects.status!=='known'&&listObjectCount!==null)objects=known(listObjectCount,'#TLIST stored object-count field; cache cross-check unavailable');
  if(objects.status==='known'&&listObjectCount!==null&&objects.value!==listObjectCount)warnings.push(`Object count differs: cache ${objects.value}; #TLIST ${listObjectCount}.`);
  const marker=part.summaryRawLine?.[1],mother=marker==='*'?known(true,"#TLIST column1 '*' mother-part marker"):marker===' '?known(false,'#TLIST column1 has no mother-part marker'):unavailable('No recognized native mother-part list marker.');
  const unknownReason='Native field meaning is not verified for this document; editing is unavailable.';
  const production=inspectProductionProperties(checked,part.id);
  const property=(value)=>production.eligible?known(value,'Verified VA property record 3.part.6.6'):unavailable(production.reason);
  const fields=Object.freeze({
   partType:unavailable(unknownReason),markerExport:unavailable(unknownReason),stitchPart:unavailable(unknownReason),material:unavailable(unknownReason),
   normalAmount:unavailable(unknownReason),mirroredAmount:unavailable(unknownReason),totalAmount:unavailable('Native quantity semantics are not verified; a total is not inferred.'),
   category:unavailable(unknownReason),lastEdit:unavailable('No verified native edit timestamp. Filesystem dates are not substituted.'),sourceStyle:unavailable('Native source-style provenance is not decoded; the open filename is not substituted.'),
   parentRelationships:unavailable('The mother marker is known; actual parent/dependency part IDs are not decoded.'),locked:unavailable(unknownReason),
   partType:property(production.production?'Production':'Draft'),markerExport:property(production.markerExport),stitchPart:property(production.stitchPart),material:property(production.material),normalAmount:property(production.normal),mirroredAmount:property(production.mirrored),totalAmount:property(production.total),category:property(production.category),lastEdit:property(production.lastEdit)
  });
  if(part.summaryName!==undefined&&part.name!==part.summaryName)warnings.push('Native header and #TLIST names differ; both are displayed without rewriting either.');
  parts.push(Object.freeze({partId:part.id,name:part.name,summaryName:part.summaryName??null,nameSource:part.nameSource,persistentId:part.persistentId,history,objects,mother,fields,preview:Object.freeze(preview),listRecordCount,listObjectCount,rawListLine:part.summaryRawLine??null,warnings:Object.freeze(warnings)}));
 }
 const result=Object.freeze({readOnly:true,historyExecuted:false,parts:Object.freeze(parts),encoding:metadata.encoding,referenceSize:metadata.referenceSize?.name??null,warnings:Object.freeze([...metadata.warnings]),scope:'Verified names, native record/object counts and list mother marker only. Other native property fields remain unavailable.'});
 snapshots.set(document,result);return result;
}
