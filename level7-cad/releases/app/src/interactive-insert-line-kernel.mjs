import{INSERT_LINE_PARAMETER_HEX}from'./native-insert-line-template.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function readInteractiveInsertedLine({historyRecord,record,parameters,references}){
 need(historyRecord?.length===32&&Number.isInteger(record)&&record>0,'Invalid interactive line call');const h=v(historyRecord),id=h.getUint16(6,true);
 need(h.getUint16(0,true)===101&&h.getUint16(2,true)===104&&h.getUint16(4,true)>0&&id>=2001&&id<60000&&h.getUint16(8,true)===0&&h.getUint16(10,true)===20&&String.fromCharCode(...historyRecord.subarray(12))==='GraPrg_GK_TO_c003_03','Unsupported interactive line insertion');
 const template=Uint8Array.from(INSERT_LINE_PARAMETER_HEX.match(/../g),n=>parseInt(n,16));need(parameters?.length===template.length&&parameters.every((n,i)=>n===template[i]),'Only witnessed single-line insertion parameters are supported');
 const rows=[];for(let at=0;at<references.length;){need(at+16<=references.length,'Truncated line references');const q=v(references.subarray(at)),size=q.getUint32(0,true)*8;need(size>=16&&at+size<=references.length,'Invalid line reference');if(q.getUint16(6,true)===1&&q.getUint16(10,true)===record)rows.push(references.subarray(at,at+size));at+=size;}
 const one=(type,key)=>{const r=rows.filter(b=>v(b).getUint16(8,true)===type&&v(b).getUint32(12,true)===key);need(r.length===1,'Missing line insert reference');return r[0];},created=one(5,101),pick=one(3,1),c=v(created),p=v(pick);
 need(created.length===24&&c.getUint16(4,true)===0&&c.getUint32(16,true)===id&&c.getUint32(20,true)===0,'Invalid inserted line identity');
 need(pick.length===40&&p.getUint16(4,true)===256&&p.getUint16(20,true)===2&&[0,0xff].includes(p.getUint16(22,true))&&[24,28,32,36].every(at=>Number.isFinite(p.getFloat32(at,true))),'Unsupported source line selection');
 const sourcePartId=p.getUint16(16,true),sourceObjectId=p.getUint16(18,true);need(sourcePartId>0&&sourcePartId<=999&&sourceObjectId>=2001&&sourceObjectId<60000,'Invalid source line');
 const thumbnails=rows.filter(b=>v(b).getUint16(8,true)===2&&v(b).getUint32(12,true)===1);need(rows.length===2+thumbnails.length&&thumbnails.length<=1&&thumbnails.every(b=>b.length>=24&&v(b).getUint16(4,true)===0&&[137,80,78,71,13,10,26,10].every((n,i)=>b[16+i]===n)),'Unknown interactive line references');
 return{sourcePartId,sourceGeometry:p.getUint16(22,true)===0xff?'curve':'line',mappings:[{sourceObjectId,objectId:id,objectClass:2}]};
}

// Only the independently witnessed original QQ endpoint family is admitted.
export const isInteractiveInsertPath=o=>!!o&&!o.nativeSlitNotch&&(!o.geometryKind&&o.points?.length===2||o.geometryKind==='sampled-curve'&&o.samplingToleranceMm===.0001&&o.directionPolyline?.family==='qq-two-relative-end-v1'&&o.points.length>=3&&o.points.length<=8192);

