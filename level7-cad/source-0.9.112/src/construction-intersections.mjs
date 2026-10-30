/** Segment intersections from computed paths. Never chooses a branch by a mouse hint. */
const ensure=(ok,m)=>{if(!ok)throw Error(m);},cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
export function intersectConstructionPaths(p,q,{extendA=[],extendB=[]}={}){
 for(const points of[p,q])ensure(Array.isArray(points)&&points.length>=2&&points.length<=801&&points.every(v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)),'Intersection path bound');
 for(const ends of[extendA,extendB])ensure(ends.every(n=>n===0||n===1),'Invalid extension end');
 const allowed=(t,i,n,ends)=>t>=-1e-7&&t<=1+1e-7||ends.includes(0)&&i===0&&t<0||ends.includes(1)&&i===n-2&&t>1;
 const hits=[];let pa=0;
 for(let i=0;i<p.length-1;i++){const d=p[i+1].map((x,k)=>x-p[i][k]),dn=Math.hypot(...d);ensure(dn>1e-7,'Degenerate intersection segment');let qb=0;
  for(let j=0;j<q.length-1;j++){const e=q[j+1].map((x,k)=>x-q[j][k]),en=Math.hypot(...e),o=q[j].map((x,k)=>x-p[i][k]),den=cross(d,e);ensure(en>1e-7,'Degenerate intersection segment');
   if(Math.abs(den)>1e-12*dn*en){const t=cross(o,e)/den,u=cross(o,d)/den;if(allowed(t,i,p.length,extendA)&&allowed(u,j,q.length,extendB)){
    ensure(Math.max(Math.max(0,-t,t-1)*dn,Math.max(0,-u,u-1)*en)<=10000,'Intersection extension bound');const point=p[i].map((x,k)=>x+t*d[k]),a=pa+t*dn,b=qb+u*en;ensure(point.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6),'Unbounded intersection');
    if(!hits.some(h=>Math.hypot(...h.point.map((x,k)=>x-point[k]))<.0002&&Math.abs(h.a-a)<.0002&&Math.abs(h.b-b)<.0002))hits.push({point:point.map(Math.fround),i,j,a,b,t,u});
   }}else if(Math.abs(cross(o,d))/dn<.0001){
    const t0=(o[0]*d[0]+o[1]*d[1])/dn**2,t1=t0+(e[0]*d[0]+e[1]*d[1])/dn**2;
    ensure(Math.min(Math.max(t0,t1),1)-Math.max(Math.min(t0,t1),0)<=.0001/dn&&!extendA.length&&!extendB.length,'Coincident construction paths');
   }qb+=en;
  }pa+=dn;
 }return hits;
}
export function uniqueConstructionIntersection(p,q,options={}){
 let hits=intersectConstructionPaths(p,q);
 if(!hits.length&&(options.extendA?.length||options.extendB?.length))hits=intersectConstructionPaths(p,q,options);
 ensure(hits.length===1,hits.length?'Ambiguous construction intersection':'No construction intersection');return hits[0];
}
