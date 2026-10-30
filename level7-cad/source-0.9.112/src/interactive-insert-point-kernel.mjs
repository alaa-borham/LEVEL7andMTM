import{INSERT_POINT_PARAMETER_HEX}from'./native-insert-point-template.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function readInteractiveInsertedPoint({historyRecord,record,parameters,references}){
 need(historyRecord?.length===32&&Number.isInteger(record)&&record>0,'Invalid interactive point call');const h=v(historyRecord),id=h.getUint16(6,true);
 need(h.getUint16(0,true)===101&&h.getUint16(2,true)===104&&h.getUint16(4,true)>0&&id>=2001&&id<60000&&h.getUint16(8,true)===0&&h.getUint16(10,true)===20&&String.fromCharCode(...historyRecord.subarray(12))==='GraPrg_GK_TO_c004_02','Unsupported interactive point insertion');
 const template=Uint8Array.from(INSERT_POINT_PARAMETER_HEX.match(/../g),n=>parseInt(n,16));need(parameters?.length===template.length&&parameters.every((n,i)=>n===template[i]),'Only witnessed single-point insertion parameters are supported');
 const rows=[];for(let at=0;at<references.length;){need(at+16<=references.length,'Truncated point references');const q=v(references.subarray(at)),size=q.getUint32(0,true)*8;need(size>=16&&at+size<=references.length,'Invalid point reference');if(q.getUint16(6,true)===1&&q.getUint16(10,true)===record)rows.push(references.subarray(at,at+size));at+=size;}
 const one=(type,key)=>{const r=rows.filter(b=>v(b).getUint16(8,true)===type&&v(b).getUint32(12,true)===key);need(r.length===1,'Missing point insert reference');return r[0];},created=one(5,101),pick=one(3,1),c=v(created),p=v(pick);
 need(created.length===24&&c.getUint16(4,true)===0&&c.getUint32(16,true)===id&&c.getUint32(20,true)===0,'Invalid inserted point identity');
 need(pick.length===40&&p.getUint16(4,true)===256&&p.getUint16(20,true)===1&&p.getUint16(22,true)===0xff00&&[24,28,32,36].every(at=>Number.isFinite(p.getFloat32(at,true))),'Unsupported source point selection');
 const sourcePartId=p.getUint16(16,true),sourceObjectId=p.getUint16(18,true);need(sourcePartId>0&&sourcePartId<=999&&sourceObjectId>=2001&&sourceObjectId<60000,'Invalid source point');
 const thumbnails=rows.filter(b=>v(b).getUint16(8,true)===2&&v(b).getUint32(12,true)===1);need(rows.length===2+thumbnails.length&&thumbnails.length<=1&&thumbnails.every(b=>b.length>=24&&v(b).getUint16(4,true)===0&&[137,80,78,71,13,10,26,10].every((n,i)=>b[16+i]===n)),'Unknown interactive point references');
 return{sourcePartId,mappings:[{sourceObjectId,objectId:id,objectClass:1}]};
}
