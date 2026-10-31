const need=(v,m)=>{if(!v)throw Error(m);},view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6;
/** Native QS pick payload, bounded to points, numeric coordinates and straight-line fractions. */
export function encodeQSPointSelection(selection,{objects,beforeRecord=Infinity}={}){
 need(selection&&typeof selection==='object'&&Array.isArray(objects),'اختر مرجع نقطة أصليًا.');const keys=Object.keys(selection).sort().join(','),payload=new Uint8Array(16),q=view(payload),dependencies=[];let point;
 const source=(id,count)=>{need(Number.isInteger(id)&&id>=2001&&id<60000,'معرّف مرجع غير صالح.');const o=objects.find(o=>o.id===id&&!o.hidden&&!o.geometryKind&&o.points.length===count&&o.record<beforeRecord);need(o,'المرجع غير متاح قبل الخط أو ليس من النوع المدعوم.');need(o.points.flat().every(finite),'هندسة المرجع غير صالحة.');dependencies.push(id);return o;};
 if(keys==='pointId'){const o=source(selection.pointId,1);q.setUint16(0,1,true);q.setUint16(2,256,true);q.setUint16(8,o.id,true);q.setUint16(10,1,true);point=o.points[0].slice();}
 else if(keys==='fraction,lineId'){need(finite(selection.fraction)&&selection.fraction>=0&&selection.fraction<=1,'النسبة من صفر إلى واحد.');const o=source(selection.lineId,2),f=Math.fround(selection.fraction);need(Math.hypot(...o.points[1].map((n,i)=>n-o.points[0][i]))>=1e-7,'الخط المرجعي منعدم الطول.');q.setUint16(0,f===0||f===1?2:5,true);q.setUint16(2,f===0||f===1?512:767,true);q.setUint32(8,o.id,true);q.setFloat32(12,f,true);point=o.points[0].map((n,i)=>Math.fround(n+(o.points[1][i]-n)*f));}
 else{need(keys==='x,y'&&[selection.x,selection.y].every(finite),'اختر نقطة أو نسبة مرتبطة بخط أو إحداثيات عددية صريحة؛ لم تُفصل معاملات أخرى.');q.setUint16(0,7,true);q.setFloat32(8,selection.x,true);q.setFloat32(12,selection.y,true);point=[Math.fround(selection.x),Math.fround(selection.y)];}
 need(point.every(finite),'إحداثيات الطرف تتجاوز النطاق.');return{payload,point,dependencies};
}
export function decodeQSPointSelection(bytes){
 need(bytes instanceof Uint8Array&&bytes.length===40,'مرجع QS غير صالح.');const q=view(bytes),mode=q.getUint16(16,true),flags=q.getUint16(18,true);need(q.getUint32(20,true)===0&&bytes.subarray(32).every(n=>n===0),'حقول مرجع QS غير معروفة.');
 if(mode===1&&flags===256){need(q.getUint16(26,true)===1&&q.getUint32(28,true)===0,'مرجع نقطة QS غير معروف.');return{pointId:q.getUint16(24,true)};}
 if(mode===2&&flags===512||mode===5&&[512,767].includes(flags)){const f=q.getFloat32(28,true);need(Number.isFinite(f)&&f>=0&&f<=1&&(mode!==2||f===0||f===1),'نسبة مرجع QS غير صالحة.');return{lineId:q.getUint32(24,true),fraction:mode===5&&flags===512?Math.fround(1-f):f};}
 need(mode===7&&flags===0,'محدد نقطة QS غير مدعوم.');const s={x:q.getFloat32(24,true),y:q.getFloat32(28,true)};need([s.x,s.y].every(finite),'إحداثيات QS غير صالحة.');return s;
}
