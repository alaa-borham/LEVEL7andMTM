import {constructionPoints}from'./parallel-path-kernel.mjs';
/** Bounded QQ two-endpoint construction, independently compared with Grafis.
 * Only straight-line endpoint picks and unbound relative tangent angles are
 * decoded. Cached coordinates are not inputs. The sampled curve is a historical
 * preview, not Grafis's native polyline representation or a native save format.
 */
import {spline} from './natural-parametric-spline.mjs';
import {sampleNaturalQQSegments,resolveQQDirection,pointOnConstructionCurve} from './curve-direction-kernel.mjs';
import {pointAtDistance} from './linear-history-kernel.mjs';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const finite=n=>{ensure(Number.isFinite(n)&&Math.abs(n)<=1e6,'Invalid curve coordinate');return n;};
function entries(bytes){
 ensure(bytes instanceof Uint8Array,'Missing curve data');
 const rows=[],v=view(bytes);let at=0;
 while(at<bytes.length){
  ensure(at+16<=bytes.length,'Truncated curve entry');const size=v.getUint32(at,true)*8;
  ensure(size>=16&&at+size<=bytes.length,'Invalid curve entry span');
  rows.push(bytes.subarray(at,at+size));at+=size;ensure(rows.length<=10000,'Curve entry count limit');
 }return rows;
}

export function constructionCurveScale(path,start,end){const total=path.slice(1).reduce((s,p,i)=>s+Math.hypot(...p.map((x,k)=>x-path[i][k])),0),mid=pointOnConstructionCurve(path,total/2,true),radius=(Math.hypot(...start.map((x,k)=>x-mid[k]))+Math.hypot(...end.map((x,k)=>x-mid[k])))/2;return Math.max(1,Math.min(10,12.5-.5*radius));}
export function solveTwoEndpointCurve(a,b,angles,{startStraight=0,endStraight=0,smallScale=true,truncateSmallScaleGrid=false}={}){
 ensure([a,b,angles].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'Invalid curve inputs');
 a.forEach(finite);b.forEach(finite);
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
 ensure(length>=20&&length<=10000&&angles.every(n=>Math.abs(n)<=89),'Curve outside bounded calculation range');
 const theta=Math.atan2(b[1]-a[1],b[0]-a[0]);
 const unit=angle=>[Math.cos(theta+angle*Math.PI/180),Math.sin(theta+angle*Math.PI/180)];
 const u=unit(angles[0]),v=unit(angles[1]);
 ensure([startStraight,endStraight].every(n=>Number.isFinite(n)&&n>=0&&n<=100)&&startStraight+endStraight<length,'Invalid straight curve extensions');const originalStart=a.slice(),originalEnd=b.slice();if(startStraight)a=a.map((x,k)=>Math.fround(x+startStraight*u[k]));if(endStraight)b=b.map((x,k)=>Math.fround(x-endStraight*v[k]));const trimStart=a.slice(),trimEnd=b.slice();
 // Sequential float32 support construction and cumulative chord parameters
 // matter: independently rounding chord lengths gives a measurable mismatch.
 const A=a.map((n,k)=>Math.fround(n+2.5*u[k])),B=b.map((n,k)=>Math.fround(n-2.5*v[k]));
 const supports=[A.map((n,k)=>Math.fround(n-.1*u[k])),A,B.map((n,k)=>Math.fround(n-.1*v[k])),B];
 const h=supports.slice(1).map((p,i)=>Math.hypot(...p.map((n,k)=>n-supports[i][k])));
 let total=0;for(let i=0;i<h.length;i++){const next=Math.fround(total+h[i]);h[i]=Math.fround(next-total);total=next;}
 ensure(h.every(n=>Number.isFinite(n)&&n>0),'Degenerate curve support interval');
 const L=h[1],q=2*(h[0]+L),w=2*(h[2]+L);
 const middle=[0,1].map(k=>{
  const r=6*((supports[2][k]-supports[1][k])/L-(supports[1][k]-supports[0][k])/h[0]);
  const s=6*((supports[3][k]-supports[2][k])/h[2]-(supports[2][k]-supports[1][k])/L);
  return [(r*w-L*s)/(q*w-L*L),(q*s-L*r)/(q*w-L*L)];
 });
 const second=[[0,0],middle.map(m=>m[0]),middle.map(m=>m[1]),[0,0]];
 const at=(t,segment=1)=>{
  ensure(Number.isFinite(t)&&t>=0&&t<=1&&Number.isInteger(segment)&&segment>=0&&segment<3,'Invalid curve position');
  return supports[segment].map((n,k)=>finite((1-t)*n+t*supports[segment+1][k]+(((1-t)**3-(1-t))*second[segment][k]+(t**3-t)*second[segment+1][k])*h[segment]**2/6));
 };
 // A second-derivative bound limits chord deviation to 0.0001 mm. This
 // sampling is for preview only; no length/offset/cut kernel consumes it.
 const points=[...(startStraight?[originalStart]:[]),[...a],[...supports[0]]];
 for(let segment=0;segment<3;segment++){
  const curvature=Math.max(Math.hypot(...second[segment]),Math.hypot(...second[segment+1]));
  const count=Math.max(1,Math.ceil(Math.sqrt(curvature*h[segment]**2/(8*.0001))));
  ensure(points.length+count<=4096,'Curve sampling limit');
  for(let i=1;i<=count;i++)points.push(at(i/count,segment));
 }points.push([...b]);if(endStraight)points.push(originalEnd);
 if(smallScale){const path=sampleNaturalQQSegments(supports,trimStart,trimEnd,{truncateFixedDirections:truncateSmallScaleGrid}),scale=constructionCurveScale(path,trimStart,trimEnd);if(scale>1.000001){ensure(startStraight===0&&endStraight===0,'Short curves with straight extensions require separate verification');const origin=originalStart,up=p=>p.map((x,k)=>Math.fround(origin[k]+(x-origin[k])*scale)),down=p=>p.map((x,k)=>Math.fround(origin[k]+(x-origin[k])/scale)),model=solveTwoEndpointCurve(up(originalStart),up(originalEnd),angles,{smallScale:false});return{...model,points:model.points.map(down),supports:model.supports.map(down),trimStart:down(model.trimStart),trimEnd:down(model.trimEnd),secondDerivatives:model.secondDerivatives.map(p=>p.map(x=>x*scale)),interval:model.interval/scale,at:(t,i=1)=>down(model.at(t,i)),constructionPoints:sampleNaturalQQSegments(model.supports,model.trimStart,model.trimEnd,{truncateFixedDirections:truncateSmallScaleGrid}).map(down),smallScaleFactor:scale};}}
 return {points,supports,secondDerivatives:middle,interval:L,at,trimStart,trimEnd};
}

