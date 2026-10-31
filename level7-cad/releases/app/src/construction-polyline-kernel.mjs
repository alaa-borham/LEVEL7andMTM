/** Computed polyline joins; no cache inputs. */
import {intersectConstructionPaths} from './construction-intersections.mjs';
const ensure=(ok,m)=>{if(!ok)throw Error(m);};
const distance=(p,q)=>Math.hypot(...p.map((x,k)=>x-q[k]));
function joinAnchoredCrossingPaths(p,q){
 ensure(p.length>2&&q.length>2,'Unsupported anchored join geometry');
 let anchor=null,along=0;
 for(let i=0;i<p.length-1;i++){
  const d=p[i+1].map((x,k)=>x-p[i][k]),length=Math.hypot(...d),t=q[0].reduce((s,x,k)=>s+(x-p[i][k])*d[k],0)/length**2;
  if(t>=0&&t<=1&&distance(q[0],p[i].map((x,k)=>x+t*d[k]))<.0002){
   const a=along+t*length;if(anchor)ensure(Math.abs(anchor.a-a)<.0002,'Ambiguous join anchor');else anchor={a,d};
  }along+=length;
 }
 ensure(anchor&&anchor.a<along-.0002,'Missing join anchor');
 const qd=q[1].map((x,k)=>x-q[0][k]);ensure(qd.reduce((s,x,k)=>s+x*anchor.d[k],0)>0,'Conflicting anchored join orientation');
 const hits=intersectConstructionPaths(p,q);let qb=0;
 // A sampled endpoint can touch the other path without a sign-changing crossing.
 for(let j=0;j<q.length-1;j++){
  const d=q[j+1].map((x,k)=>x-q[j][k]),length=Math.hypot(...d),u=p.at(-1).reduce((s,x,k)=>s+(x-q[j][k])*d[k],0)/length**2;
  if(u>=0&&u<=1){const point=q[j].map((x,k)=>x+u*d[k]);if(distance(point,p.at(-1))<.0002)hits.push({point,i:p.length-2,j,a:along,b:qb+u*length});}
  qb+=length;
 }
 hits.sort((a,b)=>a.a-b.a);
 ensure(hits.length&&hits.every((h,i)=>h.a>=anchor.a-.0002&&(!i||h.b>=hits[i-1].b-.0002&&(Math.abs(h.a-hits[i-1].a)>=.0002||Math.abs(h.b-hits[i-1].b)<.0002))),'Ambiguous anchored join intersections');
 const h=hits.at(-1);ensure(h.b<qb-.0002,'Missing retained join tail');
 const points=[...p.slice(0,h.i+1).map(x=>x.slice())];
 if(distance(points.at(-1),h.point)>.0001)points.push(h.point.slice());
 for(const point of q.slice(h.j+1))if(distance(points.at(-1),point)>.0001)points.push(point.slice());
 return points;
}
function joinOverlappingStraightPrefix(p,q){
 if(p.length===2&&q.length>2)return joinOverlappingStraightPrefix(q.toReversed(),p.toReversed()).toReversed();
 ensure(p.length>2&&q.length===2,'Unsupported nonshared join');const d=p[1].map((x,k)=>x-p[0][k]),length=Math.hypot(...d),u=d.map(x=>x/length),at=x=>x.reduce((s,v,k)=>s+(v-p[0][k])*u[k],0),off=x=>Math.abs((x[0]-p[0][0])*u[1]-(x[1]-p[0][1])*u[0]);let last=1;
 while(last+1<p.length&&off(p[last+1])<.0001&&at(p[last+1])>at(p[last]))last++;
 ensure(last<p.length-1&&q.every(x=>off(x)<.0001),'No shared straight prefix');const ends=q.map(at),low=Math.min(...ends),high=Math.max(...ends),prefix=at(p[last]);ensure(low>=0&&low<prefix-.0001&&high>prefix+.0001&&p.slice(last+1).every(x=>at(x)>=prefix-.0001),'Unsupported prefix overlap');
 return [...p.slice(0,last+1).map(x=>x.slice()),q[ends[0]>ends[1]?0:1].slice()];
}
export function constructionPoints(o){
 const p=o.geometryKind?o.directionPolyline?.points:o.points;
 ensure(!o.geometryKind||o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm)&&['qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1','qq-one-natural-end-v1','qq-two-relative-end-v1','qq-two-auxiliary-v1','construction-cut-v1','construction-morph-v1','construction-join-v1','construction-offset-v1','round-corner-v1'].includes(o.directionPolyline?.family),'Unsupported construction geometry');
 ensure(Array.isArray(p)&&p.length>=2&&p.length<=8192&&p.every((q,i)=>Array.isArray(q)&&q.length===2&&q.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)&&(!i||distance(q,p[i-1])>1e-7)),'Invalid construction points');return p;
}
export function joinComputedObjects({historyRecord,record,objects}){
 ensure(historyRecord instanceof Uint8Array&&historyRecord.length===32,'Invalid join record');const v=new DataView(historyRecord.buffer,historyRecord.byteOffset,32),op=v.getUint16(0,true),sub=v.getUint16(2,true),id=v.getUint16(6,true),count=v.getUint16(4,true);
 ensure(op>=102&&op%100===2&&[op+4,op+5].includes(sub)&&[2,3,4].includes(count),'Unsupported join header');const ids=Array.from({length:count},(_,i)=>v.getUint16(8+2*i,true)),flags=Array.from({length:count},(_,i)=>v.getUint16(8+2*count+2*i,true));
 ensure(ids.includes(id)&&new Set(ids).size===count,'Invalid joined identities');ensure(flags.every(f=>[0,65535].includes(f))&&[16,18,20,22,24,26].every(i=>[0,65535].includes(v.getUint16(i,true))),'Unknown join flags');for(let i=8+4*count;i<32;i++)if(i<16||i>=28)ensure(historyRecord[i]===0,'Unknown join tail');
 const paths=ids.map((id,i)=>{const o=objects.find(o=>o.id===id);ensure(o,'Missing joined source');const p=constructionPoints(o);return flags[i]===65535?p.toReversed():p;});let points=paths[0].map(p=>p.slice());
 for(const right of paths.slice(1)){const p=points,q=right,matches=[];for(const i of[0,p.length-1])for(const j of[0,q.length-1])if(distance(p[i],q[j])<.0001)matches.push([i,j]);const gap=distance(p.at(-1),q[0]);if(!matches.length&&sub===op+5&&gap>.0001&&gap<=2.001){const g=q[0].map((x,k)=>x-p.at(-1)[k]),aligned=(a,b)=>{const d=b.map((x,k)=>x-a[k]),length=Math.hypot(...d);return length>.0001&&Math.abs(d[0]*g[1]-d[1]*g[0])<=.0001*length;};if(count===4||aligned(p.at(-2),p.at(-1))||aligned(q[0],q[1])){points.push(...q.map(p=>p.slice()));continue;}}if((!matches.length||matches.length===1&&matches[0][0]===0&&matches[0][1]===0)&&[2,3].includes(count)&&sub===op+5&&v.getUint16(20,true)===65535&&v.getUint16(22,true)===65535&&v.getUint16(24,true)===0&&v.getUint16(26,true)===0&&p.length>2&&q.length>2){points=joinAnchoredCrossingPaths(p,q);continue;}if(!matches.length&&count===2&&sub===op+5&&gap>1){points=joinOverlappingStraightPrefix(p,q);continue;}if(matches.length)ensure(matches.length===1&&matches[0][0]===p.length-1&&matches[0][1]===0,'Nonunique or conflicting join orientation');else ensure(count===2&&sub===op+5&&v.getUint16(24,true)===65535&&gap<=1,'Nonunique or missing shared join endpoint');points.push(...(gap<.0001?q.slice(1):q).map(p=>p.slice()));}
 ensure(points.length<=8192,'Joined geometry limit');
 return {removedIds:ids,object:{id,record,points,geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-join-v1',points:points.map(p=>p.slice())},operation:'join-paths',dependencies:ids}};
}





