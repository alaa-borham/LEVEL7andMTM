/** QQ construction segments, computed from spline supports, never cache data.
 * Bounded one-natural-end and two-relative-end families. Native comparison is tolerance based;
 * this is not a native geometry writer or an exact native-polyline claim. */
import {constructionPoints}from'./parallel-path-kernel.mjs';
import {spline} from './natural-parametric-spline.mjs';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const distance=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
function deviation(p,a,b){const v=b.map((x,k)=>x-a[k]),n=v.reduce((s,x)=>s+x*x,0);ensure(n>1e-14,'Degenerate construction segment');const t=p.reduce((s,x,k)=>s+(x-a[k])*v[k],0)/n;return Math.hypot(...p.map((x,k)=>x-a[k]-t*v[k]));}
export function sampleNaturalQQSegments(supports,a,b,{truncateAuxiliaryGrid=false,truncateFixedDirections=false}={}){
 ensure([3,4,5,6].includes(supports.length),'Unsupported direction spline family');const c=spline(supports),total=c.h.reduce((a,b)=>a+b,0),count=Math.min(398,((truncateAuxiliaryGrid&&supports.length===5||truncateFixedDirections&&supports.length===4)?Math.floor(total/2):Math.round(total/2))-1);ensure(count>=2,'Direction curve too short');
 const at=t=>{for(let i=0;i<c.h.length;i++){if(t<=c.h[i]+1e-5)return c.at(i,Math.max(0,Math.min(1,t/c.h[i]))).map(Math.fround);t-=c.h[i];}throw Error('Invalid direction sampling interval');};
 let t=0;const dt=Math.fround(total/count),grid=Array.from({length:count+1},(_,i)=>{const p=at(i===count?total:t);t=Math.fround(t+dt);return p;}),rows=[grid[0]];
 for(let j=0;j<count;){let step=1;while(j+step<count&&deviation(grid[j+step],grid[j],grid[Math.min(count,j+2*step)])<.08)step*=2;j=Math.min(count,j+step);rows.push(grid[j]);}
 if(distance(a,rows[0])>1e-7)rows.unshift([...a]);if(distance(b,rows.at(-1))>1e-7)rows.push([...b]);return rows;
}
export function directionAtFraction(points,fraction){
 ensure(Array.isArray(points)&&points.length>=2&&points.length<=401&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)),'Invalid direction geometry');
 ensure(Number.isFinite(fraction)&&fraction>=0&&fraction<=1,'Invalid direction fraction');const lengths=points.slice(1).map((p,i)=>distance(p,points[i]));ensure(lengths.every(n=>n>1e-7),'Degenerate direction segment');let left=lengths.reduce((s,n)=>s+n,0)*fraction,index=0;
 while(index<lengths.length-1&&left>lengths[index])left-=lengths[index++];const a=points[index],b=points[index+1];return Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
}
/** Three-anchor natural-start QQ curves restart the construction grid at the
 * middle anchor. Sampling the whole spline as one span changes distance picks.
 * Long spans outside the verified grid range remain unsupported. */
