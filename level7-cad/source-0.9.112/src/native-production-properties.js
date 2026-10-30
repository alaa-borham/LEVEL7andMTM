// VA property records verified by controlled Grafis saves. Unknown records stay opaque.
import {parseMdl,serializeMdl} from './native-mdl.js';
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),u16=(b,n)=>view(b).getUint16(n,true),put16=(b,n,v)=>view(b).setUint16(n,v,true);
const need=(v,m)=>{if(!v)throw Error(m);},key=b=>b.id.join('.');
const latin=b=>Array.from(b,n=>String.fromCharCode(n)).join(''),bytes=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
const cat=parts=>{const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let at=0;for(const b of parts){out.set(b,at);at+=b.length;}return out;};
export const MATERIALS=Object.freeze({' ':'',O:'upper fabric',F:'lining',E:'fuse',S:'template',P:'paper'});
export const CATEGORIES=Object.freeze({'':'',2:'-D keine Drehung/Abstand',5:'ID Drehung 180°/Abstand'});
export function decodeProductionPayload(payload){
 const records=[];for(let at=0;at<payload.length;){need(at+8<=payload.length,'Truncated part property');const len=u16(payload,at)*8;need(len>=8&&at+len<=payload.length,'Invalid part property length');records.push({type:u16(payload,at+2),body:payload.slice(at,at+len)});at+=len;}
 const get=type=>{const found=records.filter(r=>r.type===type);need(found.length<=1,'Duplicate part property');return found[0]?.body;};
 const p=get(1),date=get(5),category=get(4);
 if(p)need(p.length>=16&&p.length===16+u16(p,10)*8&&[0,255].includes(p[4])&&[0,1].includes(u16(p,12))&&u16(p,6)>=u16(p,8),'Unsupported production property flags');
 if(date)need(date.length===24,'Unsupported native edit date');
 if(category)need(category.length>=8&&category.length===8+u16(category,4)*8,'Unsupported category record');
 const text=(b,start)=>latin(b.subarray(start)).split('\0')[0].trimEnd();
 const production=!!p&&(p[4]===255||u16(p,12)===1);
 let lastEdit=null;if(date){const a=[1980+date[12],...date.slice(13,18)],d=new Date(a[0],a[1]-1,a[2],a[3],a[4],a[5]);if(d.getFullYear()===a[0]&&d.getMonth()+1===a[1]&&d.getDate()===a[2]&&a[3]<24&&a[4]<60&&a[5]<60)lastEdit=`${a[0]}-${String(a[1]).padStart(2,'0')}-${String(a[2]).padStart(2,'0')} ${a.slice(3).map(n=>String(n).padStart(2,'0')).join(':')}`;}
 return{records,production,markerExport:production&&p[4]===255,stitchPart:production&&u16(p,12)===1,materialCode:production?String.fromCharCode(p[5]):' ',material:production?text(p,16):'',normal:production?u16(p,6)-u16(p,8):null,mirrored:production?u16(p,8):null,total:production?u16(p,6):null,category:category?text(category,8):'',categoryId:category?u16(category,6):null,lastEdit};
}
export function productionListRow(row,properties){
 need(row.length>=72&&/^ID=[0-9a-f]{16}$/i.test(row.slice(53,72)),'Unknown part-list identity');
 const q=properties,a=row.slice(0,72).split('');for(const i of [43,45,47,48,50,51])a[i]=' ';
 if(q.markerExport){a[43]='x';a[45]=q.materialCode;const n=String(q.normal).padStart(2,'0'),m=String(q.mirrored).padStart(2,'0');need(n.length===2&&m.length===2,'Native list supports amounts 0–99');a.splice(47,2,...n);a.splice(50,2,...m);}
 // Only the category suffix is rewritten; other existing suffixes are preserved.
 const suffix=row.slice(72).replace(/ K="[^"\r\n]*"/g,'');return a.join('')+suffix+(q.category?' K="'+q.category+'"':'');
}
function inspect(document,partId){
 const b=serializeMdl(document),d=parseMdl(b);need(d.variant==='VA','VA part properties required');need(Number.isInteger(partId)&&partId>0,'Select a part');need(new Set(d.blocks.map(key)).size===d.blocks.length,'Duplicate native blocks');
 const one=k=>{const x=d.blocks.find(x=>key(x)===k);need(x,'Missing '+k);return x;},prop=one(`3.${partId}.6.6`),list=one('2.1.0.0');one(`3.${partId}.1.0`);
 const properties=decodeProductionPayload(b.slice(prop.payloadOffset,prop.endOffset));const text=latin(b.slice(list.payloadOffset,list.endOffset)),lines=text.replace(/\0+$/,'').split('\r\n'),start=lines.indexOf('#TLIST'),end=lines.findIndex((r,i)=>i>start&&r.startsWith('#'));need(start>=0&&end>start,'Unknown part list');const hits=lines.map((r,i)=>({r,i})).filter(x=>x.i>start&&x.i<end&&Number(x.r.slice(3,6))===partId);need(hits.length===1,'Ambiguous part list row');need(hits[0].r.length>=72&&/^ID=[0-9a-f]{16}$/i.test(hits[0].r.slice(53,72)),'Unsupported part list');
 return{b,d,prop,list,properties,lines,row:hits[0]};
}
export function inspectProductionProperties(document,partId){try{const s=inspect(document,partId);return{eligible:true,...s.properties};}catch(e){return{eligible:false,reason:e.message};}}
function check(b,n=b.length){let sum=0;for(let i=4;i<n;i+=2){sum=(sum+Math.imul(i/2+1,view(b).getInt16(i,true)))|0;if(sum>=1024000000)sum-=1024000000;}return sum>>>0;}
function block(id,p){const b=new Uint8Array(32+p.length),v=view(b);v.setUint32(4,b.length/8,true);b.set(bytes('BLO5kenn'),8);id.forEach((n,i)=>v.setUint32(16+4*i,n,true));b.set(p,32);v.setUint32(0,check(b),true);return b;}
export function updateProductionProperties(document,{partId,production,markerExport,stitchPart,materialCode,normal,mirrored,categoryId}){
 const s=inspect(document,partId),old=s.properties,records=old.records.map(r=>({type:r.type,body:r.body.slice()}));
 need(typeof production==='boolean'&&typeof markerExport==='boolean'&&typeof stitchPart==='boolean','Choose valid part flags');
 need(!production||markerExport||stitchPart,'Production requires Marker/export or Stitch');
 need(Object.hasOwn(MATERIALS,materialCode)||materialCode===old.materialCode,'Unsupported material');
 for(const n of [normal,mirrored])need(Number.isInteger(n)&&n>=0&&n<=99,'الكميات أعداد صحيحة من 0 إلى 99.');
 const assign=(type,body)=>{const i=records.findIndex(r=>r.type===type);if(i>=0)records[i].body=body;else records.push({type,body});};
 let p=records.find(r=>r.type===1)?.body;
 if(production){const material=materialCode===old.materialCode&&p?p.slice(16):(()=>{const label=MATERIALS[materialCode];if(!label)return new Uint8Array();const a=new Uint8Array(Math.ceil((label.length+1)/8)*8).fill(32);a.set(bytes(label));a[label.length]=0;return a;})();const next=new Uint8Array(16+material.length);if(p)next.set(p.subarray(0,16));put16(next,0,next.length/8);put16(next,2,1);next[4]=markerExport?255:0;next[5]=materialCode.charCodeAt(0);put16(next,6,normal+mirrored);put16(next,8,mirrored);put16(next,10,material.length/8);put16(next,12,stitchPart?1:0);next.set(material,16);assign(1,next);}
 else if(p){p[4]=0;put16(p,12,0);assign(1,p);}
 if(categoryId!==undefined&&String(categoryId??'')!==String(old.categoryId??'')){need(Object.hasOwn(CATEGORIES,String(categoryId??'')),'Only verified category choices are editable');const label=CATEGORIES[categoryId??''];if(!label){const i=records.findIndex(r=>r.type===4);if(i>=0)records.splice(i,1);}else{const body=new Uint8Array(8+Math.ceil(label.length/8)*8);put16(body,0,body.length/8);put16(body,2,4);put16(body,4,(body.length-8)/8);put16(body,6,Number(categoryId));body.set(bytes(label),8);assign(4,body);}}
 const date=records.find(r=>r.type===5)?.body;need(date,'Native edit-date record required');const now=new Date();need(now.getFullYear()>=1980&&now.getFullYear()<2236,'Edit date outside native range');date.set([now.getFullYear()-1980,now.getMonth()+1,now.getDate(),now.getHours(),now.getMinutes(),now.getSeconds()],12);
 const prop=cat(records.map(r=>r.body)),q=decodeProductionPayload(prop);s.lines[s.row.i]=productionListRow(s.row.r,q);const raw=bytes(s.lines.join('\r\n')),list=new Uint8Array(Math.ceil(raw.length/8)*8);list.set(raw);
 const replacements=new Map([[key(s.prop),prop],[key(s.list),list]]);const out=cat([s.b.slice(0,80),...s.d.blocks.map(x=>replacements.has(key(x))?block(x.id,replacements.get(key(x))):s.b.slice(x.offset,x.endOffset)),s.b.slice(-8)]);view(out).setUint32(4,(out.length-8)/8,true);view(out).setUint32(0,check(out,80),true);return parseMdl(out);
}
