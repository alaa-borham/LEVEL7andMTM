/** Native Chain selection: unique tangent continuation, no gaps, branches or loops. */
const need=(ok,m)=>{if(!ok)throw Error(m);},same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.0001;
const tangent=(a,b)=>{const u=a.at(-1).map((n,k)=>n-a.at(-2)[k]),v=b[1].map((n,k)=>n-b[0][k]),n=Math.hypot(...u)*Math.hypot(...v);return n>1e-12&&(u[0]*v[0]+u[1]*v[1])/n>0&&Math.abs(u[0]*v[1]-u[1]*v[0])/n<=.0001;};
export function selectOriginalJoinChain(paths,seedId,reverse=false){
 need(Array.isArray(paths)&&paths.length<=4096&&new Set(paths.map(p=>p.id)).size===paths.length&&typeof reverse==='boolean','قائمة سلسلة الضم غير صالحة.');
 need(paths.every(p=>Array.isArray(p.points)&&p.points.length>=2&&p.points.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite))),'هندسة سلسلة الضم غير صالحة.');
 const seed=paths.find(p=>p.id===seedId);need(seed,'اختر مسارًا أصليًا لبدء السلسلة.');const oriented=(p,r)=>({id:p.id,reverse:r,points:r?p.points.toReversed():p.points}),chain=[oriented(seed,reverse)],used=new Set([seedId]);
 for(const side of['end','start'])for(;;){const boundary=side==='end'?chain.at(-1):chain[0],candidates=[];for(const p of paths)if(!used.has(p.id))for(const r of[false,true]){const next=oriented(p,r);if(side==='end'?same(boundary.points.at(-1),next.points[0])&&tangent(boundary.points,next.points):same(next.points.at(-1),boundary.points[0])&&tangent(next.points,boundary.points))candidates.push(next);}
  need(candidates.length<=1,'السلسلة المماسية متفرعة؛ استخدم الضم الفردي.');if(!candidates.length)break;need(chain.length<3,'السلسلة أطول من ثلاثة مسارات؛ هذا الامتداد غير مدعوم بعد.');const next=candidates[0];used.add(next.id);side==='end'?chain.push(next):chain.unshift(next);
 }
 need(chain.length>=2,'لا يوجد مسار متصل مماسيًا؛ استخدم الضم الفردي للزوايا.');need(!same(chain[0].points[0],chain.at(-1).points.at(-1)),'السلسلة المغلقة غير مدعومة بهذا الخيار بعد.');
 return{sourceIds:chain.map(p=>p.id),reverseFlags:chain.map(p=>p.reverse)};
}
