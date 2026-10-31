/**
 * Read-only native X tables for the measured VA positive-entry grammar.
 * No construction history, size interpolation, unit interpretation or writing.
 * Interactive parameter blobs are not treated as ordinary numeric X tables.
 */
import {serializeMdl} from './native-mdl.js';

const verifiedDocuments=new WeakMap();
const DEFAULT_SIZE_KEY='        ';
function fail(message,code='INVALID_X_TABLE'){const error=new Error(message);error.name='NativeXValuesError';error.code=code;throw error;}
function ensure(condition,message,code){if(!condition)fail(message,code);}
function ascii(bytes,offset,length){let text='';for(let i=0;i<length;i++)text+=String.fromCharCode(bytes[offset+i]);return text;}
function verifiedSource(doc){
  // The production serializer authenticates document identity and copies its
  // retained private bytes. Public doc.bytes/originalBytes are never read.
  let source=doc&&typeof doc==='object'?verifiedDocuments.get(doc):null;
  if(!source){const bytes=serializeMdl(doc);source={bytes,blocks:doc.blocks,variant:doc.variant,tables:new Map()};verifiedDocuments.set(doc,source);}
  return source;
}
function warning(code,scope,blockId,message){return Object.freeze({code,scope,...(blockId?{blockId}:{}),message});}

function parseTable(bytes,block){
  const base=block.payloadOffset,length=block.payloadSize,v=new DataView(bytes.buffer,bytes.byteOffset+base,length),entries=[],keys=new Set();let offset=0,previousIndex=0;
  while(offset<length){
    ensure(length-offset>=24,'Truncated X entry header.');
    const units=v.getUint32(offset,true),byteLength=units*8,index=v.getUint16(offset+4,true),flag=v.getUint8(offset+14),labelLength=v.getUint8(offset+15),value=v.getFloat32(offset+16,true),opaque=v.getUint32(offset+20,true);
    ensure(units>=3&&byteLength<=length-offset,'X entry length lies outside its table.');
    // Some VA tables end in a reserved empty slot numbered 81. It is not an
    // editable X value. Admit only its exact empty terminal representation;
    // the private source and parameter writer retain its bytes unchanged.
    if(index===81){
      ensure(byteLength===24&&offset+byteLength===length&&previousIndex===80&&
        bytes.subarray(base+offset+6,base+offset+14).every(b=>b===32)&&
        bytes.subarray(base+offset+14,base+offset+24).every(b=>b===0),
        'Unrecognized reserved X terminal slot.');
      offset+=byteLength;continue;
    }
    ensure(index>=1&&index<=80&&index>=previousIndex,'X indices are outside the measured ordered range 1 to 80.');
    const sizeBytes=bytes.subarray(base+offset+6,base+offset+14);
    ensure(sizeBytes.every(b=>b>=32&&b<=126),'X size key is outside the measured eight-character encoding.');
    const sizeKey=ascii(bytes,base+offset+6,8),key=index+'\0'+sizeKey;
    ensure(!keys.has(key),'Duplicate X index and size key make the table ambiguous.');
    ensure(flag===0,'This X entry flag or interactive parameter encoding is not decoded.');
    // This opaque word is retained, not interpreted. Only zero is measured for
    // these plain scalar tables; nonzero parameter structures stay unavailable.
    ensure(opaque===0,'A nonzero opaque X word is outside the measured scalar table grammar.');
    ensure(Number.isFinite(value),'An X table entry contains a nonfinite numeric value.');
    ensure(byteLength===Math.ceil((24+labelLength)/8)*8,'X label length disagrees with the declared entry span.');
    entries.push({index,sizeKey,isDefault:sizeKey===DEFAULT_SIZE_KEY,value,units,byteLength,flag,opaque,labelLength,ordinal:entries.length,payloadOffset:offset,rawEntry:bytes.subarray(base+offset,base+offset+byteLength),rawSizeKey:sizeBytes,rawLabel:bytes.subarray(base+offset+24,base+offset+24+labelLength),rawPadding:bytes.subarray(base+offset+24+labelLength,base+offset+byteLength)});
    keys.add(key);previousIndex=index;offset+=byteLength;
  }
  ensure(offset===length,'X entry chain does not end at its table boundary.');
  return entries;
}

