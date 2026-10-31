'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomBytes,createHash}=require('node:crypto');
const digest=b=>createHash('sha256').update(b).digest('hex');
/** Opaque save capabilities are issued only after a native Open/Save As dialog. */
function createNativeSaveTargets({readBounded,atomicWrite}){
 const targets=new Map();
 async function remember(file,bytes){const canonical=await fs.realpath(file),token=randomBytes(16).toString('hex');targets.set(token,{path:canonical,hash:digest(bytes)});while(targets.size>64)targets.delete(targets.keys().next().value);return token;}
 async function save(token,bytes){if(typeof token!=='string'||!targets.has(token))throw Error('أعد فتح الملف قبل الحفظ المباشر.');const t=targets.get(token),stat=await fs.lstat(t.path);if(!stat.isFile()||stat.isSymbolicLink()||await fs.realpath(t.path)!==t.path||digest(await readBounded(t.path,{binary:true}))!==t.hash)throw Error('تغير الملف خارج LEVEL7؛ استخدم Save As لحفظ نسخة دون استبداله.');await atomicWrite(t.path,bytes,t.hash);t.hash=digest(bytes);return{saved:true,name:path.basename(t.path),saveToken:token};}
 return{remember,save};
}
module.exports={createNativeSaveTargets};
