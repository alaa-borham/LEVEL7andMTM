/** Exact literal point selection/creation witnessed in native Grafis T81D. */
export function readLiteralPointRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==64)return null;
 const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),id=v.getUint32(44,true),x=v.getFloat32(24,true),y=v.getFloat32(28,true);
 if(id<2001||id>=60000||![x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))return null;
 const expected=new Uint8Array(64),e=new DataView(expected.buffer);
 [[196,101,1],[294,201,1]].forEach((h,i)=>h.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));
 e.setUint32(16,18,true);e.setFloat32(24,x,true);e.setFloat32(28,y,true);e.setUint32(44,id,true);
 return raw.every((b,i)=>b===expected[i])?{id,x,y}:null;
}
/** Exact four-record coordinate point family already proven in the N38 writer. */
export function readCoordinatePointRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==128)return null;const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),id=v.getUint32(108,true),x={code:v.getUint16(6,true),value:v.getFloat32(8,true)},y={code:v.getUint16(38,true),value:v.getFloat32(40,true)};
 if(id<2001||id>=60000||![x,y].every(p=>(p.code===0||p.code>=1&&p.code<=80||p.code>=201&&p.code<=299)&&Number.isFinite(p.value)&&Math.abs(p.value)<=1e6))return null;
 const expected=new Uint8Array(128),e=new DataView(expected.buffer);[[197,100,9601,x.code],[297,200,9602,y.code],[396,301,12,0],[494,401,1,0]].forEach((h,i)=>h.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));e.setFloat32(8,x.value,true);e.setFloat32(40,y.value,true);e.setUint32(80,18,true);e.setUint32(108,id,true);
 return raw.every((b,i)=>b===expected[i])?{id,x,y}:null;
}
