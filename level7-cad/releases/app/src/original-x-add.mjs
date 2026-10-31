import{parseMdl,serializeMdl}from'./native-mdl.js';import{readNativeXValues}from'./native-x-values.js';import{readNativeMetadata}from'./native-measurements.js';import{createPartHistoryCalculation}from'./part-history-engine.mjs';import{applyNativeXTableOperations}from'./native-x-table-operations.js';import{commitUnchangedParameters}from'./unchanged-parameter-commit.mjs';import{isEmptyNativeLinePart}from'./empty-native-line-part.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),key=b=>b.id.join('.');
function checksum(b){let n=0;for(let i=4;i<b.length;i+=2){n=(n+Math.imul(i/2+1,view(b).getInt16(i,true)))|0;if(n>=1024000000)n-=1024000000;}return n>>>0;}
const cat=xs=>{const b=new Uint8Array(xs.reduce((n,x)=>n+x.length,0));let at=0;for(const x of xs){b.set(x,at);at+=x.length;}return b;};
function block(id,p){const b=new Uint8Array(32+p.length);view(b).setUint32(4,b.length/8,true);b.set(new TextEncoder().encode('BLO5kenn'),8);id.forEach((n,i)=>view(b).setUint32(16+4*i,n,true));b.set(p,32);view(b).setUint32(0,checksum(b),true);return b;}
/** Add an unused zero X atomically. Never overwrite an interactive parameter pool. */
export function appendOriginalX(document,{partId,sizeKey}={}){
 need(sizeKey===readNativeMetadata(document).referenceSize?.name,'اختر المقاس الأساسي.');const before=createPartHistoryCalculation(document,{sizeKey}).get(partId);need(before.historyFullyExecuted||isEmptyNativeLinePart(document,{partId,sizeKey}),'يتطلب إضافة X مباشرة سجل رسم محسوبًا بالكامل.');
 const table=readNativeXValues(document,{partId}),last=Math.max(0,...table.localEntries.map(e=>e.index));need(last<80,'الحد الأقصى 80 قيمة X.');let next;
 if(table.tables.local.status==='available')next=applyNativeXTableOperations(document,[{partId,scope:'local',action:'add',value:0}]).document;
 else{
  const bytes=serializeMdl(document),params=document.blocks.filter(b=>b.id[0]===3&&b.id[1]===partId&&b.id[2]===3),collision=params.find(b=>b.id[3]===1),historyBlock=document.blocks.find(b=>key(b)===`3.${partId}.2.0`);need(historyBlock,'Missing native history');const history=bytes.slice(historyBlock.payloadOffset,historyBlock.endOffset);let relocated=null;
  if(collision){
   need(table.tables.local.status==='unavailable','Unknown X table state');relocated=Math.max(1,...params.map(b=>b.id[3]))+1;need(relocated<65535,'Native parameter limit');let uses=0;
   for(let at=0;at<history.length;at+=32){const q=view(history.subarray(at,at+32));if(q.getUint16(0,true)===101&&q.getUint16(2,true)===104&&q.getUint16(4,true)===1){const name=String.fromCharCode(...history.subarray(at+12,at+32));need(['GraPrg_GK_QS_c001_02','GraPrg_GK_QS_c002_01','GraPrg_GK_QQ_c001_04'].includes(name),'لا يمكن نقل كتلة معاملات غير معروفة.');q.setUint16(4,relocated,true);uses++;}}
   need(uses>0&&view(bytes.subarray(collision.payloadOffset,collision.endOffset)).getInt16(4,true)<0,'لا يُستبدل جدول X غير مقروء.');
  }else need(table.tables.local.status==='absent','Unrecognized local X table');
  const row=new Uint8Array(24);view(row).setUint32(0,3,true);view(row).setUint16(4,1,true);row.fill(32,6,14);
  const pool=params.map(b=>({index:b===collision?relocated:b.id[3],payload:bytes.slice(b.payloadOffset,b.endOffset)}));pool.push({index:1,payload:row});pool.sort((a,b)=>a.index-b.index);
  const chunks=[bytes.subarray(0,80)];let inserted=false;for(const b of document.blocks){const own=b.id[0]===3&&b.id[1]===partId;if(own&&[3,4].includes(b.id[2])&&!inserted){for(const p of pool)chunks.push(block([3,partId,3,p.index],p.payload));inserted=true;}if(own&&b.id[2]===3)continue;chunks.push(own&&b.id[2]===2&&relocated?block(b.id,history):bytes.subarray(b.offset,b.endOffset));}need(inserted,'Missing native parameter insertion boundary');chunks.push(bytes.subarray(-8));const out=cat(chunks);view(out).setUint32(4,out.length/8-1,true);view(out).setUint32(0,checksum(out.subarray(0,80)),true);next=parseMdl(out);
 }
 const result=commitUnchangedParameters(document,next,{sizeKey});need(readNativeXValues(result.document,{partId}).localEntries.some(e=>e.index===last+1&&e.value===0),'New X verification failed');return{...result,index:last+1};
}