function table(source,id,scope){
  const key=id.join('.');let cached=source.tables.get(key);if(cached)return cached;
  const matches=source.blocks.filter(b=>b.id.every((v,i)=>v===id[i]));
  if(!matches.length)cached={scope,blockId:key,status:'absent',payloadBytes:0,entries:[]};
  else if(matches.length!==1)cached={scope,blockId:key,status:'unavailable',payloadBytes:null,entries:[],code:'AMBIGUOUS_X_TABLE',reason:'A unique native X table is required.'};
  else if(source.variant!=='VA')cached={scope,blockId:key,status:'unavailable',payloadBytes:matches[0].payloadSize,entries:[],code:'UNSUPPORTED_X_VARIANT',reason:'X table display is measured for native VA files only.'};
  else{try{cached={scope,blockId:key,status:'available',payloadBytes:matches[0].payloadSize,entries:parseTable(source.bytes,matches[0])};}catch(error){cached={scope,blockId:key,status:'unavailable',payloadBytes:matches[0].payloadSize,entries:[],code:'UNSUPPORTED_X_TABLE',reason:error.message||'The native table is outside the measured X entry grammar.'};}}
  source.tables.set(key,cached);return cached;
}

function publicTable(privateTable,decoder,partId,sizeKey,warnings){
  let entries=[];
  const {scope,blockId}=privateTable;
  let status=privateTable.status,reason=privateTable.reason;
  if(status==='unavailable')warnings.push(warning(privateTable.code,scope,blockId,reason));
  if(status==='available'){
    try{entries=privateTable.entries.map(entry=>Object.freeze({...entry,scope,partId:scope==='local'?partId:null,label:decoder.decode(entry.rawLabel),rawEntry:entry.rawEntry.slice(),rawSizeKey:entry.rawSizeKey.slice(),rawLabel:entry.rawLabel.slice(),rawPadding:entry.rawPadding.slice(),paddingIsZero:entry.rawPadding.every(b=>b===0)}));}
    catch(error){entries=[];status='unavailable';reason='X comments cannot be decoded using the explicitly selected encoding.';warnings.push(warning('X_LABEL_DECODING_FAILED',scope,blockId,reason));}
  }
  const byIndex=new Map();for(const entry of entries){let group=byIndex.get(entry.index);if(!group){group={scope,partId:scope==='local'?partId:null,index:entry.index,entries:[]};byIndex.set(entry.index,group);}group.entries.push(entry);}
  const groups=[...byIndex.values()].map(group=>Object.freeze({...group,entries:Object.freeze(group.entries),defaultEntry:group.entries.find(e=>e.isDefault)||null,overrides:Object.freeze(group.entries.filter(e=>!e.isDefault)),requestedEntry:sizeKey===undefined?null:group.entries.find(e=>e.sizeKey===sizeKey)||null}));
  return{entries:Object.freeze(entries),groups:Object.freeze(groups),info:Object.freeze({scope,blockId,status,entryCount:entries.length,groupCount:groups.length,payloadBytes:privateTable.payloadBytes,...(reason?{reason}:{})})};
}

export function readNativeXValues(doc,{partId,encoding='windows-1256',sizeKey}={}){
  ensure(Number.isInteger(partId)&&partId>0&&partId<=0x7fffffff,'A positive native part ID is required.','INVALID_X_PART');
  ensure(typeof encoding==='string'&&encoding.length>0&&encoding.length<=64,'An explicit supported text encoding is required.','INVALID_X_ENCODING');
  if(sizeKey!==undefined)ensure(typeof sizeKey==='string'&&sizeKey.length===8&&[...sizeKey].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)<=126),'A requested X size key must contain exactly eight ASCII characters.','INVALID_X_SIZE_KEY');
  let decoder;try{decoder=new TextDecoder(encoding,{fatal:true});}catch{fail('The selected X comment encoding is unavailable.','INVALID_X_ENCODING');}
  const source=verifiedSource(doc),warnings=[warning('READ_ONLY_X_VALUES','document',null,'X values are displayed read-only; native parameter changes and construction recalculation are not enabled.'),warning('X_UNITS_AND_SIZE_RESOLUTION','document',null,'Units depend on the consuming construction. Size entries are displayed separately; interpolation and effective-size values are not calculated.')];
  ensure(source.blocks.some(b=>b.id[0]===3&&b.id[1]===partId),'The requested native part does not exist.','INVALID_X_PART');
  const global=publicTable(table(source,[2,3,0,0],'global'),decoder,partId,sizeKey,warnings),local=publicTable(table(source,[3,partId,3,1],'local'),decoder,partId,sizeKey,warnings);
  return Object.freeze({partId,encoding:decoder.encoding,readOnly:true,historyExecuted:false,sizeKey:sizeKey??null,globalEntries:global.entries,localEntries:local.entries,groups:Object.freeze([...global.groups,...local.groups]),tables:Object.freeze({global:global.info,local:local.info}),warnings:Object.freeze(warnings)});
}
