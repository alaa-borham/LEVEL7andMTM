/** Restricted browser-only default X and comment-free Rstep1 Z table encoders. */
import{NativeBytes}from'./native-n38-bytes.js';
import{parseExperimentalExpression}from'./native-n38-expression.js';
function ensure(v,m){if(!v)throw new Error(m);}const align8=n=>Math.ceil(n/8)*8;
export function encodeExperimentalXEntries(entries){
  ensure(Array.isArray(entries)&&entries.length<=80,'Up to 80 sequential local default X values are accepted.');const outputs=[];
  for(let n=0;n<entries.length;n++){const index=entries[n].index,value=entries[n].value;ensure(index===n+1,'X indices must be contiguous from 1 through 80.');ensure(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=10000,'X value exceeds finite ±10000 bounds.');const stored=Math.fround(value);ensure(Number.isFinite(stored),'X value is not finite float32.');const out=NativeBytes.alloc(24);out.writeUInt32LE(3,0);out.writeUInt16LE(index,4);out.fill(0x20,6,14);out.writeFloatLE(stored,16);outputs.push(out);}
  return NativeBytes.concat(outputs);
}
export function encodeExperimentalZEntries(entries){
  ensure(Array.isArray(entries)&&entries.length<=99,'Up to 99 sequential simple Z definitions are accepted.');const outputs=[];
  for(let n=0;n<entries.length;n++){const index=entries[n].index,formula=entries[n].formula;ensure(index===n+1,'Z indices must be contiguous from 1 through 99.');const parsed=parseExperimentalExpression(formula),text=parsed.text;ensure(text.length<=64,'Formula exceeds64 experimental native bytes.');for(const ref of parsed.references)ensure(!ref.startsWith('Z')||Number(ref.slice(1))<index,'Only earlier Z definitions may be used.');const out=NativeBytes.alloc(24+align8(text.length),0x20);out.fill(0,0,24);out.writeUInt16LE(out.length/8,0);out.writeUInt16LE(0x0c00,2);out.writeUInt16LE(index,4);out.writeUInt16LE(1,6);out.writeUInt16LE(text.length,8);out.write(text,24,'ascii');if(24+text.length<out.length)out[24+text.length]=0;outputs.push(out);}
  return NativeBytes.concat(outputs);
}