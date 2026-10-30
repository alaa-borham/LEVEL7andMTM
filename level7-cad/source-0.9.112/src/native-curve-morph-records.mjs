const need=(ok,m)=>{if(!ok)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function writeOriginalCurveMorphRecords({objectId,targetId,endpoint,targetEndpoint}){
 need([objectId,targetId].every(n=>Number.isInteger(n)&&n>=2001&&n<60000)&&objectId!==targetId,'اختر منحنى ومسارًا مرجعيًا مختلفين.');
 need([endpoint,targetEndpoint].every(n=>n===0||n===1),'اختر البداية أو النهاية فقط.');
 const raw=new Uint8Array(96),v=view(raw);
 [[196,101,3,0],[218,201,2,objectId,objectId,1],[318,301,10000,endpoint]].forEach((h,i)=>h.forEach((n,j)=>v.setUint16(32*i+2*j,n,true)));
 v.setUint32(8,targetId,true);v.setUint32(12,65536,true);v.setUint32(16,44,true);v.setFloat32(28,targetEndpoint,true);
 if(endpoint===0)for(const at of [32,64]){v.setUint32(at+20,65536,true);v.setUint32(at+24,0xffed0003,true);}return raw;
}

export function readOriginalCurveMorphRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==96)return null;
 try{const v=view(raw),o={objectId:v.getUint16(38,true),targetId:v.getUint32(8,true),endpoint:v.getUint16(70,true),targetEndpoint:v.getFloat32(28,true)},expected=writeOriginalCurveMorphRecords(o);return expected.every((n,i)=>n===raw[i])?o:null;}catch{return null;}
}
