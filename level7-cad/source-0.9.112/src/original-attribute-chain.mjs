/** Endpoint-connected original paths; rejects ambiguous branches, never snaps geometry. */
const need=(ok,message)=>{if(!ok)throw Error(message);};
export function selectOriginalAttributeChain(paths,objectId){
 need(Array.isArray(paths)&&paths.length>0&&paths.length<=4096&&new Set(paths.map(p=>p.id)).size===paths.length,'قائمة السلسلة غير صالحة أو كبيرة جدًا.');
 const endpoints=p=>[p.points[0],p.points.at(-1)],same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.0001;
 need(paths.every(p=>Number.isInteger(p.id)&&p.id>=2001&&p.id<60000&&Array.isArray(p.points)&&p.points.length>=2&&endpoints(p).every(q=>Array.isArray(q)&&q.length===2&&q.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))),'السلسلة تحتاج خطوطًا أو منحنيات أصلية صحيحة.');
 const seed=paths.find(p=>p.id===objectId);need(seed,'اختر خطًا أو منحنى أصليًا من السلسلة.');
 const connected=[seed],remaining=paths.filter(p=>p!==seed);for(let i=0;i<connected.length;i++)for(let j=remaining.length-1;j>=0;j--){const p=remaining[j];if(endpoints(connected[i]).some(a=>endpoints(p).some(b=>same(a,b)))){connected.push(p);remaining.splice(j,1);need(connected.length<=128,'السلسلة أكبر من 128 عنصرًا؛ استخدم التحديد الفردي.');}}
 for(const p of connected)for(const a of endpoints(p))need(connected.reduce((n,q)=>n+endpoints(q).filter(b=>same(a,b)).length,0)<=2,'السلسلة متفرعة أو تحتوي نهايات متطابقة متعددة؛ استخدم التحديد الفردي.');
 return connected.map(p=>p.id);
}
