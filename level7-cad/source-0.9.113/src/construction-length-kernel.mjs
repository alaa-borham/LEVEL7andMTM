import{constructionPoints}from'./parallel-path-kernel.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);};
export function canChangeConstructionLength(o){return o?.geometryKind==='sampled-curve'&&['qq-two-relative-end-v1','qq-two-auxiliary-v1','construction-join-v1','construction-length-v1'].includes(o.directionPolyline?.family)&&Math.hypot(...o.points[0].map((n,k)=>n-o.points.at(-1)[k]))>1e-5;}
export function constructionLength(points){return points.slice(1).reduce((n,p,i)=>n+Math.hypot(...p.map((x,k)=>x-points[i][k])),0);}
/** Native length changes act on construction segments, not dense display samples. */
export function changeConstructionLength(source,delta,fromStart,record,dependencies=[]){
 need(canChangeConstructionLength(source)&&[.0001,.08].includes(source.samplingToleranceMm)&&typeof fromStart==='boolean'&&Number.isFinite(delta)&&Math.abs(delta)<=10000,'Unsupported curve length change');
 let p=constructionPoints(source).map(q=>q.slice());need(p.length>=3&&p.length<=8192&&p.every(q=>q.length===2&&q.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)),'Unsupported construction path');if(!fromStart)p.reverse();const total=constructionLength(p);need(total+delta>1e-5&&total+delta<=1e6,'Curve length must stay positive');
 if(delta>=0){const d=p[0].map((x,k)=>x-p[1][k]),n=Math.hypot(...d);need(n>1e-7,'Degenerate terminal segment');p[0]=p[0].map((x,k)=>Math.fround(x+delta*d[k]/n));}
 else{let remaining=-delta;while(p.length>1){const n=Math.hypot(...p[1].map((x,k)=>x-p[0][k]));need(n>1e-7,'Degenerate construction segment');if(remaining<n-1e-7){p[0]=p[0].map((x,k)=>Math.fround(x+remaining*(p[1][k]-x)/n));remaining=0;break;}remaining-=n;p.shift();if(remaining<=1e-7){remaining=0;break;}}need(remaining===0&&p.length>=3,'Shortening to fewer than three construction points is not supported');}
 if(!fromStart)p.reverse();need(p.every(q=>q.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)),'Unbounded curve length result');return{...source,points:p.map(q=>q.slice()),lastModifiedRecord:record,operation:fromStart?'extend-curve-start':'extend-curve-end',dependencies:[...new Set([...(source.dependencies??[]),...dependencies])],samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'construction-length-v1',points:p}};
}