export function sampleThreeAnchorNaturalStart(supports,a,b){
 ensure(supports?.length===4,'Unsupported three-anchor construction supports');return sampleThreeAnchorQQSegments(supports,a,supports[1],b,b);
}
export function sampleThreeAnchorQQSegments(supports,a,m,trim,b,{cumulativeGrid=false}={}){
 ensure(Array.isArray(supports)&&supports.length>=3&&supports.length<=7,'Unsupported QQ construction supports');
 const c=spline(supports),middle=c.points.map((p,i)=>distance(p,m)<1e-7?i:-1).filter(i=>i>=0);ensure(middle.length===1&&middle[0]>0&&middle[0]<c.points.length-1,'Ambiguous middle QQ anchor');
 const boundaries=[0,c.h.slice(0,middle[0]).reduce((s,h)=>s+h,0),c.h.reduce((s,h)=>s+h,0)],rows=[];
 const counts=boundaries.slice(1).map((b,i)=>(cumulativeGrid?Math.floor(b/2)-Math.floor(boundaries[i]/2):Math.floor((b-boundaries[i])/2))-1);if(counts.some(n=>n<2||n>398))return null;
 const at=t=>{for(let i=0;i<c.h.length;i++){if(t<=c.h[i]+1e-5)return c.at(i,Math.max(0,Math.min(1,t/c.h[i]))).map(Math.fround);t-=c.h[i];}throw Error('Invalid three-anchor sampling interval');};
 for(let span=0;span<2;span++){
  const length=boundaries[span+1]-boundaries[span],count=counts[span];
  ensure(count>=2&&count<=398,'Three-anchor construction span outside verified sampling range');
  let t=0;const dt=Math.fround(length/count),grid=Array.from({length:count+1},(_,i)=>{const p=at(boundaries[span]+(i===count?length:t));t=Math.fround(t+dt);return p;}),points=[grid[0]];
  // Retain the largest even grid step whose entire interior stays within the
  // native construction tolerance. A midpoint-only test skips S-bend extrema.
  if(cumulativeGrid){for(let j=0;j<count;){let next=j+1;for(let k=j+2;k<=count;k+=2){if(grid.slice(j+1,k).some(p=>deviation(p,grid[j],grid[k])>=.08))break;next=k;}j=next;points.push(grid[j]);}}else{for(let j=0;j<count;){let step=1;while(j+step<count&&deviation(grid[j+step],grid[j],grid[Math.min(count,j+2*step)])<.08)step*=2;j=Math.min(count,j+step);points.push(grid[j]);}}
  rows.push(...(span?points.slice(1):points));
 }
 if(distance(a,rows[0])>1e-7)rows.unshift([...a]);if(distance(trim,rows.at(-1))>1e-7)rows.push([...trim]);if(distance(b,rows.at(-1))>1e-7)rows.push([...b]);return rows;
}
/** Arc-distance selection on computed construction segments. The direction flag
 * identifies the chosen end; displacement follows the object's forward direction. */
export function pointOnConstructionCurve(points,distanceMm,fromStart,displacement=0){
 ensure(Array.isArray(points)&&points.length>=2&&points.length<=801&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6)),'Invalid construction curve');
 ensure(typeof fromStart==='boolean'&&Number.isFinite(distanceMm)&&distanceMm>=0&&Number.isFinite(displacement)&&Math.abs(displacement)<=100,'Invalid construction distance');
 const lengths=points.slice(1).map((p,i)=>distance(p,points[i]));ensure(lengths.every(n=>n>1e-7),'Degenerate construction curve segment');
 const total=lengths.reduce((s,n)=>s+n,0);let left=(fromStart?distanceMm:total-distanceMm)+displacement;
 ensure(left>=0&&left<=total,'Construction distance outside curve');let i=0;while(i<lengths.length-1&&left>lengths[i])left-=lengths[i++];
 return points[i].map((x,k)=>Math.fround(x+(points[i+1][k]-x)*left/lengths[i]));
}
export function resolveQQDirection(bytes,objects,ordinal){
 ensure(bytes instanceof Uint8Array&&bytes.length===80,'Invalid QQ direction reference');const q=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 ensure(q.getUint32(12,true)===ordinal&&q.getUint32(16,true)===2&&q.getUint32(20,true)===0&&q.getUint16(24,true)===5&&[512,767].includes(q.getUint16(26,true))&&q.getUint32(28,true)===0&&q.getUint16(34,true)===0&&bytes.subarray(40).every(x=>x===0),'Unsupported QQ curve direction selector');
 const sourceId=q.getUint16(32,true),source=objects.find(o=>o.id===sourceId);ensure(source,'Missing QQ direction object');
 const points=!source.geometryKind&&source.points.length===2?source.points:['qq-one-natural-end-v1','qq-two-relative-end-v1','qq-two-auxiliary-v1','qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1','construction-join-v1','construction-cut-v1'].includes(source.directionPolyline?.family)?constructionPoints(source):null;ensure(points,'Unsupported curve direction source');
 return {sourceId,angle:directionAtFraction(points,q.getUint16(26,true)===512?1-q.getFloat32(36,true):q.getFloat32(36,true))+(q.getUint16(26,true)===512?180:0)};
}
