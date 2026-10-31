/**
 * Browser-only native GRAFIS MDL container and deliberately limited history editor.
 * Known one-part, one-size VA point/line append is validated by original-program
 * replay, including two newly created objects with zero placeholder handles.
 * Unknown fields are retained; this does not imply arbitrary MDL compatibility.
 * No GRAFIS program code is copied or executed. Unknown native data is retained.
 * The container/check algorithm was independently validated on original-created
 * fixtures, with the unusual reduction cross-checked against public research:
 * https://github.com/alaa-borham/LEVEL7-Nesting/blob/370fa732c0be39ac2c3c51d01d8803f911b556f9/level7/formats/grafis/container.py
 * Supported editing: verified VA, one-part, one-size absolute-point/straight-line
 * families only. Reading a valid container does not imply semantic compatibility.
 */
const SIGNATURE='GRAFIS-Modelldatei';
const BLOCK_MARK='BLO5kenn';
const TRAILER='mdlEND_5';
const MAX_BYTES=30*1024*1024;
const MAX_COORDINATE=1_000_000;
const state=new WeakMap();
// Own controlled empty model, created and saved in the original application.
// Exact bytes are deliberately pinned: other empty MDL layouts are unsupported.
const NATIVE_N38_TEMPLATE_HEX=
  'fd6e2200330200004752414649532d4d6f64656c6c646174656956410a000a0000000000000000000000000000000000'+
  '0000000000000000000000000000000000000000000000000000000000000000d4690f0009000000424c4f356b656e6e'+
  '01000000010000000000000000000000010000000100000000000000000000000000803f000000000000000000000000'+
  '000000000000000045ce7d0216000000424c4f356b656e6e020000000100000000000000000000002356455253494f4e'+
  '0d0a313030300d0a234752445441420d0a203e203031202020202020205f5f5f4e33385f300d0a23544c4953540d0a20'+
  '20203030312078204e4e2020202020202020202020202020202020202020202020202030202020302020202020202020'+
  '2020202049443d363543304439303330314444354545350d0a23454e44494e464f0d0a0000000000ee31f50890010000'+
  '424c4f356b656e6e02000000020000000000000000000000040002ff0100ff5f5f5f4e33385f30ff2020202020202020'+
  '0000000000000000040002ff0200ff20202020202020200020202020202020200000000000000000040002ff0300ff20'+
  '202020202020200020202020202020200000000000000000040002ff0400ff2020202020202020002020202020202020'+
  '0000000000000000040002ff0500ff20202020202020200020202020202020200000000000000000040002ff0600ff20'+
  '202020202020200020202020202020200000000000000000040002ff0700ff2020202020202020002020202020202020'+
  '0000000000000000040002ff0800ff20202020202020200020202020202020200000000000000000040002ff0900ff20'+
  '202020202020200020202020202020200000000000000000040002ff0a00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff0b00ff20202020202020200020202020202020200000000000000000040002ff0c00ff20'+
  '202020202020200020202020202020200000000000000000040002ff0d00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff0e00ff20202020202020200020202020202020200000000000000000040002ff0f00ff20'+
  '202020202020200020202020202020200000000000000000040002ff1000ff2020202020202020002020202020202020'+
  '0000000000000000040002ff1100ff20202020202020200020202020202020200000000000000000040002ff1200ff20'+
  '202020202020200020202020202020200000000000000000040002ff1300ff2020202020202020002020202020202020'+
  '0000000000000000040002ff1400ff20202020202020200020202020202020200000000000000000040002ff1500ff20'+
  '202020202020200020202020202020200000000000000000040002ff1600ff2020202020202020002020202020202020'+
  '0000000000000000040002ff1700ff20202020202020200020202020202020200000000000000000040002ff1800ff20'+
  '202020202020200020202020202020200000000000000000040002ff1900ff2020202020202020002020202020202020'+
  '0000000000000000040002ff1a00ff20202020202020200020202020202020200000000000000000040002ff1b00ff20'+
  '202020202020200020202020202020200000000000000000040002ff1c00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff1d00ff20202020202020200020202020202020200000000000000000040002ff1e00ff20'+
  '202020202020200020202020202020200000000000000000040002ff1f00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff2000ff20202020202020200020202020202020200000000000000000040002ff2100ff20'+
  '202020202020200020202020202020200000000000000000040002ff2200ff2020202020202020002020202020202020'+
  '0000000000000000040002ff2300ff20202020202020200020202020202020200000000000000000040002ff2400ff20'+
  '202020202020200020202020202020200000000000000000040002ff2500ff2020202020202020002020202020202020'+
  '0000000000000000040002ff2600ff20202020202020200020202020202020200000000000000000040002ff2700ff20'+
  '202020202020200020202020202020200000000000000000040002ff2800ff2020202020202020002020202020202020'+
  '0000000000000000040002ff2900ff20202020202020200020202020202020200000000000000000040002ff2a00ff20'+
  '202020202020200020202020202020200000000000000000040002ff2b00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff2c00ff20202020202020200020202020202020200000000000000000040002ff2d00ff20'+
  '202020202020200020202020202020200000000000000000040002ff2e00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff2f00ff20202020202020200020202020202020200000000000000000040002ff3000ff20'+
  '202020202020200020202020202020200000000000000000040002ff3100ff2020202020202020002020202020202020'+
  '0000000000000000040002ff3200ff20202020202020200020202020202020200000000000000000040002ff3300ff20'+
  '202020202020200020202020202020200000000000000000040002ff3400ff2020202020202020002020202020202020'+
  '0000000000000000040002ff3500ff20202020202020200020202020202020200000000000000000040002ff3600ff20'+
  '202020202020200020202020202020200000000000000000040002ff3700ff2020202020202020002020202020202020'+
  '0000000000000000040002ff3800ff20202020202020200020202020202020200000000000000000040002ff3900ff20'+
  '202020202020200020202020202020200000000000000000040002ff3a00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff3b00ff20202020202020200020202020202020200000000000000000040002ff3c00ff20'+
  '202020202020200020202020202020200000000000000000040002ff3d00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff3e00ff20202020202020200020202020202020200000000000000000040002ff3f00ff20'+
  '202020202020200020202020202020200000000000000000040002ff4000ff2020202020202020002020202020202020'+
  '0000000000000000040002ff4100ff20202020202020200020202020202020200000000000000000040002ff4200ff20'+
  '202020202020200020202020202020200000000000000000040002ff4300ff2020202020202020002020202020202020'+
  '0000000000000000040002ff4400ff20202020202020200020202020202020200000000000000000040002ff4500ff20'+
  '202020202020200020202020202020200000000000000000040002ff4600ff2020202020202020002020202020202020'+
  '0000000000000000040002ff4700ff20202020202020200020202020202020200000000000000000040002ff4800ff20'+
  '202020202020200020202020202020200000000000000000040002ff4900ff2020202020202020002020202020202020'+
  '0000000000000000040002ff4a00ff20202020202020200020202020202020200000000000000000040002ff4b00ff20'+
  '202020202020200020202020202020200000000000000000040002ff4c00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff4d00ff20202020202020200020202020202020200000000000000000040002ff4e00ff20'+
  '202020202020200020202020202020200000000000000000040002ff4f00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff5000ff20202020202020200020202020202020200000000000000000040002ff5100ff20'+
  '202020202020200020202020202020200000000000000000040002ff5200ff2020202020202020002020202020202020'+
  '0000000000000000040002ff5300ff20202020202020200020202020202020200000000000000000040002ff5400ff20'+
  '202020202020200020202020202020200000000000000000040002ff5500ff2020202020202020002020202020202020'+
  '0000000000000000040002ff5600ff20202020202020200020202020202020200000000000000000040002ff5700ff20'+
  '202020202020200020202020202020200000000000000000040002ff5800ff2020202020202020002020202020202020'+
  '0000000000000000040002ff5900ff20202020202020200020202020202020200000000000000000040002ff5a00ff20'+
  '202020202020200020202020202020200000000000000000040002ff5b00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff5c00ff20202020202020200020202020202020200000000000000000040002ff5d00ff20'+
  '202020202020200020202020202020200000000000000000040002ff5e00ff2020202020202020002020202020202020'+
  '0000000000000000040002ff5f00ff20202020202020200020202020202020200000000000000000040002ff6000ff20'+
  '202020202020200020202020202020200000000000000000040002ff6100ff2020202020202020002020202020202020'+
  '0000000000000000040002ff6200ff20202020202020200020202020202020200000000000000000040002ff6300ff20'+
  '202020202020200020202020202020200000000000000000c9e396000a000000424c4f356b656e6e0200000004000000'+
  '00000000000000000400033235302d57657274652d4f5054494d41535320202020202020202020200200060062617369'+
  '735f64202020202012c4b00c46000000424c4f356b656e6e020000000600000000000000000000000300000a04000000'+
  '4454344241535f43425900f2504820200300000a060000004454344241535f4344542e0a120c2d110300000a04000000'+
  '4454344241535f435652000040412d110400000f040000004752445441425f535f544f50494458010000000080dfa80f'+
  '0300000c040000004d415345445f46494c544552000000000300000b040000004d415345445f464e414d454e2e4e2e00'+
  '1100000a70000000424c35306b656e6e2e29a9b72015a3c9f3ce88b72015ab30f3ce3fb72015a309f3ce3db72015a334'+
  'f3ce1eb72015abedf3ce86b72015aba8f3ce86b72015aa0cf3ce86b72015ab8af3ce88b72015a2b3f3ce08b72015a287'+
  'f3ce08b72015e287f3ce1cb72015ab1cf3ce86b72015eba8f3ce86b72015a2aaf3ce0000000000000300000a04000000'+
  '4454344241535f4c555300f250482d110300000a040000004454344241535f4c5652000040412d110300000a06000000'+
  '4454344241535f4c44542e0a120d14021100000a70000000424c30356b656e6e2e290000c841802647480000c841c0da'+
  'd7480000c841800248480000c84180d849480000c841c034d8480000c841c09694480000c841408094480000c841c087'+
  '94480000c841005fd7480000c8410045d3480000c8412045d3480000c841c088d9480000c841e09694480000c8410097'+
  '94480000000000000400000d040000004752445441425f415f5341564500000000616974202e2e2eff3ab60017000000'+
  '424c4f356b656e6e03000000010000000100000000000000000000000000000000000000000000000100000000000000'+
  '00000000000000000000000000000000000000000000000000000000060000001d040000000000000000000000000000'+
  '0000000003d9c065e55edd0100000000000000000000803f00000000024e4e2020202020202020202020202020202020'+
  '2020202000000000000000000000000000000000000000000000000000000000cdf6080004000000424c4f356b656e6e'+
  '03000000010000000200000000000000e7f6080004000000424c4f356b656e6e03000000010000000400000000000000'+
  'f4f6080004000000424c4f356b656e6e0300000001000000050000000000000028b10c0007000000424c4f356b656e6e'+
  '030000000100000006000000060000000300050000000000000000002e0a120c2d110000000000006d646c454e445f35';
