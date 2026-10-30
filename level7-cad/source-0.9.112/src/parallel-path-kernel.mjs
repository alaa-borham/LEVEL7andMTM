/** Computed polyline joins and bounded parallel offsets; no cache inputs. */
const ensure=(ok,m)=>{if(!ok)throw Error(m);};
const distance=(p,q)=>Math.hypot(...p.map((x,k)=>x-q[k]));
/** Terminal collapse for a bounded, convex computed corner whose inward
 * parallel has folded beyond its terminal supports. No stored geometry input. */
export function collapseCornerCusp(input,amount,side){
 ensure(Number.isFinite(amount)&&amount>0&&amount<=10000&&[1,-1].includes(side),'Invalid corner offset');
 const p=input.map(q=>q.slice());while(p.length>3&&distance(p.at(-2),p.at(-1))<.2)p.splice(-2,1);
 const edges=p.slice(1).map((b,i)=>{const a=p[i],d=b.map((x,k)=>x-a[k]),length=Math.hypot(...d);ensure(length>1e-7,'Degenerate corner offset edge');const u=d.map(x=>x/length);return{length,u,a:a.map((x,k)=>x+side*amount*[u[1],-u[0]][k])};});
 ensure(edges.length>=3&&edges[0].length>2*amount&&edges.slice(1).reduce((s,e)=>s+e.length,0)<amount,'Corner cusp outside bounded terminal case');
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];let totalTurn=0;for(let i=1;i<edges.length;i++){const turn=Math.atan2(cross(edges[i-1].u,edges[i].u),edges[i-1].u.reduce((s,x,k)=>s+x*edges[i].u[k],0));ensure(turn*side<.02&&Math.abs(turn)<Math.PI/4,'Inflected or sharply reversing corner');totalTurn+=turn;}
 ensure(totalTurn*side<-.1&&Math.abs(totalTurn)<Math.PI/2,'Unsupported corner sweep');const a=edges[0],b=edges.at(-1),den=cross(a.u,b.u);ensure(Math.abs(den)>1e-6,'Parallel terminal supports');
 const t=cross(b.a.map((x,k)=>x-a.a[k]),b.u)/den,hit=a.a.map((x,k)=>x+t*a.u[k]);ensure(t>.2&&t<a.length-.2,'Cusp intersection outside first support');
 const end=p.at(-1).map((x,k)=>x+side*amount*[b.u[1],-b.u[0]][k]);ensure(end.reduce((s,x,k)=>s+(x-hit[k])*b.u[k],0)<0,'Terminal support has not folded');
 return[a.a,hit,hit.map((x,k)=>x+.2*b.u[k])].map(q=>q.map(Math.fround));
}
export function constructionPoints(o){
 const p=o.geometryKind?o.directionPolyline?.points:o.points;
 ensure(!o.geometryKind||o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm)&&['qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1','qq-one-natural-end-v1','qq-two-relative-end-v1','qq-two-auxiliary-v1','construction-cut-v1','construction-morph-v1','construction-join-v1','construction-offset-v1','round-corner-v1','construction-length-v1'].includes(o.directionPolyline?.family),'Unsupported construction geometry');
 ensure(Array.isArray(p)&&p.length>=2&&p.length<=8192&&p.every((q,i)=>Array.isArray(q)&&q.length===2&&q.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)&&(!i||distance(q,p[i-1])>1e-7)),'Invalid construction points');return p;
}
// Contour joins may keep double precision until intersection: rounding a very
// short parallel segment first can amplify a sub-micron error during extension.
export function offsetConstructionPoints(points,distanceMm,side,endDistance=distanceMm,{rejectReversal=false,roundCoordinates=true}={}){
 ensure(Number.isFinite(distanceMm)&&Number.isFinite(endDistance)&&Math.max(Math.abs(distanceMm),Math.abs(endDistance))<=10000&&[1,-1].includes(side),'Invalid offset');
 const checked=constructionPoints({points});if(distanceMm===0&&endDistance===0)return checked.map(p=>p.slice());
 const total=checked.slice(1).reduce((s,p,i)=>s+distance(p,checked[i]),0);let arc=0;
 const segments=checked.slice(1).map((b,i)=>{const a=checked[i],d=b.map((x,k)=>x-a[k]),length=Math.hypot(...d),start=distanceMm+(endDistance-distanceMm)*arc/total,end=distanceMm+(endDistance-distanceMm)*(arc+length)/total;arc+=length;const normal=[d[1]/length,-d[0]/length],aa=a.map((x,k)=>x+side*start*normal[k]),bb=b.map((x,k)=>x+side*end*normal[k]),delta=bb.map((x,k)=>x-aa[k]);return{a:aa,d:delta,n:Math.hypot(...delta)};});
 const out=[segments[0].a];for(let i=1;i<segments.length;i++){const a=segments[i-1],b=segments[i],den=a.d[0]*b.d[1]-a.d[1]*b.d[0],dot=(a.d[0]*b.d[0]+a.d[1]*b.d[1])/(a.n*b.n);ensure(dot>-.95,'Offset corner outside verified angle');let p;
  if(Math.abs(den)<=1e-10*a.n*b.n){ensure(dot>0,'Reversing offset segment');p=b.a;}
  else {const v=b.a.map((x,k)=>x-a.a[k]),t=(v[0]*b.d[1]-v[1]*b.d[0])/den;p=a.a.map((x,k)=>x+t*a.d[k]);}
  ensure(distance(p,checked[i])<=Math.max(.001,Math.abs(distanceMm)*8,Math.abs(endDistance)*8),'Unbounded offset miter');out.push(p);
 }const last=segments.at(-1);out.push(last.a.map((x,k)=>x+last.d[k]));ensure(out.every(p=>p.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)),'Unbounded offset');
 if(rejectReversal)segments.forEach((s,i)=>{const d=out[i+1].map((x,k)=>x-out[i][k]);ensure(s.d[0]*d[0]+s.d[1]*d[1]>1e-10,'Inside corner offset requires cusp clipping');});
 return roundCoordinates?out.map(p=>p.map(Math.fround)):out;
}

export function applyParallelPath({source,id,record,start,end,side,dependencies=[],retainConstructionPrecision=false}){
 const p=constructionPoints(source);
 ensure(Number.isFinite(start)&&Number.isFinite(end)&&Math.max(Math.abs(start),Math.abs(end))<=10000,'Invalid parallel distances');
 ensure([1,-1].includes(side),'Invalid parallel side');
 let points;
 if(p.length===2){const d=p[1].map((x,k)=>x-p[0][k]),n=Math.hypot(...d);points=p.map((q,i)=>q.map((x,k)=>Math.fround(x+side*[start,end][i]*[d[1],-d[0]][k]/n)));}
 else {try{points=offsetConstructionPoints(p,start,side,end,{rejectReversal:source.directionPolyline?.family==='round-corner-v1',roundCoordinates:!retainConstructionPrecision});}catch(e){if(source.directionPolyline?.family!=='round-corner-v1'||start!==end||e.message!=='Inside corner offset requires cusp clipping')throw e;points=collapseCornerCusp(p,start,side);}}
 return {id,record,points:points.map(p=>p.map(Math.fround)),dependencies:[source.id,...dependencies],operation:'parallel-path',...(p.length>2?{geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-offset-v1',points:points.map(p=>p.slice())}}:{})};
}

