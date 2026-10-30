import{referenceRows}from'./qq-reference-schema.mjs';import{decodeQSPointSelection}from'./native-qs-point-selection.mjs';
const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),eq=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
/** Only numeric coordinate edits of existing QS Line20 picks; never retargets selectors. */
export function knownQsNumericReferenceChange(a,b){try{
 if(a.identity!==b.identity||!eq(a.history,b.history)||!eq(a.header,b.header)||a.parameters.size!==b.parameters.size||![...a.parameters].every(([k,p])=>b.parameters.has(k)&&eq(p,b.parameters.get(k))))return null;
 const x=referenceRows(a.references),y=referenceRows(b.references);if(x.length!==y.length)return null;let changed=0;
 for(let i=0;i<x.length;i++){const p=x[i].raw,q=y[i].raw;if(eq(p,q))continue;if(p.length!==40||q.length!==40||!eq(p.subarray(0,24),q.subarray(0,24))||!eq(p.subarray(32),q.subarray(32)))return null;const h=v(p),record=h.getUint16(10,true);if(h.getUint16(6,true)!==1||h.getUint16(8,true)!==6||![1,2].includes(h.getUint32(12,true)))return null;const old=decodeQSPointSelection(p),next=decodeQSPointSelection(q);if(!('x'in old)||!('x'in next))return null;const raw=a.history.subarray((record-1)*32,record*32);if(raw.length!==32||v(raw).getUint16(0,true)!==101||v(raw).getUint16(2,true)!==104||String.fromCharCode(...raw.subarray(12))!=='GraPrg_GK_QS_c002_01')return null;changed++;}
 return changed?{partId:a.partId,type:'numeric-qs-endpoint',changed}:null;
 }catch{return null;}}
/** One literal Line10 angle edit, with optional literal length edit. Existing
 * selectors, identities, history, bindings and every other parameter stay exact. */
export function knownQsLine10DirectionChange(a,b){try{
 if(a.identity!==b.identity||!eq(a.history,b.history)||!eq(a.header,b.header)||a.parameters.size!==b.parameters.size)return null;
 const x=referenceRows(a.references),y=referenceRows(b.references);if(x.length!==y.length)return null;let changed=null;
 for(let i=0;i<x.length;i++){const p=x[i].raw,q=y[i].raw;if(eq(p,q))continue;if(changed||p.length!==80||q.length!==80||!eq(p.subarray(0,76),q.subarray(0,76))||p.subarray(20,76).some(n=>n!==0))return null;const h=v(p),record=h.getUint16(10,true);if(h.getUint16(6,true)!==1||h.getUint16(8,true)!==7||h.getUint32(12,true)!==2||h.getUint32(16,true)!==1)return null;if(![v(p).getFloat32(76,true),v(q).getFloat32(76,true)].every(n=>Number.isFinite(n)&&Math.abs(n)<=3600))return null;const raw=a.history.subarray((record-1)*32,record*32),call=v(raw);if(raw.length!==32||call.getUint16(0,true)!==101||call.getUint16(2,true)!==104||String.fromCharCode(...raw.subarray(12))!=='GraPrg_GK_QS_c001_02')return null;const index=call.getUint16(4,true),key=`3.${a.partId}.3.${index}`;if(!a.parameters.has(key)||!b.parameters.has(key))return null;let uses=0;for(let at=0;at<a.history.length;at+=32){const r=v(a.history.subarray(at,at+32));if(r.getUint16(0,true)===101&&r.getUint16(4,true)===index)uses++;}if(uses!==1)return null;
 for(const[k,p]of a.parameters){const q=b.parameters.get(k);if(!q||q.length!==p.length)return null;if(k!==key){if(!eq(p,q))return null;continue;}for(let at=0;at<p.length;){const old=v(p.subarray(at)),next=v(q.subarray(at)),n=old.getUint32(0,true)*8;if(n<24||at+n>p.length||next.getUint32(0,true)*8!==n)return null;const lengthField=old.getInt16(4,true)===7;for(let j=0;j<n;j++)if(!(lengthField&&j>=16&&j<20)&&p[at+j]!==q[at+j])return null;if(lengthField&&![old.getFloat32(16,true),next.getFloat32(16,true)].every(n=>Number.isFinite(n)&&n>=.01&&n<=10000))return null;at+=n;}}
 changed={partId:a.partId,record,objectId:call.getUint16(6,true),type:'numeric-qs-line10-direction'};
 }return changed;
 }catch{return null;}}
/** Exact literal Line10 length-only edit, including a geometrically masked edit
 * after a later trim. Never authorizes selector, binding or program changes. */
export function knownQsLine10ParameterChange(a,b){try{
 if(a.identity!==b.identity||!eq(a.history,b.history)||!eq(a.header,b.header)||!eq(a.references,b.references)||a.parameters.size!==b.parameters.size)return null;
 for(let at=0;at<a.history.length;at+=32){const raw=a.history.subarray(at,at+32),h=v(raw);if(h.getUint16(0,true)!==101||h.getUint16(2,true)!==104||String.fromCharCode(...raw.subarray(12))!=='GraPrg_GK_QS_c001_02')continue;const index=h.getUint16(4,true),key=`3.${a.partId}.3.${index}`,p=a.parameters.get(key),q=b.parameters.get(key);if(!p||!q||p.length!==q.length||eq(p,q))continue;let uses=0;for(let i=0;i<a.history.length;i+=32){const r=v(a.history.subarray(i,i+32));if(r.getUint16(0,true)===101&&r.getUint16(4,true)===index)uses++;}if(uses!==1||![...a.parameters].every(([k,p])=>k===key||eq(p,b.parameters.get(k)??new Uint8Array())))return null;
 let oldLength=null,newLength=null,fields=0,binding=false;for(let pos=0;pos<p.length;){const old=v(p.subarray(pos)),next=v(q.subarray(pos)),n=old.getUint32(0,true)*8;if(n<24||pos+n>p.length||next.getUint32(0,true)*8!==n)return null;const field=old.getInt16(4,true);for(let j=0;j<n;j++)if(!(field===7&&j>=16&&j<20)&&p[pos+j]!==q[pos+j])return null;
 if(field===7){const x=old.getFloat32(16,true),y=next.getFloat32(16,true);if(![x,y].every(n=>Number.isFinite(n)&&n>=.01&&n<=10000)||(oldLength!==null&&oldLength!==x)||(newLength!==null&&newLength!==y))return null;oldLength=x;newLength=y;fields++;}
 if(field===-12){const len=old.getUint32(20,true);if(len%8||24+len>n)return null;for(let j=24;j<24+len;j+=8)if(old.getUint32(j,true)===7){if(binding||old.getUint32(j+4,true)!==0)return null;binding=true;}}pos+=n;
 }if(fields&&binding&&oldLength!==newLength)return{partId:a.partId,record:at/32+1,objectId:h.getUint16(6,true),type:'numeric-qs-line10-length'};
 }return null;
 }catch{return null;}}
