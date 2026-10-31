import {constructionPoints as sourceConstructionPoints} from './parallel-path-kernel.mjs';
/** Bounded three-base-anchor QQ replay, with optional relative auxiliary points.
 * Native replay comparisons cover the admitted selector family and causal Z
 * changes. This is historical preview geometry, not native polyline parity.
 * No stored coordinates, cached curves or captured outputs enter calculation.
 */
import {resolveQQDirection,sampleThreeAnchorQQSegments,pointOnConstructionCurve} from './curve-direction-kernel.mjs';
import {spline} from './natural-parametric-spline.mjs';
import {pointAtDistance} from './linear-history-kernel.mjs';
import {replayTwoEndpointQQCurve} from './interactive-curve-kernel.mjs';
import {replayAuxiliaryEndpointQQCurve} from './auxiliary-endpoint-curve-kernel.mjs';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const finite=n=>{ensure(Number.isFinite(n)&&Math.abs(n)<=1e6,'Invalid QQ parameter');return n;};
const distance=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
const add=(p,v,n)=>p.map((x,k)=>Math.fround(finite(x+n*v[k])));
function entries(bytes){
 ensure(bytes instanceof Uint8Array,'Missing QQ block');const rows=[];let at=0;
 while(at<bytes.length){ensure(at+16<=bytes.length,'Truncated QQ entry');const n=view(bytes).getUint32(at,true)*8;ensure(n>=16&&at+n<=bytes.length,'Invalid QQ entry span');rows.push(bytes.subarray(at,at+n));at+=n;ensure(rows.length<=10000,'QQ entry limit');}return rows;
}
function deviation(p,a,b){const v=b.map((x,k)=>x-a[k]),n=v.reduce((s,x)=>s+x*x,0);ensure(n>1e-14,'Degenerate zero-curve chord');const t=p.reduce((s,x,k)=>s+(x-a[k])*v[k],0)/n;return Math.hypot(...p.map((x,k)=>x-a[k]-t*v[k]));}
function zeroSpans(curve,a,trim){
 const boundaries=[0,curve.h[0]+curve.h[1],curve.h.reduce((s,h)=>s+h,0)];
 const at=t=>{let start=0;for(let i=0;i<curve.h.length;i++){if(t<=start+curve.h[i]+1e-7)return curve.at(i,Math.max(0,Math.min(1,(t-start)/curve.h[i]))).map(Math.fround);start+=curve.h[i];}throw Error('Invalid zero-curve position');};
 return [0,1].map(span=>{
  const length=boundaries[span+1]-boundaries[span],count=Math.floor(length/2)-1;
  ensure(count>=2&&count<=2048,'Zero curve outside bounded sampling range');
  const grid=Array.from({length:count+1},(_,j)=>at(boundaries[span]+length*j/count)),rows=[grid[0]];
  for(let j=0;j<count;){let step=1;while(j+step*2<=count&&deviation(grid[j+step],grid[j],grid[j+step*2])<.08)step*=2;j+=step;rows.push(grid[j]);}
  if(span===0)rows.unshift(a.slice());else rows.push(trim.slice());return rows;
 });
}
function auxiliary(rows,relativeLength,relativeHeight){
 ensure(relativeLength>0&&relativeLength<100&&Math.abs(relativeHeight)<=20,'Auxiliary point outside bounded range');
 const lengths=[0];for(let i=1;i<rows.length;i++)lengths.push(lengths.at(-1)+distance(rows[i-1],rows[i]));
 const length=lengths.at(-1),goal=length*relativeLength/100,j=lengths.findIndex(n=>n>=goal),segment=lengths[j]-lengths[j-1];ensure(j>0&&segment>1e-7,'Degenerate auxiliary segment');
 const fraction=(goal-lengths[j-1])/segment,v=rows[j].map((x,k)=>x-rows[j-1][k]),normal=[v[1]/segment,-v[0]/segment],offset=relativeHeight*length/100;
 return rows[j].map((x,k)=>Math.fround(finite(rows[j-1][k]+fraction*(x-rows[j-1][k])+normal[k]*offset)));
}
export function solveThreeAnchorCurve({anchors,startAngle,endAngle,endStraight,auxiliaries=[],startDirection='absolute',endDirection='relative'}){
 ensure(anchors?.length===3&&anchors.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)),'Invalid three-anchor inputs');
 ensure(Number.isFinite(startAngle)&&Math.abs(startAngle)<=360&&Number.isFinite(endAngle)&&Math.abs(endAngle)<=60&&Number.isFinite(endStraight)&&endStraight>=0&&endStraight<=100,'Unsupported three-anchor direction/straight segment');
 ensure(auxiliaries.length<=2&&new Set(auxiliaries.map(p=>p.span)).size===auxiliaries.length&&auxiliaries.every(p=>[0,1].includes(p.span)),'Unsupported auxiliary arrangement');
 ensure(['absolute','relative','natural'].includes(startDirection),'Unsupported start direction');
 ensure(['absolute','relative'].includes(startDirection)||auxiliaries.length===0,'Auxiliaries with natural start direction are not verified');
 ensure(startDirection!=='natural'||startAngle===0,'Natural direction cannot carry an angle');
 ensure(['relative','natural'].includes(endDirection),'Unsupported end direction');
 ensure(endDirection!=='natural'||endAngle===0&&endStraight===0&&auxiliaries.length===0,'Natural end cannot carry angle, straight segment or auxiliary points');
 const [a,m,b]=anchors.map(p=>p.slice());ensure(distance(a,m)>=20&&distance(m,b)>=20&&distance(a,b)>=20,'Degenerate three-anchor geometry');
 const theta=Math.atan2(b[1]-a[1],b[0]-a[0]),unit=t=>[Math.cos(t),Math.sin(t)],u=unit(startAngle*Math.PI/180+(startDirection==='relative'?theta:0)),v=unit(theta+endAngle*Math.PI/180);
 const A=add(a,u,2.5),trim=add(b,v,-endStraight),B=add(trim,v,-2.5),base=[add(A,u,-.1),A,m,add(B,v,-.1),B],zero=spline(base),spans=auxiliaries.length?zeroSpans(zero,a,trim):null,supports=[base[0],base[1]];
 for(let span=0;span<2;span++){const aux=auxiliaries.find(p=>p.span===span);if(aux)supports.push(auxiliary(spans[span],aux.relativeLength,aux.relativeHeight));if(span===0)supports.push(m);}
 supports.push(...(endDirection==='natural'?[b]:[base[3],base[4]]));if(startDirection==='natural')supports.splice(0,2,a);const curve=spline(supports),points=[a,curve.points[0]];
 for(let segment=0;segment<curve.h.length;segment++){
  const curvature=Math.max(Math.hypot(...curve.second[segment]),Math.hypot(...curve.second[segment+1])),count=Math.max(1,Math.ceil(Math.sqrt(curvature*curve.h[segment]**2/(8*.0001))));
  ensure(points.length+count<=8192,'Three-anchor sampling limit');for(let i=1;i<=count;i++)points.push(curve.at(segment,i/count));
 }points.push(trim);if(endStraight)points.push(b);return{points,supports};
}
export function replayQQCurve(args){
 const rows=entries(args.parameters),count=rows.find(b=>b.length>=24&&view(b).getInt16(4,true)===3&&b.subarray(6,14).every(x=>x===32));
 if(count&&view(count).getFloat32(16,true)===2)return replayTwoEndpointQQCurve(args);
 const bases=rows.find(b=>b.length>=24&&view(b).getInt16(4,true)===4&&b.subarray(6,14).every(x=>x===32));if(bases&&view(bases).getFloat32(16,true)===2)return replayAuxiliaryEndpointQQCurve(args);
 return replayThreeAnchorQQCurve(args);
}
export function replayThreeAnchorQQCurve({historyRecord,record,parameters,references,objects,zValues=[],includeControls=false}){
 ensure(historyRecord instanceof Uint8Array&&historyRecord.length===32,'Invalid QQ history record');const h=view(historyRecord);
 ensure(h.getUint16(0,true)===101&&h.getUint16(2,true)===104&&String.fromCharCode(...historyRecord.subarray(12)).replace(/\0+$/,'')==='GraPrg_GK_QQ_c001_04','Unsupported QQ construction');
 const defaults=new Map(),overrides=[],seen=new Set();let bindings=false;
 for(const bytes of entries(parameters)){
  ensure(bytes.length>=24,'Truncated QQ parameter');const v=view(bytes),index=v.getInt16(4,true),key=String.fromCharCode(...bytes.subarray(6,14));ensure(!seen.has(index+':'+key),'Duplicate QQ parameter');seen.add(index+':'+key);
  if(index===-12){ensure(!bindings,'Duplicate QQ bindings');bindings=true;const n=v.getUint32(20,true);ensure(n%8===0&&24+n<=bytes.length,'Invalid QQ bindings');for(let at=24;at<24+n;at+=8)ensure(v.getUint32(at+4,true)===0,'Bound QQ options are not decoded');}
  else if(index>=0){const value=finite(v.getFloat32(16,true));if(key==='        ')defaults.set(index,value);else overrides.push({index,value});}
  else ensure([-5,-4,-3,-2,-1].includes(index),'Unknown QQ metadata');
 }
 ensure(bindings,'Missing QQ bindings');for(const r of overrides){const slot=Math.floor((r.index-28)/15),offset=(r.index-28)%15,metadata=slot>=0&&slot<defaults.get(3)&&[8,9,10].includes(offset);ensure(metadata||defaults.get(r.index)===r.value,'Size-dependent QQ parameters are not decoded');}
 const modes=new Map([[0,2],[2,1],[4,3],[5,1]]);for(const[i,v]of modes)ensure(defaults.get(i)===v,'Unsupported three-anchor QQ mode '+i);
 const count=defaults.get(3);ensure(Number.isInteger(count)&&count>=3&&count<=5,'Unsupported QQ support count');const permitted=new Set([...modes.keys(),3,20,21]),slots=[];
 for(let i=0;i<count;i++){
  const at=28+15*i,type=defaults.get(at);ensure(type===1||type===2,'Unsupported QQ support type');
  const fields=type===1?[0,1,2,4,5,7,8,9,10]:[0,5,6,8,9,10];for(const offset of fields)permitted.add(at+offset);
  slots.push({type,pick:defaults.get(at+1),direction:defaults.get(at+2),angle:defaults.get(at+7),move:defaults.get(at+5),movePercent:defaults.get(at+4),relativeLength:defaults.get(at+5),relativeHeight:defaults.get(at+6)});
 }
 for(const[i,value]of defaults)if(!permitted.has(i))ensure(value===0,'Unsupported three-anchor QQ option '+i);
 const base=slots.filter(s=>s.type===1);ensure(base.length===3&&slots[0]===base[0]&&slots.at(-1)===base[2]&&[0,2,500].includes(base[0].direction)&&base[1].direction===0&&base[1].angle===0&&[0,1,3,4,500].includes(base[2].direction),'Unsupported QQ direction arrangement');
 const hasAbsoluteDirection=base[0].direction===2,referencedEnd=[1,4].includes(base[2].direction),absoluteEnd=base[2].direction===3,enhancedReference=hasAbsoluteDirection&&base[2].direction===4&&count===3;ensure(!absoluteEnd||hasAbsoluteDirection&&count===3,'Unsupported absolute-end family');ensure(!referencedEnd||([0,500].includes(base[0].direction)||enhancedReference)&&count===3,'Unsupported referenced-end family');
 ensure(hasAbsoluteDirection||base[0].direction===500||count===3,'Auxiliaries with a natural start require separate decoding');
 ensure(base.every(s=>Math.abs(s.move)<=100&&Math.abs(s.movePercent)<=100),'QQ base displacement outside verified range');
 ensure(!hasAbsoluteDirection||base.every(s=>s.move===0&&s.movePercent===0),'Absolute direction displacements are not verified');
 ensure(new Set(base.map(s=>s.pick)).size===3&&base.every(s=>[1,2,3].includes(s.pick)),'Invalid QQ base references');
 const relevant=entries(references).filter(b=>view(b).getUint16(6,true)===1&&view(b).getUint16(10,true)===record);ensure(relevant.length===(absoluteEnd||enhancedReference?6:hasAbsoluteDirection||referencedEnd?5:4),'Unsupported three-anchor reference count');
 const created=relevant.filter(b=>view(b).getUint16(8,true)===5),picks=relevant.filter(b=>view(b).getUint16(8,true)===6),directions=relevant.filter(b=>view(b).getUint16(8,true)===7);ensure(created.length===1&&picks.length===3&&directions.length===(absoluteEnd||enhancedReference?2:hasAbsoluteDirection||referencedEnd?1:0),'Missing three-anchor references');
 const creation=view(created[0]);ensure(creation.byteLength===24&&creation.getUint32(12,true)===101&&creation.getUint32(20,true)===0,'Unknown QQ creation header');const id=creation.getUint32(16,true);ensure(id>0&&!objects.some(o=>o.id===id),'Duplicate QQ result');
 const endpoints=new Map(),dependencies=[];
 for(const bytes of picks){const p=view(bytes);ensure(p.byteLength===40&&p.getUint32(20,true)===0&&p.getUint32(32,true)===0&&p.getUint32(36,true)===0,'Unsupported QQ selector fields');const ordinal=p.getUint32(12,true),mode=p.getUint16(16,true),flags=p.getUint16(18,true),objectId=p.getUint16(24,true),o=objects.find(o=>o.id===objectId);ensure([1,2,3].includes(ordinal)&&!endpoints.has(ordinal)&&o&&(!o.geometryKind||o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm)&&o.directionPolyline),'Missing QQ source object');let point;
  if(mode===1&&flags===256){ensure(o.points.length===1&&p.getUint16(26,true)===1&&p.getUint32(28,true)===0,'Unsupported QQ point pick');point=o.points[0].slice();}
  else if(mode===2&&flags===512){const fraction=p.getFloat32(28,true);ensure(p.getUint16(26,true)===0&&o.points.length>=2&&Number.isFinite(fraction)&&fraction>=0&&fraction<=1,'Unsupported QQ line fraction');if(o.geometryKind){const path=sourceConstructionPoints(o),length=path.slice(1).reduce((n,p,i)=>n+distance(p,path[i]),0);point=pointOnConstructionCurve(path,length*fraction,true);}else point=o.points[0].map((x,k)=>Math.fround(x+fraction*(o.points[1][k]-x)));}
  else if(mode===4&&[512,767].includes(flags)){const code=p.getUint16(26,true);ensure(o.points.length>=2&&(!o.geometryKind||code>200),'Missing QQ distance line');if(code===0)point=pointAtDistance(o.points,finite(p.getFloat32(28,true)),flags===767);else{const z=zValues.find(z=>z.index===code-200);ensure(code>200&&z&&z.recordStep<=record,'Unresolved QQ distance');point=o.geometryKind?pointOnConstructionCurve(sourceConstructionPoints(o),finite(z.value),flags===767):pointAtDistance(o.points,finite(z.value),flags===767);dependencies.push('Z'+z.index);}}
  else throw Error('Unsupported QQ base selector');
  const slot=base.find(s=>s.pick===ordinal);if(slot.move!==0){ensure(!hasAbsoluteDirection&&o.points.length===2&&[2,4].includes(mode),'Unsupported QQ displacement source');const length=distance(...o.points);ensure(length>1e-7,'Degenerate QQ displacement line');point=add(point,o.points[1].map((x,k)=>(x-o.points[0][k])/length),slot.move);}
  endpoints.set(ordinal,point);dependencies.push(objectId);
 }
 let angle=0;if(hasAbsoluteDirection){const directionRows=directions.filter(row=>view(row).getUint32(12,true)===2);ensure(directionRows.length===1,'Ambiguous QQ absolute start');const direction=view(directionRows[0]);if(enhancedReference&&direction.getUint32(16,true)===2){const source=objects.find(o=>o.id===direction.getUint16(32,true));ensure(source,'Missing starting tangent source');const points=source.geometryKind?sourceConstructionPoints(source):source.points,first=points[1]?.map((x,k)=>x-points[0][k]),length=first?Math.hypot(...first):0,straight=length>1e-7&&points.every(p=>Math.abs((p[0]-points[0][0])*first[1]-(p[1]-points[0][1])*first[0])<=.0001*length);ensure(straight||direction.getUint16(26,true)===767&&['qq-two-relative-end-v1','qq-two-auxiliary-v1','qq-one-natural-end-v1','qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1'].includes(source.directionPolyline?.family),'Unsupported starting tangent path');const resolved=resolveQQDirection(directionRows[0],objects,2);angle=resolved.angle;dependencies.push(resolved.sourceId);}else{ensure(direction.byteLength===80&&direction.getUint32(12,true)===2&&direction.getUint32(16,true)===1,'Unsupported QQ absolute direction');for(let at=20;at<76;at++)ensure(direction.getUint8(at)===0,'Unknown QQ absolute direction field');angle=finite(direction.getFloat32(76,true));}}const auxiliaries=[];let span=-1;for(const slot of slots){if(slot.type===1)span++;else auxiliaries.push({span,relativeLength:slot.relativeLength,relativeHeight:slot.relativeHeight});}
 let endAngle=base[2].angle;if(absoluteEnd){const rows=directions.filter(row=>view(row).getUint32(12,true)===3);ensure(rows.length===1,'Missing QQ absolute end');const d=view(rows[0]);ensure(d.byteLength===80&&d.getUint32(16,true)===1&&rows[0].subarray(20,76).every(x=>x===0),'Unsupported QQ absolute end fields');const a=endpoints.get(base[0].pick),b=endpoints.get(base[2].pick),theta=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;endAngle=((finite(d.getFloat32(76,true))+endAngle-theta+540)%360)-180;}if(referencedEnd){const endRow=directions.find(r=>view(r).getUint32(12,true)===base[2].direction);ensure(endRow,'Missing referenced end');const d=view(endRow);let direction;if(d.getUint32(16,true)===1){ensure(d.byteLength===80&&d.getUint32(12,true)===1&&endRow.subarray(20,76).every(x=>x===0),'Unsupported QQ absolute end reference');direction={angle:finite(d.getFloat32(76,true))};}else{ensure(base[0].direction===0||enhancedReference,'Unsupported referenced-end family');if(enhancedReference){const target=objects.find(o=>o.id===d.getUint16(32,true));ensure(target,'Missing end tangent source');const points=target.geometryKind?sourceConstructionPoints(target):target.points,first=points[1]?.map((x,k)=>x-points[0][k]),length=first?Math.hypot(...first):0;const straight=length>1e-7&&points.every(p=>Math.abs((p[0]-points[0][0])*first[1]-(p[1]-points[0][1])*first[0])<=.0001*length);ensure(straight||d.getUint16(26,true)===767&&['qq-two-relative-end-v1','qq-two-auxiliary-v1','qq-one-natural-end-v1','qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1'].includes(target.directionPolyline?.family),'Unsupported end tangent path');}direction=resolveQQDirection(endRow,objects,base[2].direction);}const a=endpoints.get(base[0].pick),b=endpoints.get(base[2].pick),theta=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;endAngle=((direction.angle+endAngle-theta+540)%360)-180;if(direction.sourceId)dependencies.push(direction.sourceId);}
 const model=solveThreeAnchorCurve({anchors:base.map(s=>endpoints.get(s.pick)),startAngle:angle+base[0].angle,endAngle,endStraight:defaults.get(20),auxiliaries,startDirection:hasAbsoluteDirection?'absolute':base[0].direction===500?'relative':'natural',endDirection:base[2].direction===0?'natural':'relative'});
 // Native replay verifies the cumulative grid only for three-base curves with a
 // relative final direction and a relative/natural start, without auxiliaries.
 // Natural-final, absolute and referenced directions retain their original grids/reduction.
 const constructionPoints=sampleThreeAnchorQQSegments(model.supports,model.points[0],endpoints.get(base[1].pick),defaults.get(20)?model.points.at(-2):model.points.at(-1),model.points.at(-1),{cumulativeGrid:count===3&&[0,500].includes(base[0].direction)&&base[2].direction===500});
 return{id,...(includeControls&&count===3?{controlConstruction:{family:'three-anchor',anchors:base.map(s=>endpoints.get(s.pick).slice()),angles:[angle+base[0].angle+(hasAbsoluteDirection?0:Math.atan2(endpoints.get(base[2].pick)[1]-endpoints.get(base[0].pick)[1],endpoints.get(base[2].pick)[0]-endpoints.get(base[0].pick)[0])*180/Math.PI),0,endAngle+Math.atan2(endpoints.get(base[2].pick)[1]-endpoints.get(base[0].pick)[1],endpoints.get(base[2].pick)[0]-endpoints.get(base[0].pick)[0])*180/Math.PI],angleIndices:slots.flatMap((s,i)=>s.type===1?[35+15*i]:[]),helpers:[]}}:{}),points:model.points,record,dependencies,operation:'interactive-three-anchor-curve',geometryKind:'sampled-curve',samplingToleranceMm:.0001,nativePolylineParity:false,...(constructionPoints?{directionPolyline:{family:base[0].direction===0&&base[2].direction===500&&count===3&&defaults.get(20)===0?'qq-three-anchor-natural-end-v1':'qq-three-anchor-spans-v1',points:constructionPoints}}:{})};
}