const nativeN38TemplateBytes=Uint8Array.from(NATIVE_N38_TEMPLATE_HEX.match(/../g),pair=>Number.parseInt(pair,16));
export const NATIVE_N38_TEMPLATE_INFO=Object.freeze({name:'N38 native template',sourceSha256:'97e44d17c9fa1a7daabdd0d43c1076d0044edb5c5b76f8e0de48473d7eabb469',byteLength:4512,variant:'VA',measurementSystem:'50-Werte-OPTIMASS',measurementSystemCode:'basis_d',referenceSize:'___N38_0',partId:1,partName:'NN',persistentPartId:'65C0D90301DD5EE5',retainsPersistentIdentity:true,freshNativeIdentity:false});
export function getNativeN38TemplateBytes(){return nativeN38TemplateBytes.slice();}
function isNativeN38Template(bytes){return equalBytes(bytes,nativeN38TemplateBytes);}

function fail(message,code='INVALID_MDL'){const error=new Error(message);error.name='NativeMdlError';error.code=code;throw error;}
function ascii(bytes,offset,length){let result='';for(let i=offset;i<offset+length;i++)result+=String.fromCharCode(bytes[i]);return result;}
function view(bytes){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
function check(bytes,offset,length){
  const data=view(bytes);let total=0;
  for(let relative=4;relative<length;relative+=2){total=(total+Math.imul(relative/2+1,data.getInt16(offset+relative,true)))|0;if(total>=1_024_000_000)total-=1_024_000_000;}
  return total>>>0;
}
function sameId(id,expected){return id.length===expected.length&&id.every((value,index)=>value===expected[index]);}
function idText(id){return id.join('.');}
function documentState(doc){const result=state.get(doc);if(!result)fail('Expected a native document returned by parseMdl().','INVALID_DOCUMENT');return result;}
function blockFor(parsed,id){const matches=parsed.blocks.filter(block=>sameId(block.id,id));return matches.length===1?matches[0]:null;}
function equalBytes(a,b){return a.length===b.length&&a.every((value,index)=>value===b[index]);}

function parseBytes(bytes){
  if(bytes.length<88||bytes.length>MAX_BYTES||bytes.length%8)fail('MDL size must be a multiple of eight between 88 bytes and 30 MiB.');
  const data=view(bytes);
  if(ascii(bytes,8,SIGNATURE.length)!==SIGNATURE)fail('The native GRAFIS MDL signature is missing at byte 8.');
  const variant=ascii(bytes,8+SIGNATURE.length,2);
  if(data.getUint32(4,true)*8+8!==bytes.length)fail('MDL declared length does not match the file size.');
  if(check(bytes,0,80)!==data.getUint32(0,true))fail('MDL header integrity check failed.');
  if(ascii(bytes,bytes.length-8,8)!==TRAILER)fail('MDL final mdlEND_5 marker is missing.');
  const blocks=[],occurrences=new Map();let offset=80;
  while(offset<bytes.length-8){
    if(blocks.length>=100000||offset+32>bytes.length-8)fail('MDL has a truncated or excessive block chain.');
    const units=data.getUint32(offset+4,true),size=units*8;
    if(units<4||offset+size>bytes.length-8)fail(`MDL block at ${offset} has an invalid length.`);
    if(ascii(bytes,offset+8,8)!==BLOCK_MARK)fail(`MDL block marker is invalid at ${offset+8}.`);
    const id=Object.freeze([0,1,2,3].map(index=>data.getUint32(offset+16+index*4,true)));
    const storedCheck=data.getUint32(offset,true),calculatedCheck=check(bytes,offset,size);
    if(storedCheck!==calculatedCheck)fail(`MDL block ${idText(id)} integrity check failed.`);
    const label=idText(id),occurrence=occurrences.get(label)??0;occurrences.set(label,occurrence+1);
    blocks.push(Object.freeze({index:blocks.length,key:`${label}#${occurrence}`,id,occurrence,offset,size,units,endOffset:offset+size,payloadOffset:offset+32,payloadSize:size-32,storedCheck,calculatedCheck,checkMatches:true}));
    offset+=size;
  }
  if(offset!==bytes.length-8)fail('MDL block chain does not end at its final marker.');
  return{variant,header:Object.freeze({size:bytes.length,byteLength:bytes.length,headerBytes:80,storedCheck:data.getUint32(0,true),calculatedCheck:check(bytes,0,80),lengthUnits:data.getUint32(4,true),checkMatches:true,lengthMatches:true}),blocks:Object.freeze(blocks),warnings:variant==='VA'?[]:[`Format ${variant} is retained for inspection; native edits are verified only for VA.`]};
}

function makeDocument(bytes,originalBytes,modified=false){
  const parsed=parseBytes(bytes);
  // Inspection arrays are copies: external mutation cannot alter the verified
  // serialized document or the original retained in the private state. Most
  // calculation snapshots never inspect these arrays; allocate each only when
  // requested, and retain its identity for callers that edit their own copy.
  let inspectionBytes,inspectionOriginalBytes;
  const doc=Object.freeze({kind:'grafis-mdl',get bytes(){return inspectionBytes??=bytes.slice();},get originalBytes(){return inspectionOriginalBytes??=originalBytes.slice();},variant:parsed.variant,header:parsed.header,blocks:parsed.blocks,warnings:Object.freeze([...parsed.warnings]),modified});
  state.set(doc,{bytes,originalBytes,parsed});return doc;
}

export function parseMdl(input){
  if(!(input instanceof Uint8Array))fail('parseMdl expects a Uint8Array.','INVALID_INPUT');
  if(input.byteLength>MAX_BYTES)fail('MDL exceeds the 30 MiB native import limit.');
  const bytes=new Uint8Array(input);return makeDocument(bytes,bytes,false);
}

export function serializeMdl(doc){return documentState(doc).bytes.slice();}

const POINT_HEADERS=[[197,100,9601,0],[297,200,9602,0],[396,301,12,0],[494,401,1,0]];
const LINE_HEADERS=[[196,101,2,0],[296,201,2,0],[394,301,2,0]];
const validObjectId=value=>Number.isInteger(value)&&value>0&&value<=0x7fffffff;
const validCoordinate=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=MAX_COORDINATE;
const expectedArgs=(...entries)=>{const result=[0,0,0,0,0,0];for(const [index,value]of entries)result[index]=value;return result;};
function headerAt(data,offset){return[0,2,4,6].map(delta=>data.getUint16(offset+delta,true));}
function argsAt(data,offset){return[8,12,16,20,24,28].map(delta=>data.getUint32(offset+delta,true));}
function expectArgs(actual,expected){return actual.every((value,index)=>expected[index]===null||value===expected[index]);}

function readHistory(bytes,parsed,partId){
  const history=blockFor(parsed,[3,partId,2,0]),records=[],points=[],lines=[],objects=new Map(),unsupported=[];
  if(!history)return{history,records,points,lines,unsupported:[{recordIndex:null,reason:'Exactly one native construction-record block is required.'}],complete:false};
  if(history.payloadSize%32)return{history,records,points,lines,unsupported:[{recordIndex:null,reason:'Native construction payload is not a verified 32-byte record sequence.'}],complete:false};
  const data=view(bytes),count=history.payloadSize/32;
  for(let index=0;index<count;index++){const offset=history.payloadOffset+index*32;records.push({index,recordIndex:index,step:index+1,offset,header:headerAt(data,offset),kind:'unsupported',label:'Unknown native construction step'});}
  function reject(index,reason){unsupported.push({recordIndex:index,step:index+1,header:records[index]?.header??null,reason});}
  let index=0;
  while(index<count){
    const pointStart=sameId(records[index].header,POINT_HEADERS[0]);
    const lineStart=sameId(records[index].header,LINE_HEADERS[0]);
    if(!pointStart&&!lineStart){reject(index,'Unrecognized native opcode; editing is disabled to preserve its semantics.');break;}
    const headers=pointStart?POINT_HEADERS:LINE_HEADERS;
    if(index+headers.length>count||!headers.every((header,relative)=>sameId(records[index+relative].header,header))){reject(index,`Incomplete or altered ${pointStart?'absolute-point':'line-reference'} operation.`);break;}
    const offsets=headers.map((_,relative)=>history.payloadOffset+(index+relative)*32);
    const args=offsets.map(offset=>argsAt(data,offset));
    if(pointStart){
      const x=data.getFloat32(offsets[0]+8,true),y=data.getFloat32(offsets[1]+8,true),objectId=args[3][1];
      const valid=validCoordinate(x)&&validCoordinate(y)&&validObjectId(objectId)&&!objects.has(objectId)&&expectArgs(args[0],expectedArgs([0,null]))&&expectArgs(args[1],expectedArgs([0,null]))&&expectArgs(args[2],expectedArgs([2,18]))&&expectArgs(args[3],expectedArgs([1,objectId]));
      if(!valid){reject(index,'Absolute-point arguments, object identity, or reserved fields do not match the verified grammar.');break;}
      const point={id:objectId,objectId,x,y,recordIndices:{x:index,y:index+1,create:index+3},createdAtRecord:index+4};points.push(point);objects.set(objectId,{type:'point',point});
      const kinds=['absolute-point-x','absolute-point-y','absolute-point-mode','absolute-point-create'];
      for(let relative=0;relative<4;relative++)Object.assign(records[index+relative],{kind:kinds[relative],label:['Absolute X input','Absolute Y input','Absolute point construction','Create point'][relative],objectId,...(relative===0?{value:x}:relative===1?{value:y}:{})});
    }else{
      const startPointId=args[0][0],endPointId=args[1][0],objectId=args[2][1];
      const start=objects.get(startPointId),end=objects.get(endPointId);
      const valid=validObjectId(objectId)&&!objects.has(objectId)&&start?.type==='point'&&end?.type==='point'&&startPointId!==endPointId&&expectArgs(args[0],expectedArgs([0,startPointId],[1,65536],[2,18]))&&expectArgs(args[1],expectedArgs([0,endPointId],[1,65536],[2,19]))&&expectArgs(args[2],expectedArgs([1,objectId]));
      if(!valid){reject(index,'Line arguments or point references do not match the verified native grammar.');break;}
      const a={x:start.point.x,y:start.point.y},b={x:end.point.x,y:end.point.y},length=Math.hypot(b.x-a.x,b.y-a.y);
      if(!Number.isFinite(length)||length===0){reject(index,'A zero-length or invalid native line is outside the verified edit grammar.');break;}
      const line={id:objectId,objectId,startPointId,endPointId,a,b,x1:a.x,y1:a.y,x2:b.x,y2:b.y,length,createdAtRecord:index+3};lines.push(line);objects.set(objectId,{type:'line',line});
      for(let relative=0;relative<3;relative++)Object.assign(records[index+relative],{kind:['line-start-reference','line-end-reference','line-create'][relative],label:['Existing start point','Existing end point','Create straight line'][relative],objectId,...(relative<2?{pointId:relative===0?startPointId:endPointId}:{})});
    }
    index+=headers.length;
  }
  return{history,records,points,lines,unsupported,complete:unsupported.length===0};
}

// History inputs and evaluated coordinates share the same float32 encoding.
// A relative geometric tolerance can hide a real stale cache at large X/Y.
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a===b;
function pointEqual(a,b){return close(a.x,b.x)&&close(a.y,b.y);}
function pairAt(data,offset){return{x:data.getFloat32(offset,true),y:data.getFloat32(offset+4,true)};}
function boundsOf(points){return{min:{x:Math.min(...points.map(point=>point.x)),y:Math.min(...points.map(point=>point.y))},max:{x:Math.max(...points.map(point=>point.x)),y:Math.max(...points.map(point=>point.y))}};}

function inspectCache(bytes,parsed,partId,history){
  const reasons=[],cacheBlocks=parsed.blocks.filter(block=>block.id[0]===3&&block.id[1]===partId&&block.id[2]===7);
  if(!history.points.length)return{reasons:['There are no supported absolute points to edit.'],block:null,layout:null,stale:false};
  if(cacheBlocks.length!==1||!sameId(cacheBlocks[0].id,[3,partId,7,1]))return{reasons:['Only one verified base-size geometry cache (3,part,7,1) can be edited.'],block:null,layout:null,stale:false};
  const block=cacheBlocks[0],data=view(bytes),base=block.payloadOffset;
  const objects=[...history.points.map(point=>({...point,type:'point'})),...history.lines.map(line=>({...line,type:'line'}))].sort((a,b)=>a.createdAtRecord-b.createdAtRecord);
  const count=objects.length,poolOffset=base+8+40*count,expectedLength=8+40*count+8*(history.points.length+2*history.lines.length);
  if(block.payloadSize!==expectedLength)return{reasons:['Native cache length does not match the supported fixed object table and point/line sample pool.'],block,layout:null,stale:false};
  if(data.getUint32(base,true)!==count||data.getUint32(base+4,true)!==block.payloadSize/8)reasons.push('Native cache object count or length is inconsistent.');
  const pointLayouts=[],lineLayouts=[];let position=poolOffset;
  for(let index=0;index<count;index++){
    const object=objects[index],headerOffset=base+8+index*40,sampleCount=object.type==='point'?1:2,flags=object.type==='point'?66049:66050;
    // The two reference/extra fields remain zero for this limited grammar.
    // The handle at +16 is retained, never synthesized or reinterpreted.
    if(data.getUint32(headerOffset,true)!==object.objectId||data.getUint32(headerOffset+4,true)!==0||data.getUint32(headerOffset+8,true)!==0||data.getUint32(headerOffset+12,true)!==sampleCount||data.getUint32(headerOffset+20,true)!==flags)reasons.push(`Cached object ${object.objectId} has unverified native order, sample count, flags or references.`);
    if(object.type==='point')pointLayouts.push({objectId:object.objectId,headerOffset,coordinateOffsets:[headerOffset+24,headerOffset+32,position]});
    else lineLayouts.push({objectId:object.objectId,headerOffset,minOffset:headerOffset+24,maxOffset:headerOffset+32,startOffsets:[position],endOffsets:[position+8]});
    position+=sampleCount*8;
  }
  if(position!==base+block.payloadSize)reasons.push('Native sample pool does not end at its declared boundary.');
  const cachedPoints=[];
  for(const layout of pointLayouts){
    const first=pairAt(data,layout.coordinateOffsets[0]);
    if(!validCoordinate(first.x)||!validCoordinate(first.y)||layout.coordinateOffsets.some(offset=>!pointEqual(first,pairAt(data,offset))))reasons.push(`Cached point ${layout.objectId} has inconsistent coordinates.`);
    cachedPoints.push({...first,objectId:layout.objectId});
  }
  const cachedById=new Map(cachedPoints.map(point=>[point.objectId,point]));
  const linesById=new Map(history.lines.map(line=>[line.objectId,line]));
  for(const lineLayout of lineLayouts){
    const line=linesById.get(lineLayout.objectId),a=cachedById.get(line.startPointId),b=cachedById.get(line.endPointId),lineBounds=boundsOf([a,b]);
    if(lineLayout.startOffsets.some(offset=>!pointEqual(pairAt(data,offset),a))||lineLayout.endOffsets.some(offset=>!pointEqual(pairAt(data,offset),b))||!pointEqual(pairAt(data,lineLayout.minOffset),lineBounds.min)||!pointEqual(pairAt(data,lineLayout.maxOffset),lineBounds.max))reasons.push('Cached line endpoints or bounds do not match the verified point references.');
  }
  const stale=cachedPoints.some((point,index)=>!pointEqual(point,history.points[index]));
  const shape=history.points.length===1&&history.lines.length===0?'point':history.points.length===2&&history.lines.length===0?'two-points':history.points.length===2&&history.lines.length===1?'two-points-line':'absolute-points-straight-lines';
  return{reasons,block,layout:{shape,pointLayouts,lineLayouts},stale,cachedPoints};
}

function editGate(bytes,parsed,partId,history,cache){
  const reasons=[...history.unsupported.map(item=>item.reason),...cache.reasons];
  if(parsed.variant!=='VA')reasons.push('Native edits are verified for VA only; this format is retained read-only.');
  const parts=[...new Set(parsed.blocks.filter(block=>block.id[0]===3&&block.id[1]>0).map(block=>block.id[1]))];
  if(parts.length!==1||parts[0]!==partId)reasons.push('Multi-part native dependencies are not verified; edits are disabled.');
  const allowedGlobal=new Set(['1.1.0.0','2.1.0.0','2.2.0.0','2.4.0.0','2.6.0.0']);
  const allowedPart=new Map([['1.0',184],['2.0',null],['4.0',32],['5.0',32],['6.4',80],['6.6',56],['7.1',null]]);
  const ids=new Set();
  for(const block of parsed.blocks){
    const label=idText(block.id);if(ids.has(label))reasons.push(`Duplicate native block ${label} prevents safe edits.`);ids.add(label);
    if(block.id[0]!==3){if(!allowedGlobal.has(label))reasons.push(`Unknown native block ${label} may contain dependencies; edits are disabled.`);continue;}
    const key=`${block.id[2]}.${block.id[3]}`;
    if(block.id[1]!==partId||!allowedPart.has(key)||(allowedPart.get(key)!==null&&block.size!==allowedPart.get(key)))reasons.push(`Native part block ${label} is outside the verified edit family.`);
  }
  const header=blockFor(parsed,[3,partId,1,0]);
  if(!header||header.payloadSize<24||view(bytes).getUint32(header.payloadOffset+20,true)!==history.records.length*4)reasons.push('Native part record counter does not match the known construction history.');
  const sizeTable=blockFor(parsed,[2,2,0,0]);
  if(!sizeTable||sizeTable.payloadSize!==3168)reasons.push('A verified one-size native table is required for editing.');
  else{
    const names=[];const data=view(bytes);
    for(let index=0;index<99;index++){const offset=sizeTable.payloadOffset+index*32;
      if(data.getUint16(offset,true)!==4||bytes[offset+2]!==2||bytes[offset+3]!==255||data.getUint16(offset+4,true)!==index+1||bytes[offset+6]!==255)reasons.push('The native size table has an unverified record encoding.');
      if(ascii(bytes,offset+7,8).trim())names.push(index);
    }
    if(names.length!==1||names[0]!==0)reasons.push('Only one verified reference size in the first table row is editable; grading remains read-only.');
  }
  return[...new Set(reasons)];
}

// 0.9.116: a document never changes after parseMdl/makeDocument (edits build a new
// document from a copy), so its per-part analysis is computed once. Switching parts
// used to re-validate the whole file every time.
const analysisCache=new WeakMap();
function analyze(doc,partId){
  let perPart=analysisCache.get(doc);if(!perPart){perPart=new Map();analysisCache.set(doc,perPart);}
  const known=perPart.get(partId);if(known)return known;
  const {bytes,parsed}=documentState(doc);
  const history=readHistory(bytes,parsed,partId),cache=inspectCache(bytes,parsed,partId,history),reasons=editGate(bytes,parsed,partId,history,cache);
  const result={history,cache,reasons};perPart.set(partId,result);return result;
}

export function decodeSupportedHistory(doc,partId=1,{throughRecord}={}){
  if(!Number.isInteger(partId)||partId<1||partId>999)fail('Native part ID must be an integer from 1 to 999.','INVALID_PART');
  const {history,cache,reasons}=analyze(doc,partId),totalRecords=history.records.length;
  const through=throughRecord===undefined?totalRecords:throughRecord;
  if(!Number.isInteger(through)||through<0||through>totalRecords)fail('throughRecord must be a record count from zero through the native history length.','INVALID_HISTORY_POSITION');
  const points=history.points.filter(point=>point.createdAtRecord<=through).map(point=>({...point,recordIndices:{...point.recordIndices}}));
  const lines=history.lines.filter(line=>line.createdAtRecord<=through).map(line=>({...line,a:{...line.a},b:{...line.b}}));
  return{partId,records:history.records.map(record=>({...record,header:[...record.header]})),points,lines,totalRecords,throughRecord:through,preview:through!==totalRecords,unsupported:history.unsupported.map(item=>({...item})),eligible:reasons.length===0,eligibility:{canEdit:reasons.length===0,reasons:[...reasons],cacheFamily:cache.layout?.shape??null},reason:reasons[0]??null,cacheStale:cache.stale,historyComplete:history.complete,warnings:cache.stale?['Evaluated geometry differs from native input history; supported replay will regenerate it.']:[]};
}

export function getNativeSummary(doc){
  const {bytes,parsed}=documentState(doc),partIds=[...new Set(parsed.blocks.filter(block=>block.id[0]===3&&block.id[1]>0&&block.id[1]<=999).map(block=>block.id[1]))].sort((a,b)=>a-b),bootstrapEligible=isNativeN38Template(bytes);
  // Summary consumes internal analysis directly, avoiding an unnecessary copy
  // of every public history record when only counts and eligibility are needed.
  const parts=partIds.map(partId=>{const analysis=analyze(doc,partId),{history,cache,reasons}=analysis,canBootstrap=bootstrapEligible&&partId===1;let appendReason=null;if(!canBootstrap)try{appendPreconditions(doc,partId,analysis);}catch(error){appendReason=error.message;}return{partId,recordCount:history.records.length,pointCount:history.points.length,lineCount:history.lines.length,eligible:reasons.length===0,reason:reasons[0]??null,unsupportedCount:history.unsupported.length,cacheStale:cache.stale,bootstrapEligible:canBootstrap,appendEligible:appendReason===null,appendReason};});
  const appendEligible=parts.some(part=>part.appendEligible),appendReason=appendEligible?null:parts[0]?.appendReason??'No supported native part is available for append.';
  return{format:'GRAFIS MDL',variant:parsed.variant,byteLength:bytes.length,blockCount:parsed.blocks.length,partCount:parts.length,parts,editable:parts.some(part=>part.eligible),readOnly:!parts.some(part=>part.eligible)&&!appendEligible,modified:doc.modified,containerValidated:true,bootstrapEligible,appendEligible,appendReason,warnings:[...parsed.warnings],support:'Verified absolute points and dependent straight lines, plus the fixed N38 template; unknown native data is retained read-only.'};
}

export function updateAbsolutePoint(doc,{partId=1,objectId,x,y}={}){
  if(!Number.isInteger(partId)||partId<1||partId>999)fail('Invalid native part ID.','INVALID_PART');
  if(!validObjectId(objectId))fail('A valid native point object ID is required.','INVALID_POINT');
  if(!validCoordinate(x)||!validCoordinate(y))fail(`Native X and Y must be finite millimetres within ±${MAX_COORDINATE}.`,'INVALID_POINT');
  x=Math.fround(x);y=Math.fround(y);
  const {bytes,originalBytes,parsed}=documentState(doc),{history,cache,reasons}=analyze(doc,partId);
  if(reasons.length)fail(`Native document is read-only: ${reasons.join(' ')}`,'READ_ONLY_NATIVE');
  const point=history.points.find(value=>value.objectId===objectId);
  if(!point)fail(`Native object ${objectId} is not a supported absolute point.`,'UNKNOWN_POINT');
  const candidate=bytes.slice(),data=view(candidate);
  data.setFloat32(history.history.payloadOffset+point.recordIndices.x*32+8,x,true);
  data.setFloat32(history.history.payloadOffset+point.recordIndices.y*32+8,y,true);
  data.setUint32(history.history.offset,check(candidate,history.history.offset,history.history.size),true);
  const replay=readHistory(candidate,parsed,partId);
  if(!replay.complete)fail('The requested point edit would produce unsupported native history.','READ_ONLY_NATIVE');
  const pointsById=new Map(replay.points.map(value=>[value.objectId,value]));
  const linesById=new Map(replay.lines.map(value=>[value.objectId,value]));
  function putPair(offset,value){data.setFloat32(offset,value.x,true);data.setFloat32(offset+4,value.y,true);}
  for(const layout of cache.layout.pointLayouts)for(const offset of layout.coordinateOffsets)putPair(offset,pointsById.get(layout.objectId));
  for(const layout of cache.layout.lineLayouts){const line=linesById.get(layout.objectId),bounds=boundsOf([line.a,line.b]);for(const offset of layout.startOffsets)putPair(offset,line.a);for(const offset of layout.endOffsets)putPair(offset,line.b);putPair(layout.minOffset,bounds.min);putPair(layout.maxOffset,bounds.max);}
  data.setUint32(cache.block.offset,check(candidate,cache.block.offset,cache.block.size),true);
  // Same-size updates leave header, opaque payloads, IDs, counter and record order
  // intact. Reparse checks the complete output before it is exposed to the UI.
  const result=makeDocument(candidate,originalBytes,true),after=analyze(result,partId);
  if(after.reasons.length||after.cache.stale)fail('The requested native edit did not pass supported-history replay validation.','READ_ONLY_NATIVE');
  for(const block of parsed.blocks)if(block.offset!==history.history.offset&&block.offset!==cache.block.offset&&!equalBytes(bytes.subarray(block.offset,block.endOffset),candidate.subarray(block.offset,block.endOffset)))fail('An unrelated native block changed unexpectedly.','INTERNAL_NATIVE_ERROR');
  return result;
}

// Append is intentionally narrower than the existing-coordinate editor. Its
// allocator/metadata grammar is measured only for these one-part VA fixtures.
function appendPreconditions(doc,partId,providedAnalysis){
  if(partId!==1)fail('Native append is supported only for the verified part 1 grammar.','UNSUPPORTED_APPEND');
  const current=documentState(doc),analysis=providedAnalysis??analyze(doc,partId);
  if(analysis.reasons.length)fail(`Native append is read-only: ${analysis.reasons.join(' ')}`,'READ_ONLY_NATIVE');
  if(analysis.cache.stale)fail('Run Test Run first to rebuild evaluated native cache before adding objects.','STALE_NATIVE_CACHE');
  const history=analysis.history,objects=[...history.points,...history.lines].sort((a,b)=>a.createdAtRecord-b.createdAtRecord),count=objects.length;
  if(!count||!objects.every((object,index)=>object.objectId===2001+index))fail('Native append requires the verified contiguous object-ID sequence beginning at 2001.','UNSUPPORTED_APPEND');
  const part=blockFor(current.parsed,[3,partId,1,0]),list=blockFor(current.parsed,[2,1,0,0]),v=view(current.bytes);
  if(!part||part.payloadSize!==152||v.getUint32(part.payloadOffset,true)!==1||v.getUint32(part.payloadOffset+8,true)!==5*count||v.getUint32(part.payloadOffset+20,true)!==4*history.records.length)fail('Native part-header counts are outside the measured append grammar.','UNSUPPORTED_APPEND');
  if(!list)fail('A unique native text part-list block is required for append.','UNSUPPORTED_APPEND');
  const text=ascii(current.bytes,list.payloadOffset,list.payloadSize),rows=text.split('\r\n'),marker=rows.indexOf('#TLIST'),row=rows[marker+1];
  if(marker<0||rows.lastIndexOf('#TLIST')!==marker||rows[0]!=='#VERSION'||rows[1]!=='1000'||rows[marker+2]!=='#ENDINFO'||!row||row.length!==72||row.slice(0,9)!=='   001 x '||!/^ *\d+$/.test(row.slice(32,37))||!/^ *\d+$/.test(row.slice(37,41))||row.slice(41,53)!=='            '||!/^ID=[0-9A-Fa-f]{16}$/.test(row.slice(53)))fail('Native TLIST layout is outside the measured single-row append grammar.','UNSUPPORTED_APPEND');
  if(Number(row.slice(32,37))!==history.records.length||Number(row.slice(37,41))!==count)fail('Native text part-list counts disagree with history/cache counts.','UNSUPPORTED_APPEND');
  const rowOffset=text.indexOf(row,text.indexOf('#TLIST'));
  return{...current,...analysis,objects,count,part,list,rowOffset,nextObjectId:2001+count};
}

function appendRecord(header,argumentsByIndex=[]){
  const result=new Uint8Array(32),v=view(result);
  header.forEach((value,index)=>v.setUint16(index*2,value,true));
  for(const[index,value]of argumentsByIndex)v.setUint32(8+index*4,value,true);
  return result;
}

function rebuildAppendBlock(bytes,block,payload){
  const result=new Uint8Array(32+payload.length),v=view(result);
  result.set(bytes.subarray(block.offset,block.payloadOffset));result.set(payload,32);
  v.setUint32(4,result.length/8,true);v.setUint32(0,check(result,0,result.length),true);
  return result;
}

function appendOperation(doc,partId,operation){
  const before=appendPreconditions(doc,partId),{bytes,originalBytes,parsed,history,cache,count,part,list,nextObjectId}=before;
  const point=operation.kind==='point',sampleCount=point?1:2,newCount=count+1,newRecords=history.records.length+(point?4:3),newId=nextObjectId;
  if(newCount>9999||newRecords>99999||!validObjectId(newId))fail('The appended object/count would overflow the measured native text fields.','UNSUPPORTED_APPEND');
  const records=point?POINT_HEADERS.map(header=>appendRecord(header)):LINE_HEADERS.map(header=>appendRecord(header));
  if(point){view(records[0]).setFloat32(8,operation.a.x,true);view(records[1]).setFloat32(8,operation.a.y,true);view(records[2]).setUint32(16,18,true);view(records[3]).setUint32(12,newId,true);}
  else{for(const[index,id]of[[0,operation.startPointId],[1,operation.endPointId]]){const v=view(records[index]);v.setUint32(8,id,true);v.setUint32(12,65536,true);v.setUint32(16,index===0?18:19,true);}view(records[2]).setUint32(12,newId,true);}
  const oldHistory=bytes.subarray(history.history.payloadOffset,history.history.endOffset),newHistory=new Uint8Array(oldHistory.length+records.length*32);
  newHistory.set(oldHistory);records.forEach((record,index)=>newHistory.set(record,oldHistory.length+index*32));

  const oldCache=bytes.subarray(cache.block.payloadOffset,cache.block.endOffset),oldPoolStart=8+40*count,newPoolStart=8+40*newCount,newCache=new Uint8Array(oldCache.length+40+sampleCount*8),cv=view(newCache);
  cv.setUint32(0,newCount,true);cv.setUint32(4,newCache.length/8,true);
  newCache.set(oldCache.subarray(8,oldPoolStart),8);newCache.set(oldCache.subarray(oldPoolStart),newPoolStart);
  const objectOffset=8+40*count,bounds=boundsOf(point?[operation.a]:[operation.a,operation.b]);
  cv.setUint32(objectOffset,newId,true);cv.setUint32(objectOffset+12,sampleCount,true);
  // A new object uses a zero placeholder, never another object's opaque handle.
  // Original GRAFIS regenerated two such placeholders on tested point+line
  // open/replay/save. The surrounding format remains strictly constrained.
  cv.setUint32(objectOffset+16,0,true);cv.setUint32(objectOffset+20,point?66049:66050,true);
  function pair(offset,value){cv.setFloat32(offset,value.x,true);cv.setFloat32(offset+4,value.y,true);}
  pair(objectOffset+24,bounds.min);pair(objectOffset+32,bounds.max);
  const newSampleOffset=newPoolStart+(oldCache.length-oldPoolStart);pair(newSampleOffset,operation.a);if(!point)pair(newSampleOffset+8,operation.b);

  const newPart=bytes.slice(part.payloadOffset,part.endOffset),pv=view(newPart);
  pv.setUint32(8,newCount*5,true);pv.setUint32(20,newRecords*4,true);
  const newList=bytes.slice(list.payloadOffset,list.endOffset);
  for(const[offset,text]of[[before.rowOffset+32,String(newRecords).padStart(5,' ')],[before.rowOffset+37,String(newCount).padStart(4,' ')]])for(let index=0;index<text.length;index++)newList[offset+index]=text.charCodeAt(index);
  const replacements=new Map([[history.history.key,newHistory],[cache.block.key,newCache],[part.key,newPart],[list.key,newList]]);
  const blocks=parsed.blocks.map(block=>replacements.has(block.key)?rebuildAppendBlock(bytes,block,replacements.get(block.key)):bytes.slice(block.offset,block.endOffset));
  const length=80+blocks.reduce((sum,block)=>sum+block.length,0)+8;
  if(length>MAX_BYTES)fail('Appended native file exceeds the 30 MiB limit.','UNSUPPORTED_APPEND');
  const candidate=new Uint8Array(length),v=view(candidate);candidate.set(bytes.subarray(0,80));let offset=80;
  for(const block of blocks){candidate.set(block,offset);offset+=block.length;}
  candidate.set(bytes.subarray(bytes.length-8),offset);v.setUint32(4,(length-8)/8,true);v.setUint32(0,check(candidate,0,80),true);
  const result=makeDocument(candidate,originalBytes,true),after=appendPreconditions(result,partId);
  if(after.history.records.length!==newRecords||after.count!==newCount||after.cache.stale)fail('Native append output failed its strict structural replay checks.','UNSUPPORTED_APPEND');
  for(const block of parsed.blocks)if(!replacements.has(block.key)){const next=blockFor(after.parsed,block.id);if(!next||!equalBytes(bytes.subarray(block.offset,block.endOffset),candidate.subarray(next.offset,next.endOffset)))fail('Native append changed an unrelated native block.','INTERNAL_NATIVE_ERROR');}
  return result;
}

export function appendAbsolutePoint(doc,{partId=1,x,y}={}){
  if(!validCoordinate(x)||!validCoordinate(y))fail(`Native X and Y must be finite millimetres within ±${MAX_COORDINATE}.`,'INVALID_POINT');
  if(isNativeN38Template(documentState(doc).bytes)){
    if(partId!==1)fail('The fixed N38 template contains only part 1.','UNSUPPORTED_APPEND');
    return createTemplatePointDocument(doc,{x,y});
  }
  return appendOperation(doc,partId,{kind:'point',a:{x:Math.fround(x),y:Math.fround(y)}});
}

export function appendReferenceLine(doc,{partId=1,startPointId,endPointId}={}){
  const before=appendPreconditions(doc,partId),start=before.history.points.find(point=>point.objectId===startPointId),end=before.history.points.find(point=>point.objectId===endPointId);
  if(!validObjectId(startPointId)||!validObjectId(endPointId)||!start||!end||startPointId===endPointId)fail('Append line requires two distinct existing absolute point IDs.','INVALID_LINE');
  const a={x:start.x,y:start.y},b={x:end.x,y:end.y};if(Math.hypot(b.x-a.x,b.y-a.y)===0)fail('Append line requires noncoincident point coordinates.','INVALID_LINE');
  return appendOperation(doc,partId,{kind:'line',startPointId,endPointId,a,b});
}

/** First point from the exact own controlled N38 blank; no fresh identity claim. */
export function createNativeTemplatePoint(input,{x,y}={}){
  if(!(input instanceof Uint8Array)||!isNativeN38Template(input))fail('First-point creation accepts only the exact fixed N38 native template.','INVALID_NATIVE_TEMPLATE');
  return createTemplatePointDocument(parseMdl(input),{x,y});
}

function createTemplatePointDocument(doc,{x,y}){
  if(!validCoordinate(x)||!validCoordinate(y))fail(`Native X and Y must be finite millimetres within ±${MAX_COORDINATE}.`,'INVALID_POINT');
  const {bytes,originalBytes,parsed}=documentState(doc);
  if(!isNativeN38Template(bytes))fail('The native blank does not match the fixed N38 template.','INVALID_NATIVE_TEMPLATE');
  const history=blockFor(parsed,[3,1,2,0]),part=blockFor(parsed,[3,1,1,0]),list=blockFor(parsed,[2,1,0,0]);
  const expectedIds=['1.1.0.0','2.1.0.0','2.2.0.0','2.4.0.0','2.6.0.0','3.1.1.0','3.1.2.0','3.1.4.0','3.1.5.0','3.1.6.6'];
  if(parsed.variant!=='VA'||bytes.length!==4512||parsed.blocks.length!==10||!parsed.blocks.every((block,index)=>idText(block.id)===expectedIds[index])||!history||history.payloadSize!==0||!part||part.payloadSize!==152||!list)fail('Fixed native template structure is invalid.','INVALID_NATIVE_TEMPLATE');
  const partView=view(bytes),base=part.payloadOffset;
  if([0,4,8,12,20,24].some(relative=>partView.getUint32(base+relative,true)!==0)||partView.getUint32(base+16,true)!==1)fail('Fixed native template part header is invalid.','INVALID_NATIVE_TEMPLATE');
  const text=ascii(bytes,list.payloadOffset,list.payloadSize),row='   001 x NN                         0   0            ID=65C0D90301DD5EE5',rowOffset=text.indexOf(row);
  if(rowOffset<0||text.indexOf(row,rowOffset+1)!==-1)fail('Fixed native template part list is invalid.','INVALID_NATIVE_TEMPLATE');
  x=Math.fround(x);y=Math.fround(y);
  const records=POINT_HEADERS.map(header=>appendRecord(header));
  view(records[0]).setFloat32(8,x,true);view(records[1]).setFloat32(8,y,true);view(records[2]).setUint32(16,18,true);view(records[3]).setUint32(12,2001,true);
  const newHistory=new Uint8Array(128);records.forEach((record,index)=>newHistory.set(record,index*32));
  const newPart=bytes.slice(part.payloadOffset,part.endOffset),pv=view(newPart);
  pv.setUint32(0,1,true);pv.setUint32(8,5,true);pv.setUint32(20,16,true);
  // Zero allocation fields are retained from this exact template. Native open,
  // construction replay and later native point/line creation validated it.
  const newList=bytes.slice(list.payloadOffset,list.endOffset);
  for(const[offset,value]of[[rowOffset+32,'    4'],[rowOffset+37,'   1']])for(let index=0;index<value.length;index++)newList[offset+index]=value.charCodeAt(index);
  const newCachePayload=new Uint8Array(56),cv=view(newCachePayload);
  cv.setUint32(0,1,true);cv.setUint32(4,7,true);cv.setUint32(8,2001,true);cv.setUint32(20,1,true);cv.setUint32(24,0,true);cv.setUint32(28,66049,true);
  for(const offset of[32,40,48]){cv.setFloat32(offset,x,true);cv.setFloat32(offset+4,y,true);}
  const newCacheBlock=new Uint8Array(88),bv=view(newCacheBlock);bv.setUint32(4,11,true);
  for(let index=0;index<BLOCK_MARK.length;index++)newCacheBlock[8+index]=BLOCK_MARK.charCodeAt(index);
  [3,1,7,1].forEach((value,index)=>bv.setUint32(16+index*4,value,true));newCacheBlock.set(newCachePayload,32);bv.setUint32(0,check(newCacheBlock,0,88),true);
  const replacements=new Map([[history.key,newHistory],[part.key,newPart],[list.key,newList]]),blocks=parsed.blocks.map(block=>replacements.has(block.key)?rebuildAppendBlock(bytes,block,replacements.get(block.key)):bytes.slice(block.offset,block.endOffset));
  blocks.push(newCacheBlock);const length=80+blocks.reduce((sum,block)=>sum+block.length,0)+8;
  if(length!==4728)fail('Fixed native template generated an invalid length.','INTERNAL_NATIVE_ERROR');
  const candidate=new Uint8Array(length),v=view(candidate);candidate.set(bytes.subarray(0,80));let offset=80;
  for(const block of blocks){candidate.set(block,offset);offset+=block.length;}
  candidate.set(bytes.subarray(bytes.length-8),offset);v.setUint32(4,(length-8)/8,true);v.setUint32(0,check(candidate,0,80),true);
  const result=makeDocument(candidate,originalBytes,true),after=appendPreconditions(result,1);
  if(after.count!==1||after.history.records.length!==4||after.cache.stale||after.history.points[0].objectId!==2001||after.history.points[0].x!==x||after.history.points[0].y!==y)fail('Fixed native template point failed structural replay checks.','INTERNAL_NATIVE_ERROR');
  for(const block of parsed.blocks)if(!replacements.has(block.key)){const next=blockFor(after.parsed,block.id);if(!next||!equalBytes(bytes.subarray(block.offset,block.endOffset),candidate.subarray(next.offset,next.endOffset)))fail('First-point creation changed unrelated template data.','INTERNAL_NATIVE_ERROR');}
  return result;
}
