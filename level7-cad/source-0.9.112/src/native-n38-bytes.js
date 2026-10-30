/** Pure Uint8Array/DataView adapter; no Node runtime or external dependency. */
export class NativeBytes extends Uint8Array {
  static alloc(length,fill=0){const out=new NativeBytes(length);if(fill)out.fill(fill);return out;}
  static from(value,encoding){if(typeof value==='string'){if(encoding==='hex'){if(value.length%2||!/^[0-9a-f]*$/i.test(value))throw new Error('Invalid native hex.');const out=new NativeBytes(value.length/2);for(let n=0;n<out.length;n++)out[n]=parseInt(value.slice(n*2,n*2+2),16);return out;}const out=new NativeBytes(value.length);for(let n=0;n<out.length;n++)out[n]=value.charCodeAt(n)&255;return out;}return new NativeBytes(value);}
  static concat(parts){const out=new NativeBytes(parts.reduce((n,b)=>n+b.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;}
  view(){return new DataView(this.buffer,this.byteOffset,this.byteLength);}
  readUInt16LE(at){return this.view().getUint16(at,true);} readInt16LE(at){return this.view().getInt16(at,true);} readUInt32LE(at){return this.view().getUint32(at,true);} readFloatLE(at){return this.view().getFloat32(at,true);}
  writeUInt16LE(value,at){this.view().setUint16(at,value,true);return at+2;} writeUInt32LE(value,at){this.view().setUint32(at,value,true);return at+4;} writeFloatLE(value,at){this.view().setFloat32(at,value,true);return at+4;}
  write(text,at=0,encoding='ascii'){for(let n=0;n<text.length;n++)this[at+n]=text.charCodeAt(n)&255;return text.length;}
  toString(encoding='latin1',start=0,end=this.length){if(encoding==='hex')return Array.from(this.subarray(start,end),v=>v.toString(16).padStart(2,'0')).join('');let text='';for(let n=start;n<end;n++)text+=String.fromCharCode(encoding==='ascii'?this[n]&127:this[n]);return text;}
  equals(other){return this.length===other.length&&this.every((n,i)=>n===other[i]);}
  copy(target,targetStart=0,start=0,end=this.length){target.set(this.subarray(start,end),targetStart);return end-start;}
}
