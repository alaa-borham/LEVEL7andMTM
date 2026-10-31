/**
 * Read-only native Z-definition reader. No formulas or native construction run.
 * The variable-length 6.34 layout was checked against all 335 ALAA entries and
 * the original application's F11 index/formula/record-position display.
 * Private authentication prevents public doc.bytes from changing parsed data.
 */
import {serializeMdl} from './native-mdl.js';

const documents=new WeakMap();
const KNOWN_FLAGS=new Set([0x0000,0x0c00,0x4c00,0xcc00]);
const MAX_ENTRIES=10000;
const align8=length=>Math.ceil(length/8)*8;
function fail(message,code='INVALID_NATIVE_Z'){const error=new Error(message);error.name='NativeZValuesError';error.code=code;throw error;}
function ensure(value,message,code){if(!value)fail(message,code);}
function ascii(bytes){let result='';for(const byte of bytes)result+=String.fromCharCode(byte);return result;}
function decoderFor(encoding){
  ensure(typeof encoding==='string'&&encoding.length>0&&encoding.length<=64,'A valid comment encoding name is required.','INVALID_ENCODING');
  try{return new TextDecoder(encoding,{fatal:false});}catch{fail('This comment encoding is unavailable.','INVALID_ENCODING');}
}

function readStoredTable(doc,partId){
  ensure(doc&&typeof doc==='object','Expected an authenticated native document.','INVALID_DOCUMENT');
  let tables=documents.get(doc);
  if(tables?.has(partId))return tables.get(partId);
  const bytes=serializeMdl(doc); // authenticates and copies the immutable source
  ensure(doc.variant==='VA','This native Z-definition layout is verified for VA only.','UNSUPPORTED_NATIVE_Z');
  ensure(doc.blocks.some(block=>block.id[0]===3&&block.id[1]===partId),'The requested native part is not present.','INVALID_PART');
  const candidates=doc.blocks.filter(block=>block.id[0]===3&&block.id[1]===partId&&block.id[2]===6&&block.id[3]===34);
  ensure(candidates.length<=1,'A unique native Z-definition block is required.');
  if(!tables){tables=new Map();documents.set(doc,tables);}
  if(!candidates.length){const result={entries:[],tableStatus:'absent',warnings:['This part has no stored Z-definition table.']};tables.set(partId,result);return result;}
  const block=candidates[0],body=bytes.subarray(block.payloadOffset,block.endOffset),v=new DataView(body.buffer,body.byteOffset,body.byteLength),entries=[],seen=new Set(),warnings=[];
  const histories=doc.blocks.filter(block=>block.id[0]===3&&block.id[1]===partId&&block.id[2]===2&&block.id[3]===0);
  const historyRecords=histories.length===1&&histories[0].payloadSize%32===0?histories[0].payloadSize/32:null;
  let offset=0;
  while(offset<body.length){
    ensure(entries.length<MAX_ENTRIES,'Native Z-definition count exceeds the read limit.');
    ensure(offset+24<=body.length,'Truncated native Z-definition header.');
    const length=v.getUint16(offset,true)*8,flags=v.getUint16(offset+2,true),index=v.getUint16(offset+4,true),recordStep=v.getUint16(offset+6,true),formulaLength=v.getUint16(offset+8,true),commentLength=v.getUint16(offset+10,true),referenceCount=v.getUint32(offset+12,true);
    ensure(length>=24&&offset+length<=body.length,'Native Z-definition length exceeds its block boundary.');
    ensure(index>0&&!seen.has(index),'Native Z-definition indices are zero or duplicated.');seen.add(index);
    const formulaStart=offset+24,commentStart=formulaStart+align8(formulaLength),referencesStart=commentStart+align8(commentLength),referenceBytes=referenceCount*12,expectedLength=align8(24+align8(formulaLength)+align8(commentLength)+referenceBytes);
    const layoutMatches=Number.isSafeInteger(referenceBytes)&&expectedLength===length;
    const knownFlags=KNOWN_FLAGS.has(flags);
    // Unknown flag families may carry a different inner schema. Their declared
    // outer entry span is retained, without interpreting out-of-range fields.
    ensure(layoutMatches||!knownFlags,'Native Z-definition text/reference lengths do not match its entry.');
    const reserved=body.subarray(offset+16,offset+24),opaque=!knownFlags||!layoutMatches||reserved.some(byte=>byte!==0);
    if(!knownFlags)warnings.push(`Z${index} has an unknown native flag family; it is retained as opaque data.`);
    if(!layoutMatches)warnings.push(`Z${index} has an unverified inner layout; only its raw entry is available.`);
    if(reserved.some(byte=>byte!==0))warnings.push(`Z${index} has unverified header fields; its semantics remain opaque.`);
    if(historyRecords!==null&&recordStep>historyRecords+1)warnings.push(`Z${index} refers to a construction position beyond the stored history.`);
    const formulaBytes=layoutMatches?body.slice(formulaStart,formulaStart+formulaLength):null,commentBytes=layoutMatches?body.slice(commentStart,commentStart+commentLength):null;
    const geometricReferences=[];
    if(layoutMatches)for(let n=0;n<referenceCount;n++)geometricReferences.push(body.slice(referencesStart+n*12,referencesStart+(n+1)*12));
    entries.push({index,recordStep,flags,opaque,layoutMatches,formulaBytes,commentBytes,geometricReferences,rawBytes:body.slice(offset,offset+length)});
    offset+=length;
  }
  ensure(offset===body.length,'Native Z-definition entries do not end at their block boundary.');
  const result={entries,tableStatus:entries.some(entry=>entry.opaque)?'partial':'available',warnings};tables.set(partId,result);return result;
}

