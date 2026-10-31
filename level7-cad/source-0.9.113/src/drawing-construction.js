// Numerical construction of ordinary points/reference lines. These helpers do
// not encode a persistent parallel/perpendicular/measurement dependency.
const limit=1_000_000;
function point(p){if(!p||![p.x,p.y].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=limit))throw Error('الإحداثيات خارج النطاق المسموح.');return{x:Math.fround(p.x),y:Math.fround(p.y),...(p.pointId===undefined?{}:{pointId:p.pointId})};}
function segment(a,b){a=point(a);b=point(b);if(a.x===b.x&&a.y===b.y)throw Error('الخط يحتاج نقطتين مختلفتين.');return{start:a,end:b};}
function reference(line){const a=point(line?.a),b=point(line?.b),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)throw Error('الخط المرجعي ليس له طول.');return{a,b,ux:dx/length,uy:dy/length};}
export function polarSegment(start,length,angle){
  const a=point(start);if(typeof length!=='number'||!Number.isFinite(length)||length<=0||length>limit)throw Error('أدخل طولًا أكبر من صفر، حتى 1000000 مم.');
  if(typeof angle!=='number'||!Number.isFinite(angle)||Math.abs(angle)>360)throw Error('أدخل زاوية بين ‎-360 و360 درجة.');
  const radians=angle*Math.PI/180;return segment(a,{x:a.x+length*Math.cos(radians),y:a.y+length*Math.sin(radians)});
}
export function parallelSegment(line,p,offset=null){
  const r=reference(line),q=point(p),nx=-r.uy,ny=r.ux;
  const d=offset===null?(q.x-r.a.x)*nx+(q.y-r.a.y)*ny:offset;
  if(typeof d!=='number'||!Number.isFinite(d)||Math.abs(d)>limit||d===0)throw Error('حدد مسافة توازٍ غير صفرية ضمن النطاق المسموح.');
  const result=segment({x:r.a.x+nx*d,y:r.a.y+ny*d},{x:r.b.x+nx*d,y:r.b.y+ny*d});
  if(result.start.x===r.a.x&&result.start.y===r.a.y&&result.end.x===r.b.x&&result.end.y===r.b.y)throw Error('المسافة أصغر من دقة حفظ الإحداثيات.');
  return{...result,offset:d};
}
export function perpendicularSegment(line,p){
  const r=reference(line),q=point(p),distance=(q.x-r.a.x)*r.ux+(q.y-r.a.y)*r.uy;
  return segment({x:r.a.x+r.ux*distance,y:r.a.y+r.uy*distance},q);
}
export function midpoint(line){const r=reference(line);return point({x:(r.a.x+r.b.x)/2,y:(r.a.y+r.b.y)/2});}

export function unequalParallelSegment(line,startOffset,endOffset){
  const r=reference(line);
  for(const d of [startOffset,endOffset])if(typeof d!=='number'||!Number.isFinite(d)||Math.abs(d)>limit)throw Error('أدخل مسافتين صحيحتين ضمن النطاق المسموح.');
  if(startOffset===0&&endOffset===0)throw Error('أدخل مسافة غير صفرية لأحد الطرفين.');
  return segment({x:r.a.x-r.uy*startOffset,y:r.a.y+r.ux*startOffset},{x:r.b.x-r.uy*endOffset,y:r.b.y+r.ux*endOffset});
}

export function resizedSegment(line,value,{by=false,fromStart=false}={}){
  const r=reference(line),oldLength=Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y);
  if(typeof value!=='number'||!Number.isFinite(value))throw Error('أدخل طولًا صحيحًا.');
  const length=by?oldLength+value:value;
  if(length<=0||length>limit)throw Error('الطول النهائي يجب أن يكون أكبر من صفر وحتى 1000000 مم.');
  return fromStart?segment({x:r.b.x-r.ux*length,y:r.b.y-r.uy*length},r.b):segment(r.a,{x:r.a.x+r.ux*length,y:r.a.y+r.uy*length});
}

export function axisSegment(start,end,axis){const a=point(start),b=point(end);if(!['horizontal','vertical'].includes(axis))throw Error('Unknown line axis');return segment(a,axis==='horizontal'?{x:b.x,y:a.y}:{x:a.x,y:b.y});}
export function pointOnLine(line,value,{percentage=false,fromEnd=false}={}){const r=reference(line),length=Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y);if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>(percentage?100:limit))throw Error(percentage?'أدخل نسبة من 0 إلى 100.':'أدخل مسافة من 0 إلى 1000000 مم.');const t=percentage?value/100:value/length,u=fromEnd?1-t:t;return point({x:r.a.x+(r.b.x-r.a.x)*u,y:r.a.y+(r.b.y-r.a.y)*u});}
