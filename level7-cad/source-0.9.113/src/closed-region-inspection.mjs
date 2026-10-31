/** Read-only contour topology for source-calculated millimetre paths.
 * Never closes gaps, snaps new coordinates or changes document references. */
const tolerance=.0001;
const need=(ok,message)=>{if(!ok)throw Error(message);};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const same=(a,b)=>distance(a,b)<tolerance;
function validate(paths){
 need(Array.isArray(paths)&&paths.length>0&&paths.length<=128&&new Set(paths.map(p=>p.objectId)).size===paths.length,'حدود المساحة مكررة أو كبيرة جدًا.');
 need(paths.every(p=>Array.isArray(p.points)&&p.points.length>=2&&p.points.every((q,i)=>Array.isArray(q)&&q.length===2&&q.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)&&(!i||distance(q,p.points[i-1])>1e-7)))&&paths.reduce((n,p)=>n+p.points.length-1,0)<=1600,'حدود المساحة غير صالحة أو كبيرة جدًا.');
}
const endpoints=p=>[p.points[0],p.points.at(-1)];
export function connectedContour(paths,objectId,closeBoundary){
 const seed=paths.find(p=>p.objectId===objectId);need(seed,'اختر خطًا أو منحنى من الحد المغلق.');
 const connected=[seed],remaining=paths.filter(p=>p!==seed);
 for(let i=0;i<connected.length;i++)for(let j=remaining.length-1;j>=0;j--){const p=remaining[j];if(endpoints(connected[i]).some(a=>endpoints(p).some(b=>same(a,b)))){connected.push(p);remaining.splice(j,1);need(connected.length<=128,'المحيط المتصل كبير جدًا.');}}
 validate(connected);
 // Every endpoint must have exactly one continuation. An explicitly closed
 // path contributes both incidences at its own start/end vertex.
 for(const p of connected)for(const a of endpoints(p))need(connected.reduce((n,q)=>n+endpoints(q).filter(b=>same(a,b)).length,0)===2,'الحد مفتوح أو متفرع؛ حدده يدويًا دون خطوط إضافية.');
 const boundary=closeBoundary(connected);return{boundary,sourceObjectIds:connected.map(p=>p.objectId)};
}
function ringsOf(paths,closeBoundary){
 validate(paths);const remaining=paths.slice(),rings=[];
 while(remaining.length){const first=remaining.shift(),ordered=[first];let end=first.points.at(-1),start=first.points[0];
  while(!same(end,start)){
   const matches=[];for(let i=0;i<remaining.length;i++){const p=remaining[i];if(same(end,p.points[0]))matches.push({i,end:p.points.at(-1)});if(same(end,p.points.at(-1)))matches.push({i,end:p.points[0]});}
   need(matches.length===1,'الحد مفتوح أو متفرع؛ أكمل كل حلقة مغلقة.');const hit=matches[0];ordered.push(remaining.splice(hit.i,1)[0]);end=hit.end;
  }
  rings.push(closeBoundary(ordered));
 }
 return rings;
}
function segmentGap(p,a,b){const d=b.map((x,k)=>x-a[k]),length2=d[0]**2+d[1]**2,t=Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/length2));return distance(p,a.map((x,k)=>x+t*d[k]));}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function touch(a,b,c,d){
 if(Math.min(segmentGap(a,c,d),segmentGap(b,c,d),segmentGap(c,a,b),segmentGap(d,a,b))<tolerance)return true;
 return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const area=ring=>Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
const perimeter=ring=>ring.reduce((s,p,i)=>s+distance(p,ring[(i+1)%ring.length]),0);
export function measureClosedRegion(paths,closeBoundary){
 const rings=ringsOf(paths,closeBoundary);
 for(let i=0;i<rings.length;i++)for(let j=i+1;j<rings.length;j++)for(let a=0;a<rings[i].length;a++)for(let b=0;b<rings[j].length;b++)need(!touch(rings[i][a],rings[i][(a+1)%rings[i].length],rings[j][b],rings[j][(b+1)%rings[j].length]),'حدود الفتحات متقاطعة أو متلامسة؛ افصلها داخل المحيط الخارجي.');
 const depths=rings.map((r,i)=>rings.filter((other,j)=>i!==j&&inside(r[0],other)).length),outer=depths.map((d,i)=>d===0?i:-1).filter(i=>i>=0);
 need(outer.length===1,'اختر محيطًا خارجيًا واحدًا؛ يجب أن تقع الفتحات داخله.');need(depths.every(d=>d<=1),'الفتحات المتداخلة غير مدعومة؛ حدد فتحات منفصلة.');
 const boundary=rings[outer[0]],holes=rings.filter((r,i)=>depths[i]===1),grossArea=area(boundary),holeArea=holes.reduce((s,r)=>s+area(r),0),value=grossArea-holeArea;
 need(value>1e-8&&rings.every(r=>area(r)>1e-8),'المساحة منعدمة.');const outerPerimeter=perimeter(boundary),innerPerimeter=holes.reduce((s,r)=>s+perimeter(r),0);
 return{value,boundary,boundaries:[boundary,...holes],grossArea,holeArea,holeCount:holes.length,outerPerimeter,innerPerimeter,perimeter:outerPerimeter+innerPerimeter};
}
