import{raster20Rows,readRaster20Parameters}from'./interactive-raster20-kernel.mjs';
const eq=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]),v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
/** Admit fraction values only; never retarget the source or creation identity. */
export function knownRaster20RangeChange(a,b){try{
 if(a.identity!==b.identity||!eq(a.header,b.header)||!eq(a.history,b.history)||a.parameters.size!==b.parameters.size||[...a.parameters].some(([k,p])=>!b.parameters.has(k)||!eq(p,b.parameters.get(k))))return null;
 const old=raster20Rows(a.references),next=raster20Rows(b.references);if(old.length!==next.length)return null;const records=new Set();
 for(let i=0;i<old.length;i++){const x=old[i],y=next[i];if(eq(x,y))continue;if(x.length!==40||y.length!==40||!eq(x.subarray(0,28),y.subarray(0,28))||!eq(x.subarray(32),y.subarray(32)))return null;
  const q=v(y),f=q.getFloat32(28,true);if(q.getUint16(4,true)!==0||q.getUint16(6,true)!==1||q.getUint16(8,true)!==6||![2,3].includes(q.getUint32(12,true))||q.getUint16(16,true)!==2||q.getUint16(18,true)!==512||q.getUint32(20,true)!==0||!y.subarray(32).every(n=>n===0)||!Number.isFinite(f)||f<0||f>1)return null;records.add(q.getUint16(10,true));
 }
 if(records.size!==1)return null;const record=[...records][0];if(record<1||record*32>a.history.length)return null;const raw=a.history.subarray((record-1)*32,record*32),h=v(raw);
 if(h.getUint16(0,true)!==101||h.getUint16(2,true)!==104||h.getUint16(8,true)!==0||h.getUint16(10,true)!==20||String.fromCharCode(...raw.subarray(12))!=='GraPrg_GK_RA_c002_00')return null;
 readRaster20Parameters(a.parameters.get(`3.${a.partId}.3.${h.getUint16(4,true)}`));return{partId:a.partId,kind:'raster20-range',record,objectId:h.getUint16(6,true)};
 }catch{return null;}}