export function solveNaturalEndCurve(a,b,angles,directions){
 ensure([a,b,angles].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'Invalid natural-end inputs');a.forEach(finite);b.forEach(finite);
 ensure(directions.length===2&&directions.filter(d=>d===0).length===1&&directions.every(d=>d===0||d===500),'Unsupported natural-end arrangement');
 ensure(angles.every((x,i)=>Math.abs(x)<=60&&(directions[i]!==0||x===0)),'Invalid natural-end angles');const length=Math.hypot(b[0]-a[0],b[1]-a[1]);ensure(length>=20&&length<=10000,'Natural-end curve outside bounded range');
 const theta=Math.atan2(b[1]-a[1],b[0]-a[0]),unit=i=>[Math.cos(theta+angles[i]*Math.PI/180),Math.sin(theta+angles[i]*Math.PI/180)],add=(p,v,n)=>p.map((x,k)=>Math.fround(finite(x+n*v[k]))),u=unit(0),v=unit(1),A=add(a,u,2.5),B=add(b,v,-2.5),supports=[...(directions[0]===0?[a]:[add(A,u,-.1),A]),...(directions[1]===0?[b]:[add(B,v,-.1),B])],curve=spline(supports),points=[a,curve.points[0]];
 for(let i=0;i<curve.h.length;i++){const curvature=Math.max(Math.hypot(...curve.second[i]),Math.hypot(...curve.second[i+1])),count=Math.max(1,Math.ceil(Math.sqrt(curvature*curve.h[i]**2/(8*.0001))));ensure(points.length+count<=8192,'Natural-end sampling limit');for(let j=1;j<=count;j++)points.push(curve.at(i,j/count));}points.push(b);return {points,supports};
}
export function replayTwoEndpointQQCurve({historyRecord,record,parameters,references,objects,zValues=[],includeControls=false}){
 ensure(historyRecord instanceof Uint8Array&&historyRecord.length===32,'Invalid curve history record');
 const h=view(historyRecord),name=String.fromCharCode(...historyRecord.subarray(12)).replace(/\0+$/,'');
 ensure(h.getUint16(0,true)===101&&h.getUint16(2,true)===104&&name==='GraPrg_GK_QQ_c001_04','Unsupported curve construction');
 const defaults=new Map(),overrides=[],seen=new Set();let bindingSeen=false;
 for(const bytes of entries(parameters)){
  ensure(bytes.length>=24,'Truncated curve parameter');const v=view(bytes),index=v.getInt16(4,true),key=String.fromCharCode(...bytes.subarray(6,14));
  ensure(!seen.has(index+':'+key),'Duplicate curve parameter');seen.add(index+':'+key);
  if(index===-12){
   ensure(!bindingSeen,'Duplicate curve bindings');bindingSeen=true;const n=v.getUint32(20,true);
   ensure(n%8===0&&24+n<=bytes.length,'Invalid curve bindings');
   for(let at=24;at<24+n;at+=8)ensure(v.getUint32(at+4,true)===0,'Bound curve options are not decoded');
  }else if(index>=0){const value=finite(v.getFloat32(16,true));if(key==='        ')defaults.set(index,value);else overrides.push({index,value});}
  else ensure([-5,-4,-3,-2,-1].includes(index),'Unknown curve metadata');
 }
 ensure(bindingSeen,'Missing curve binding declaration');
 // Size-specific changes require their own interpolation decoder. Identical
 // stored rows are safe for the tested default calculation; differences stop.
 for(const row of overrides){const slot=Math.floor((row.index-28)/15),offset=(row.index-28)%15,displayMetadata=slot>=0&&slot<2&&[8,9,10].includes(offset);ensure(displayMetadata||defaults.get(row.index)===row.value,'Size-dependent curve parameters are not decoded');}
 const modes=new Map([[0,2],[2,1],[3,2],[4,2],[5,1],[28,1],[29,1],[43,1],[44,2]]);
 for(const[index,value]of modes)ensure(defaults.get(index)===value,'Unsupported QQ endpoint mode '+index);
 const directions=[defaults.get(30),defaults.get(45)],natural=directions.includes(0),referenced=directions[0]===500&&directions[1]===1,absoluteStart=[1,2].includes(directions[0])&&directions[1]===500;ensure(absoluteStart||referenced||directions.every(d=>d===0||d===500)&&directions.filter(d=>d===0).length<=1,'Unsupported QQ endpoint direction');
 const varying=new Set([13,14,20,21,30,45,35,50,36,37,38,51,52,53,...(absoluteStart?[31]:[]),...((natural||referenced||absoluteStart)?[32,33,47,48]:[])]);
 ensure([defaults.get(13),defaults.get(20)].every(n=>Number.isFinite(n)&&n>=0&&n<=100)&&[defaults.get(14),defaults.get(21)].every(n=>Number.isFinite(n)&&Math.abs(n)<=100),'Invalid QQ straight-extension options');ensure(!natural||defaults.get(13)===0&&defaults.get(20)===0,'Natural endpoint straight extensions are unsupported');
 if(natural||referenced||absoluteStart)for(const i of [32,33,47,48])ensure(Math.abs(defaults.get(i))<=100,'Endpoint displacement outside verified range');
 ensure(defaults.has(35)&&defaults.has(50),'Missing relative tangent angle');
 for(const[index,value]of defaults)if(!modes.has(index)&&!varying.has(index))ensure(value===0,'Unsupported QQ option '+index);
 const relevant=entries(references).filter(b=>{const v=view(b);return v.getUint16(6,true)===1&&v.getUint16(10,true)===record;});
 const displacedPoint=absoluteStart&&defaults.get(31)===1;ensure(!absoluteStart||[0,1].includes(defaults.get(31)),'Unsupported absolute-start displacement mode');
 ensure(relevant.length===(referenced||absoluteStart?4:3)+(displacedPoint?1:0),'Unsupported QQ reference count');
 // An explicitly stored displacement line may be inactive. Its pick position
 // is historical metadata, not a new endpoint. Nonzero displacement is not yet admitted.
 if(displacedPoint){const rows=relevant.filter(b=>view(b).getUint16(8,true)===3);ensure(rows.length===1,'Missing QQ displacement line');const p=view(rows[0]),source=objects.find(o=>o.id===p.getUint16(18,true));ensure(p.byteLength===40&&p.getUint32(12,true)===51&&p.getUint16(16,true)===0&&p.getUint32(20,true)===2&&source&&!source.geometryKind&&source.points.length===2&&defaults.get(33)===0,'Unsupported QQ displacement line');for(const at of [24,28,32,36])finite(p.getFloat32(at,true));}
 const created=relevant.filter(b=>view(b).getUint16(8,true)===5),picks=relevant.filter(b=>view(b).getUint16(8,true)===6);
 ensure(created.length===1&&picks.length===2,'Missing QQ endpoint references');
 const creation=view(created[0]);ensure(creation.byteLength===24&&creation.getUint32(12,true)===101&&creation.getUint32(20,true)===0,'Unknown QQ creation header');
 const id=creation.getUint32(16,true);ensure(id>0&&!objects.some(o=>o.id===id),'Duplicate QQ result');
 const endpoints=new Map(),dependencies=[];
 for(const bytes of picks){
  const p=view(bytes);ensure(p.byteLength===40&&p.getUint32(20,true)===0&&p.getUint32(32,true)===0&&p.getUint32(36,true)===0,'Unsupported QQ endpoint selector');
  const ordinal=p.getUint32(12,true),mode=p.getUint16(16,true),flags=p.getUint16(18,true),objectId=p.getUint16(24,true),fraction=p.getFloat32(28,true),object=objects.find(o=>o.id===objectId);
  ensure([1,2].includes(ordinal)&&!endpoints.has(ordinal)&&(object||mode===7&&flags===0),'Missing QQ endpoint object');let point,moveApplied=false;
  if(mode===7&&flags===0){ensure(defaults.get(ordinal===1?33:48)===0,'Numeric QQ endpoint displacement unsupported');point=[finite(p.getFloat32(24,true)),finite(p.getFloat32(28,true))];}
  else if((absoluteStart&&ordinal===1||directions.every(d=>d===500))&&mode===1&&flags===256){ensure(!object.geometryKind&&object.points.length===1&&p.getUint16(26,true)===1&&p.getUint32(28,true)===0&&defaults.get(ordinal===1?33:48)===0,'Unsupported QQ point endpoint');point=object.points[0].slice();}
  else if(mode===2&&flags===512){ensure((object.points.length===2&&!object.geometryKind||object.geometryKind==="sampled-curve"&&[.0001,.08].includes(object.samplingToleranceMm)&&object.directionPolyline)&&p.getUint16(26,true)===0&&Number.isFinite(fraction)&&fraction>=0&&fraction<=1,'Unsupported endpoint fraction');if(fraction===0||fraction===1)point=(fraction===0?object.points[0]:object.points.at(-1)).slice();else{const points=object.geometryKind?constructionPoints(object):object.points,total=points.slice(1).reduce((sum,q,i)=>sum+Math.hypot(...q.map((x,k)=>x-points[i][k])),0);point=pointOnConstructionCurve(points,fraction*total,true);}}
  else if(mode===4&&[512,767].includes(flags)){const code=p.getUint16(26,true),z=zValues.find(z=>z.index===code-200),auxiliaryLiteral=code===0&&object.directionPolyline?.family==='qq-two-auxiliary-v1'&&directions.every(d=>d===500);ensure(auxiliaryLiteral||code>200&&z&&z.recordStep<=record,'Unresolved natural-end distance');const amount=finite(auxiliaryLiteral?p.getFloat32(28,true):z.value);if(object.geometryKind){ensure(auxiliaryLiteral||absoluteStart&&ordinal===2&&object.directionPolyline?.family==='qq-three-anchor-natural-end-v1'||directions.every(d=>d===500),'Unsupported QQ distance curve');point=pointOnConstructionCurve(constructionPoints(object),amount,flags===767,defaults.get(ordinal===1?33:48));moveApplied=true;}else{ensure(object.points.length===2,'Missing QQ distance line');point=pointAtDistance(object.points,amount,flags===767);}if(z)dependencies.push('Z'+z.index);}
  else throw Error('Unsupported QQ endpoint selector');
  const move=(natural||referenced||absoluteStart)?defaults.get(ordinal===1?33:48):0;if(move!==0&&!moveApplied){ensure(!object.geometryKind&&object.points.length===2,'Unsupported QQ displacement source');const length=Math.hypot(...object.points[1].map((x,k)=>x-object.points[0][k]));ensure(length>1e-7,'Degenerate displacement source');point=point.map((x,k)=>Math.fround(finite(x+move*(object.points[1][k]-object.points[0][k])/length)));}
  endpoints.set(ordinal,point);if(mode!==7)dependencies.push(objectId);
 }
 const angles=[defaults.get(35),defaults.get(50)];
 if(absoluteStart){const rows=relevant.filter(b=>view(b).getUint16(8,true)===7);ensure(rows.length===1,'Missing QQ absolute direction');const p=view(rows[0]);ensure(p.byteLength===80&&p.getUint32(12,true)===directions[0]&&p.getUint32(16,true)===1&&rows[0].subarray(20,76).every(x=>x===0),'Unsupported QQ absolute direction');const a=endpoints.get(1),b=endpoints.get(2),theta=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;angles[0]=((finite(p.getFloat32(76,true))+angles[0]-theta+540)%360)-180;}
 if(referenced){
  const rows=relevant.filter(b=>view(b).getUint16(8,true)===7);ensure(rows.length===1,'Missing QQ direction reference');const direction=resolveQQDirection(rows[0],objects,1);
  const a=endpoints.get(1),b=endpoints.get(2),theta=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
  angles[1]=((direction.angle+angles[1]-theta+540)%360)-180;dependencies.push(direction.sourceId);
 }
 const model=natural?solveNaturalEndCurve(endpoints.get(1),endpoints.get(2),angles,directions):solveTwoEndpointCurve(endpoints.get(1),endpoints.get(2),angles,{startStraight:defaults.get(13),endStraight:defaults.get(20)}),construction=model.constructionPoints??sampleNaturalQQSegments(model.supports,model.trimStart??endpoints.get(1),model.trimEnd??endpoints.get(2));if(defaults.get(13))construction.unshift(endpoints.get(1).slice());if(defaults.get(20))construction.push(endpoints.get(2).slice());
 return {id,...(!natural&&!referenced&&!absoluteStart&&directions.every(d=>d===500)&&!defaults.get(13)&&!defaults.get(20)&&!model.smallScaleFactor?{rasterConstruction:{family:'qq-two-fixed-v1',supports:model.supports.map(p=>p.slice()),start:model.trimStart.slice(),end:model.trimEnd.slice()}}:{}),...(includeControls?{controlConstruction:{family:'two-endpoint',anchors:[endpoints.get(1).slice(),endpoints.get(2).slice()],angles:angles.map(a=>a+Math.atan2(endpoints.get(2)[1]-endpoints.get(1)[1],endpoints.get(2)[0]-endpoints.get(1)[0])*180/Math.PI),angleIndices:[35,50],helpers:[]}}:{}),points:model.points,record,dependencies,operation:'interactive-two-endpoint-curve',geometryKind:'sampled-curve',samplingToleranceMm:.0001,nativePolylineParity:false,directionPolyline:{family:natural?'qq-one-natural-end-v1':'qq-two-relative-end-v1',points:construction}};
}
