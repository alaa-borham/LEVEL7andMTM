// Bounded EK small-corner replay from construction inputs. No cached geometry.

import {spline} from './natural-parametric-spline.mjs';
import {pointOnConstructionCurve,directionAtFraction} from './curve-direction-kernel.mjs';
import {readRoundCornerPlan} from './round-corner-inputs.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const norm=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
const add=(p,u,d)=>p.map((x,k)=>Math.fround(x+u[k]*d));
const unit=t=>[Math.cos(t),Math.sin(t)];
function curve(anchors,angles){
 need(anchors.length>=2&&anchors.length<=5&&anchors.flat().every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6),'Invalid corner supports');
 const a=anchors[0],b=anchors.at(-1),u=unit(angles[0]),v=unit(angles[1]),A=add(a,u,2.5),B=add(b,v,-2.5);
 const supports=[add(A,u,-.1),A,...anchors.slice(1,-1),add(B,v,-.1),B];
 const c=spline(supports),boundaries=[0];let sum=0;
 for(let i=0;i<c.h.length;i++){sum+=c.h[i];if(i>=1&&i<c.h.length-2)boundaries.push(sum);}boundaries.push(sum);
 const at=t=>{for(let i=0;i<c.h.length;i++){if(t<=c.h[i]+1e-5)return c.at(i,Math.min(1,Math.max(0,t/c.h[i]))).map(Math.fround);t-=c.h[i];}throw Error('sampling');};
 const minimum=anchors.length===2?9:anchors.length===3?5:1;
 const rows=[a];for(let span=0;span<boundaries.length-1;span++){const len=boundaries[span+1]-boundaries[span],n=Math.max(minimum,(anchors.length===3?Math.ceil(len/2):Math.floor(len/2))-1);need(n<=398,'Corner sampling bound');const grid=[];let t=0;const dt=Math.fround(len/n);for(let j=0;j<=n;j++){grid.push(at(boundaries[span]+(j===n?len:t)));t=Math.fround(t+dt);}
 const deviation=(p,a,b)=>{const d=b.map((x,k)=>x-a[k]),t=p.reduce((s,x,k)=>s+(x-a[k])*d[k],0)/d.reduce((s,x)=>s+x*x,0);return Math.hypot(...p.map((x,k)=>x-a[k]-t*d[k]));};
 if(!span)rows.push(grid[0]);for(let j=0;j<n;){let step=1;while(j+step<n&&deviation(grid[j+step],grid[j],grid[Math.min(n,j+2*step)])<.08)step*=2;j=Math.min(n,j+step);rows.push(grid[j]);}}rows.push(b);return rows;
}
function auxiliary(points,fraction,height){const total=points.slice(1).reduce((s,p,i)=>s+norm(p,points[i]),0),p=pointOnConstructionCurve(points,total*fraction,true),angle=directionAtFraction(points,fraction)*Math.PI/180;return add(p,[Math.sin(angle),-Math.cos(angle)],height);}

export function solveSmallCorner({start,end,corner,angles,auxiliaries}){
 const zero=curve([start,end],angles),m=auxiliary(zero,auxiliaries[0].percent/100,auxiliaries[0].heightMm),middle=curve([start,m,end],angles),q1=auxiliary(middle,auxiliaries[1].percent/100,auxiliaries[1].heightMm),q3=auxiliary(middle,auxiliaries[2].percent/100,auxiliaries[2].heightMm),baseMiddle=auxiliary(zero,.5,0),r40=(norm(start,baseMiddle)+norm(end,baseMiddle))*.5,scale=Math.min(10,Math.max(1,12.5-.5*r40));
 const scalePoint=p=>p.map((x,k)=>Math.fround(corner[k]+(x-corner[k])*scale));
 const points=curve([start,q1,m,q3,end].map(scalePoint),angles).map(p=>p.map((x,k)=>Math.fround(corner[k]+(x-corner[k])/scale)));
 return {points,scale,m,q1,q3};
}
export function replayRoundCorner(args){
 const plan=readRoundCornerPlan(args),{radii,directions,auxiliaries,corner,trimPoints}=plan;
 need(radii.every(r=>r>=10&&r<=30)&&Math.abs(radii[0]-radii[1])<.0001,'Corner radius outside verified equal-trim range');
 const turn=((directions[1]-directions[0])%360+360)%360;need(turn>=20&&turn<=160,'Corner turn outside bounded left-turn range');
 need(plan.directionAdjustments.every(a=>Number.isFinite(a)&&Math.abs(a)<=15)&&auxiliaries.every((a,i)=>(i?Math.abs(a.percent-[50,25,75][i])<.0001:a.percent>=40&&a.percent<=60)&&Number.isFinite(a.heightMm)&&(i?a.heightMm===0:a.heightMm>=0&&a.heightMm<=radii[0]/5)),'Unsupported corner shape options');
 need([0,1,2].every(i=>!args.objects.some(o=>o.id===plan.resultPointId+i)),'Corner output ID already exists');
 const solved=solveSmallCorner({start:trimPoints[0],end:trimPoints[1],corner,angles:directions.map((a,i)=>(a+plan.directionAdjustments[i])*Math.PI/180),auxiliaries}),points=solved.points;
 const ray=trimPoints[0].map((x,k)=>x+trimPoints[1][k]-2*corner[k]),cross=(a,b)=>a[0]*b[1]-a[1]*b[0],hits=[];
 for(let i=1;i<points.length;i++){const p=points[i-1],d=points[i].map((x,k)=>x-p[k]),a=p.map((x,k)=>x-corner[k]),den=cross(d,ray);if(Math.abs(den)<1e-12)continue;const t=-cross(a,ray)/den;if(t>=0&&t<=1){const hit=p.map((x,k)=>Math.fround(x+t*d[k]));if(!hits.some(h=>norm(h.point,hit)<.0001))hits.push({point:hit,i});}}
 need(hits.length===1,'Ambiguous corner bisector');const hit=hits[0],halves=[[...points.slice(0,hit.i),hit.point],[hit.point,...points.slice(hit.i)]],changed=[];
 const clean=p=>p.filter((x,i)=>!i||norm(x,p[i-1])>1e-7);
 for(let i=0;i<2;i++){
  const source=args.objects.find(o=>o.id===plan.sourceIds[i]),path=plan.trimmedPaths[i],keep=i===0?path.slice(0,-1):path.slice(1);
  let result=i===0?[...keep,trimPoints[0],...halves[0].slice(1)]:[...halves[1],...keep];result=clean(result);if(plan.reversed[i])result.reverse();
  need(result.length>=3&&result.length<=8192,'Invalid corner output path');changed.push({...source,record:source.record??args.record,lastModifiedRecord:args.record,operation:'round-corner',points:result.map(p=>p.slice()),geometryKind:'sampled-curve',samplingToleranceMm:.08,nativePolylineParity:false,directionPolyline:{family:'round-corner-v1',points:result.map(p=>p.slice())},dependencies:[...new Set([...(source.dependencies??[]),...plan.dependencies])]});
 }
 return [...changed,...[corner,...trimPoints].map((p,i)=>({id:plan.resultPointId+i,record:args.record,operation:'round-corner-point',points:[p.map(Math.fround)],dependencies:[...plan.dependencies]}))];
}