export function readNativeZValues(doc,{partId,encoding='windows-1256'}={}){
  ensure(Number.isInteger(partId)&&partId>=1&&partId<=999,'Native part ID must be from 1 to 999.','INVALID_PART');
  const decoder=decoderFor(encoding),stored=readStoredTable(doc,partId),warnings=[...stored.warnings];
  const entries=stored.entries.map(entry=>{
    const formula=entry.formulaBytes===null?null:ascii(entry.formulaBytes),comment=entry.commentBytes===null?null:decoder.decode(entry.commentBytes);
    if(entry.formulaBytes?.some(byte=>byte>127))warnings.push(`Z${entry.index} contains non-ASCII formula bytes; no formula interpretation is available.`);
    if(comment?.includes('\ufffd'))warnings.push(`Z${entry.index} contains comment bytes not representable in the selected encoding.`);
    // Typed arrays cannot be frozen portably. Fresh copies on every public read
    // ensure their mutation never changes cached entries or the native document.
    return Object.freeze({index:entry.index,recordStep:entry.recordStep,formula,comment,flags:entry.flags,flagsHex:`0x${entry.flags.toString(16).padStart(4,'0')}`,geometricReferences:Object.freeze(entry.geometricReferences.map(bytes=>bytes.slice())),supportedForEvaluation:false,opaque:entry.opaque,layoutVerified:entry.layoutMatches,rawBytes:entry.rawBytes.slice(),formulaBytes:entry.formulaBytes?.slice()??null,commentBytes:entry.commentBytes?.slice()??null});
  });
  warnings.push('Stored Z formulas are displayed without evaluation; no native construction history is executed.');
  warnings.push('Numeric history input floats are not reported as current calculated Z values.');
  if(entries.some(entry=>entry.geometricReferences.length))warnings.push('Geometric operand references are retained as raw bytes; their native selectors are not interpreted.');
  return Object.freeze({partId,entries:Object.freeze(entries),entryCount:entries.length,tableStatus:stored.tableStatus,encoding:decoder.encoding,readOnly:true,historyExecuted:false,evaluated:false,warnings:Object.freeze([...new Set(warnings)])});
}
