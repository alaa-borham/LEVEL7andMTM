/** Measured 108/103 native notch-type changes. No cached geometry is an input. */
const need=(x,m)=>{if(!x)throw Error(m);},v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export const symbolTypes=[{id:1,name:'شق مستقيم',key:'slit'},{id:2,name:'علامة مستطيلة',key:'notch'},{id:3,name:'علامة متسعة',key:'pitch'},{id:4,name:'علامة V',key:'v'}];
export function symbolPrefix(type){need(symbolTypes.some(t=>t.id===type),'Unsupported production symbol type');return new Uint8Array([2,0,5,1,2,0,0,0,type,0,0,0,0,0,0,0]);}
export function writeSymbolTypeRecord({type,objectId,length}){need(symbolTypes.some(t=>t.id===type)&&Number.isInteger(objectId)&&objectId>=2001&&objectId<60000&&typeof length==='number'&&Number.isFinite(length)&&length>=.01&&length<=100,'تعريف نوع العلامة غير مدعوم.');const raw=new Uint8Array(32),q=v(raw);[108,103,type,objectId].forEach((n,i)=>q.setUint16(2*i,n,true));q.setFloat32(28,length,true);return raw;}
export function readSymbolTypeRecord(raw){try{if(raw?.length!==32)return null;const q=v(raw),r={type:q.getUint16(4,true),objectId:q.getUint16(6,true),length:q.getFloat32(28,true)},expected=writeSymbolTypeRecord(r);return raw.every((n,i)=>n===expected[i])?r:null;}catch{return null;}}
export function constructNativeSymbol({type,origin,end,length}){need(symbolTypes.some(t=>t.id===type)&&origin?.length===2&&end?.length===2&&[...origin,...end,length].every(Number.isFinite)&&length>=.01&&length<=100,'Invalid native symbol geometry');const d=end.map((n,k)=>n-origin[k]),n=Math.hypot(...d);need(n>.0001,'Degenerate native symbol direction');
 const direction=d.map(x=>x/n),normal=[-direction[1],direction[0]],at=(t,w)=>origin.map((x,k)=>x+t*length*direction[k]+w*length*normal[k]);
 if(type===1)return[at(0,0),at(1,0)];
 if(type===2)return[at(0,.2),at(1,.2),at(1,-.2),at(0,-.2)];
 if(type===3)return[at(0,.3*45/99),at(1,.3),at(1,-.3),at(0,-.3*45/99)];
 return[at(0,.25),at(1,0),at(0,-.25)];
}
export function replaySymbolType(plan,objects,record){const o=objects.find(o=>o.id===plan.objectId);need(o&&!o.hidden&&o.nativeSlitNotch,'اختر علامة قص أصلية مدعومة.');const previous=o.nativeSymbol??(!o.geometryKind&&o.points.length===2?{type:1,origin:o.points[0],end:o.points[1],length:Math.hypot(...o.points[1].map((n,k)=>n-o.points[0][k]))}:null);need(previous&&Math.abs(plan.length-previous.length)<.0001,'تغيير النوع يحافظ على طول العلامة الأصلي.');const symbol={...previous,type:plan.type,length:plan.length},points=constructNativeSymbol(symbol),out={...o,points,nativeSymbol:symbol,operation:'change-symbol-type',lastModifiedRecord:record};if(plan.type!==1){out.geometryKind='polyline';out.nativePolylineParity=true;}else{delete out.geometryKind;delete out.nativePolylineParity;}return out;}
export function sameSymbolTypeHistory(a,b){if(a.length!==b.length)return false;for(let at=0;at<a.length;at+=32){const x=a.subarray(at,at+32),y=b.subarray(at,at+32);if(x.every((n,i)=>n===y[i]))continue;const p=readSymbolTypeRecord(x),q=readSymbolTypeRecord(y);if(!p||!q||p.objectId!==q.objectId||p.length!==q.length)return false;}return true;}
export function symbolTypeSuffix(a,b){if(b.length!==a.length+32||!a.every((n,i)=>n===b[i]))return null;return readSymbolTypeRecord(b.subarray(a.length));}


