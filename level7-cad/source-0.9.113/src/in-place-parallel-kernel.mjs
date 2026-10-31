/** Paired endpoint offsets that replace an existing computed path atomically. */
import {applyParallelPath} from './parallel-path-kernel.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function replayInPlaceParallel({records,record,objects,zValues}){
 need(Array.isArray(records)&&records.length>=3&&records.length<=19&&records.length%2===1&&records.every(b=>b instanceof Uint8Array&&b.length===32),'Invalid in-place parallel group');
 const first=view(records[0]),second=view(records[1]);
 need(first.getUint16(0,true)===197&&first.getUint16(2,true)===100&&first.getUint16(4,true)===402&&second.getUint16(0,true)===297&&second.getUint16(2,true)===200&&second.getUint16(4,true)===403,'Unsupported in-place endpoint inputs');
 const numeric=(b,at)=>{const q=view(b),binding=q.getUint16(6,true);need(b.subarray(12).every(n=>n===0),'Unknown in-place numeric fields');const stored=q.getFloat32(8,true);need(Number.isFinite(stored)&&Math.abs(stored)<=10000,'Invalid in-place numeric echo');if(!binding)return{value:stored,stored,dependencies:[]};const z=zValues.find(z=>z.index===binding-200&&z.recordStep<=at);need(binding>200&&z&&Number.isFinite(z.value)&&Math.abs(z.value)<=10000,'Unresolved in-place parallel parameter');return{value:z.value,stored,dependencies:['Z'+z.index]};};
 const start=numeric(records[0],record);let end=numeric(records[1],record+1),sub=206;const pending=new Map();
 for(let n=2;n<records.length;n+=2){
  const b=records[n],c=view(b);need(c.getUint16(0,true)===104&&c.getUint16(2,true)===sub&&c.getUint16(4,true)===0&&c.getUint16(8,true)===65535,'Unsupported in-place parallel consumer');
  const sourceId=c.getUint16(6,true),id=c.getUint16(10,true);need(sourceId===id,'In-place source and destination differ');
  need(c.getFloat32(12,true)===0&&b.subarray(20,24).every(n=>n===0)&&b.subarray(28).every(n=>n===0)&&c.getFloat32(24,true)===end.stored,'Unknown in-place parallel fields');
  const source=pending.get(id)||objects.find(o=>o.id===id);need(source,'Missing in-place source');
  const result=applyParallelPath({source,id,record:record+n,start:start.value,end:end.value,side:c.getFloat32(16,true),dependencies:[...new Set([...start.dependencies,...end.dependencies])]});
  pending.set(id,{...source,...result,dependencies:[...new Set([...(source.dependencies||[]),...start.dependencies,...end.dependencies])],record:source.record,lastModifiedRecord:record+n,operation:'in-place-endpoint-parallel'});
  if(n+1<records.length){const q=view(records[n+1]);need(q.getUint16(0,true)===297&&q.getUint16(2,true)===sub+94&&q.getUint16(4,true)===403,'Unsupported continued in-place input');end=numeric(records[n+1],record+n+1);sub+=200;}
 }
 return [...pending.values()];
}

