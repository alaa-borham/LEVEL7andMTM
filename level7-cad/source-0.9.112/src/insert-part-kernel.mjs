/** Insert-part reference decoder. The explicit native object list is resolved
 * against a fully calculated parent. Pick coordinates and embedded thumbnails
 * are never construction inputs. Only the untranslated default mode is known. */
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function entries(bytes){
 ensure(bytes instanceof Uint8Array,'Missing insert-part block');const out=[];
 for(let at=0;at<bytes.length;){ensure(at+16<=bytes.length,'Truncated insert-part entry');const n=view(bytes).getUint32(at,true)*8;ensure(n>=16&&at+n<=bytes.length,'Invalid insert-part span');out.push(bytes.subarray(at,at+n));at+=n;ensure(out.length<=10000,'Insert-part entry limit');}return out;
}
export function readInsertedPart({historyRecord,record,parameters,references}){
 ensure(historyRecord instanceof Uint8Array&&historyRecord.length===32,'Invalid insert-part history');const h=view(historyRecord);
 ensure(h.getUint16(0,true)===101&&h.getUint16(2,true)===104&&(h.getUint16(6,true)===1||h.getUint16(6,true)>=2001&&h.getUint16(6,true)<60000)&&h.getUint16(8,true)===0&&h.getUint16(10,true)===20&&String.fromCharCode(...historyRecord.subarray(12))==='GraPrg_GK_TO_c006_03','Unsupported insert-part construction');
 const seen=new Set();let bindings=false;
 for(const raw of entries(parameters)){ensure(raw.length>=24,'Short insert-part parameter');const v=view(raw),index=v.getInt16(4,true),key=String.fromCharCode(...raw.subarray(6,14));ensure(!seen.has(index+':'+key),'Duplicate insert-part parameter');seen.add(index+':'+key);
  if(index===-12){ensure(!bindings&&raw.length===24&&v.getUint32(20,true)===0,'Bound insert-part options are unsupported');bindings=true;}
  else if(index>=0)ensure([0,1,2,4,5].includes(index)&&key==='        '&&v.getFloat32(16,true)===0,'Unsupported insert-part option');
  else ensure([-5,-4,-3,-2,-1].includes(index),'Unknown insert-part metadata');
 }
 ensure([0,1,2,4,5].every(i=>seen.has(i+':        ')),'Missing insert-part parameters');
 const all=entries(references),rows=all.filter(raw=>view(raw).getUint16(6,true)===1&&view(raw).getUint16(10,true)===record);
 ensure(rows.length===5,'Unsupported insert-part reference count');
 const one=(kind,key)=>{const matches=rows.filter(raw=>view(raw).getUint16(8,true)===kind&&view(raw).getUint32(12,true)===key);ensure(matches.length===1,'Missing or duplicate insert-part reference');return matches[0];};
 const creation=one(5,101),cv=view(creation);ensure(creation.length===24&&cv.getUint16(4,true)===0&&cv.getUint32(20,true)===0,'Unknown insert-part creation');const firstId=cv.getUint32(16,true);ensure(firstId>=2001&&firstId<65534,'Invalid insert-part identity');
 const direct=h.getUint16(6,true)!==1;ensure(!direct||h.getUint16(6,true)===firstId,'Mismatched direct insert-part identity');
 const pick=one(3,1),pv=view(pick);ensure(pick.length===40&&pv.getUint16(4,true)===256&&pv.getUint16(20,true)===2&&[0xff00,0xffff].includes(pv.getUint16(22,true)),'Unsupported inserted-part pick');const sourcePartId=pv.getUint16(16,true),pickedId=pv.getUint16(18,true);ensure(sourcePartId>0&&sourcePartId<=999&&pickedId>=2001&&pickedId<65535,'Invalid inserted-part source');for(const at of[24,28,32,36])ensure(Number.isFinite(pv.getFloat32(at,true)),'Invalid insert-part pick hint');
 const readContainer=(key,count)=>{const raw=one(4,key);ensure(raw.length===16+count*24&&view(raw).getUint16(4,true)===0,'Unknown insert-part container');return raw;};
 const containerRow=(raw,at,index)=>{const v=view(raw);ensure(v.getUint16(at,true)===3&&v.getUint16(at+2,true)===index&&v.getUint32(at+4,true)===4&&raw[at+8]===2&&String.fromCharCode(...raw.subarray(at+9,at+16))==='nn     '&&v.getUint32(at+20,true)===(direct?1:0),'Unknown insert-part object mapping');return v.getUint32(at+16,true);};
 const before=readContainer(102,1),after=readContainer(104,1);ensure(containerRow(before,16,1)===0,'Translated insert-part mode is unsupported');const count=containerRow(after,16,1);ensure(count>0&&count<=4096&&firstId+count<65535,'Invalid inserted-part count');
 const list=readContainer(103,count),sourceIds=[];for(let i=0;i<count;i++){const id=containerRow(list,16+i*24,i+1);ensure(id>=2001&&id<65535&&!sourceIds.includes(id),'Invalid inserted-part object list');sourceIds.push(id);}ensure(sourceIds.includes(pickedId),'Insert-part pick is absent from object list');
 return {sourcePartId,...(direct?{variant:'direct'}:{}),reservedId:firstId,mappings:sourceIds.map((sourceObjectId,i)=>({sourceObjectId,objectId:firstId+i+1}))};
}
