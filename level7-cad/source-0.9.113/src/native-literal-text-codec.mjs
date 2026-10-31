/** Verified horizontal, single-line ASCII literal text. Dynamic fields and
 * construction-line attachments are deliberately not interpreted as literals. */
const need=(x,m)=>{if(!x)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const literal=s=>typeof s==='string'&&s.length>0&&s.length<=512&&/^[A-Za-z0-9 .,_+\-]+$/.test(s);
function stringAt(b,at){const zero=b.indexOf(0,at),end=zero<0?b.length:zero;need(end>at,'Missing native text terminator');const text=String.fromCharCode(...b.subarray(at,end));need(literal(text),'Unsupported native text encoding or dynamic fields');return text;}
export function decodeLiteralTextPool(bytes){
 const q=view(bytes);need(bytes.length>=56&&bytes.length%8===0,'Invalid native text pool');
 const text=stringAt(bytes,48),width=q.getFloat32(16,true),height=q.getFloat32(20,true);
 need(q.getUint16(36,true)===1088&&q.getUint16(38,true)===text.length&&q.getUint16(42,true)===8&&q.getUint32(44,true)===0,'Unsupported native text attributes');
 need(width>0&&width<=100&&height>0&&height<=100&&q.getFloat32(24,true)===0&&Math.abs(q.getFloat32(28,true)-.4)<1e-6&&q.getUint32(32,true)===0,'Unsupported native text orientation or format');
 const bounds=Array.from({length:4},(_,i)=>q.getFloat32(i*4,true));need(bounds.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)&&bounds[0]<bounds[2]&&bounds[3]<bounds[1],'Invalid native text bounds');
 need(Math.abs(bounds[2]-bounds[0]-width*text.length-10)<.002&&Math.abs(bounds[1]-bounds[3]-height-10)<.002,'Native text bounds do not match literal metrics');
 return{text,objectId:q.getUint16(40,true),width,height,bounds,anchor:[bounds[0]+5,bounds[3]+5]};
}
export function decodeLiteralTextDefinitions(bytes,{resolveText}={}){
 const result=[];for(let at=0;at<bytes.length;){const h=view(bytes.subarray(at)),length=h.getUint16(0,true)*8;need(length>=64&&at+length<=bytes.length,'Invalid text definition span');const record=bytes.subarray(at,at+length),text=resolveText?resolveText(String.fromCharCode(...record.subarray(56,56+h.getUint16(6,true)))):stringAt(record,56);need(h.getUint16(2,true)===1&&h.getUint16(4,true)===1&&h.getUint16(6,true)===text.length&&h.getUint16(8,true)===2053&&h.getUint32(12,true)===0&&h.getUint32(36,true)===0,'Unsupported native text definition');const pool=new Uint8Array(48+Math.ceil(text.length/8)*8);pool.set(record.subarray(40,56));pool.set(record.subarray(16,36),16);[1088,text.length,h.getUint16(10,true),8].forEach((n,i)=>view(pool).setUint16(36+2*i,n,true));pool.set(new TextEncoder().encode(text),48);result.push(decodeLiteralTextPool(pool));at+=length;}
 need(new Set(result.map(o=>o.objectId)).size===result.length,'Duplicate text identity');return result;
}
