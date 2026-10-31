/** Independent, browser-compatible geometry kernel. No native executable,
 * captured output lookup, cache interpolation, file IO or MDL writing.
 * Executes only explicitly supported contiguous history slices against supplied
 * upstream straight lines. Does not claim to execute the entire native history.
 */
import {pointOnConstructionCurve} from './curve-direction-kernel.mjs';
import {straightLineIntersection} from './geometric-z-kernel.mjs';
import {constructionPoints} from './parallel-path-kernel.mjs';
const MAX_COORDINATE=1e6,MAX_RECORDS=4096;
function requireValue(condition,message){if(!condition)throw new Error(message);}
function finite(n){requireValue(Number.isFinite(n)&&Math.abs(n)<=MAX_COORDINATE,'Nonfinite or out-of-range geometry');return n;}
const point=p=>{requireValue(Array.isArray(p)&&p.length===2,'Expected XY pair');return p.map(finite);};
const storedPoint=p=>point(p).map(Math.fround);
function lineGeometry(points){requireValue(points.length===2,'Only straight two-point geometry is supported');const [a,b]=points.map(point),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);requireValue(length>1e-7,'Degenerate straight line');return{a,b,dx,dy,length};}
export function parallelLine(points,distance,side){
  const {dx,dy,length}=lineGeometry(points);finite(distance);requireValue(side===1||side===-1,'Unsupported parallel side');
  const tx=dy/length*distance*side,ty=-dx/length*distance*side;
  return points.map(p=>storedPoint([p[0]+tx,p[1]+ty]));
}
export function pointAtDistance(points,distance,fromStart){
  const {a,b,dx,dy,length}=lineGeometry(points);finite(distance);
  requireValue(typeof fromStart==='boolean','Explicit distance direction required');
  return storedPoint(fromStart?[a[0]+dx/length*distance,a[1]+dy/length*distance]:[b[0]-dx/length*distance,b[1]-dy/length*distance]);
}
export function replayLinearHistory({history,firstRecord=1,seedObjects,zValues}){
  requireValue(history instanceof Uint8Array&&history.byteLength%32===0&&history.byteLength/32<=MAX_RECORDS,'Invalid bounded history slice');
  requireValue(Number.isInteger(firstRecord)&&firstRecord>=1,'Invalid first record');
  requireValue(Array.isArray(seedObjects)&&Array.isArray(zValues),'Explicit inputs required');
  const objects=new Map(),z=new Map(),created=[],trace=[];
  for(const o of seedObjects){requireValue(Number.isInteger(o.id)&&o.id>0&&!objects.has(o.id),'Duplicate/invalid seed object');objects.set(o.id,{...o,points:o.points.map(point)});}
  for(const entry of zValues){requireValue(Number.isInteger(entry.index)&&entry.index>0&&!z.has(entry.index),'Duplicate/invalid Z input');requireValue(Number.isInteger(entry.recordStep)&&entry.recordStep>=1,'Missing Z definition position');z.set(entry.index,{value:finite(entry.value),recordStep:entry.recordStep});}
  let selections=[],numeric=null,lastFamily=null,pendingOffset=0,pendingParallel=false;
  const source=id=>{const o=objects.get(id);requireValue(o,'Missing upstream object '+id);lineGeometry(o.points);return o;};
  const add=(id,points,record,dependencies)=>{requireValue(Number.isInteger(id)&&id>0&&!objects.has(id),'Creation would overwrite object '+id);const o={id,points:points.map(storedPoint),record,dependencies};objects.set(id,o);created.push(o);trace.push({record,operation:points.length===1?'point':'line',objectId:id,dependencies});};
  for(let at=0;at<history.byteLength;at+=32){
    const v=new DataView(history.buffer,history.byteOffset+at,32),h=[0,2,4,6].map(n=>v.getUint16(n,true)),record=firstRecord+at/32;
    if(pendingParallel){requireValue(h[0]===104&&h[1]===404,'Unsupported continued parallel consumer');pendingParallel=false;}
    // 9404 has only been decoded for a point followed by a directed offset.
    // A prefix may end before its consumer, but no other consumer may use it.
    if(pendingOffset===1){requireValue(h[0]===196&&h[1]===101&&h[2]===2&&h[3]===0,'Unsupported pending offset selector');pendingOffset=2;}
    else if(pendingOffset===2){requireValue(h[0]===294&&h[1]===201&&h[2]===14&&h[3]===10,'Unsupported pending offset consumer');pendingOffset=0;}
    const word=n=>v.getUint32(n,true),f=n=>v.getFloat32(n,true),zero=(start,end)=>{for(let n=start;n<end;n++)requireValue(v.getUint8(n)===0,'Unknown history field at record '+record);};
    if(h[0]%100===97){
      const continuedParallel=h[0]===297&&h[1]===300&&h[2]===401&&lastFamily==='parallel'&&selections.length===0;
      requireValue((h[1]===h[0]-97||continuedParallel)&&([401,9404,9604].includes(h[2])&&h[3]>200||[9603,9604].includes(h[2])&&h[3]===0),'Unsupported numeric input at record '+record);zero(12,32);pendingParallel=continuedParallel;
      if(h[2]===9404){requireValue(h[0]===197,'Unsupported pending offset input');pendingOffset=1;}
      if(h[0]===197)selections=[];
      if([9603,9604].includes(h[2])&&h[3]===0)numeric={value:finite(f(8)),dependencies:[]};
      else {const entry=z.get(h[3]-200);requireValue(entry&&entry.recordStep<=record,'Unresolved or later Z'+(h[3]-200));numeric={value:entry.value,index:h[3]-200,dependencies:['Z'+(h[3]-200)]};}
      lastFamily='numeric';continue;
    }
    if(h[0]===104){
      requireValue(h[2]===0&&[104,204,304,404].includes(h[1])&&v.getUint16(8,true)===65535,'Unsupported parallel record '+record);zero(20,32);
      if(h[1]===104){requireValue(selections.length===0,'Literal parallel within pending selection');if(!numeric)numeric={value:finite(f(12)),dependencies:[]};}
      requireValue(numeric&&[1,-1].includes(f(16)),'Missing parallel parameter');
      const from=source(h[3]);add(v.getUint16(10,true),parallelLine(from.points,numeric.value,f(16)),record,[from.id,...numeric.dependencies]);lastFamily='parallel';continue;
    }
    if(h[0]%100===96){
      requireValue(h[1]===h[0]-95&&h[3]===0&&[2,3,5,8,10].includes(h[2]),'Unsupported selector at record '+record);
      if(h[0]===196)selections=[];
      const o=[2,3,8,10].includes(h[2])?objects.get(word(8)):source(word(8));requireValue(o,'Missing upstream point');let p,dependencies=[o.id];
      if(h[2]===2){requireValue(o.points.length===1&&word(12)===65536&&[18,19].includes(word(16)),'Unsupported point selector');zero(20,32);p=o.points[0];}
      else if(h[2]===3){requireValue(o.points.length===2||o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm)&&o.points.length>=3&&o.points.length<=8192,'Unsupported endpoint geometry');requireValue(word(12)===65536&&[18,19].includes(word(16)),'Unsupported endpoint selector');zero(20,28);const fraction=f(28);requireValue(Number.isFinite(fraction)&&fraction>=-.00001&&fraction<=1.00001,'Invalid selected fraction');const t=Math.max(0,Math.min(1,fraction));
       if(t===0||t===1)p=t===0?o.points[0]:o.points.at(-1);
       else if(o.geometryKind){const rows=constructionPoints(o),length=rows.slice(1).reduce((s,p,i)=>s+Math.hypot(...p.map((x,k)=>x-rows[i][k])),0);p=pointOnConstructionCurve(rows,t*length,true);}
       else p=storedPoint(o.points[0].map((x,k)=>x+t*(o.points[1][k]-x)));}
      else if(h[2]===5){requireValue((word(12)>>>16)===1&&[18,19].includes(word(16)),'Unsupported intersection selector');zero(20,28);requireValue(Number.isFinite(f(28))&&f(28)>=0&&f(28)<=1,'Invalid intersection pick hint');const second=source(word(12)&65535);p=storedPoint(straightLineIntersection(o.points,second.points));dependencies.push(second.id);}
      else {requireValue(word(12)===0&&[18,19,0xffff0012,0xffff0013].includes(word(16)),'Unsupported distance selector');zero(20,32);requireValue(numeric&&lastFamily==='numeric','Missing selected-point distance');
        if(o.geometryKind){
          const poly=o.directionPolyline;requireValue(o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm)&&poly&&['qq-three-anchor-spans-v1','qq-three-anchor-natural-end-v1','qq-one-natural-end-v1','qq-two-relative-end-v1','qq-two-auxiliary-v1','construction-cut-v1','construction-morph-v1','construction-join-v1','construction-offset-v1','round-corner-v1'].includes(poly.family),'Unsupported distance curve');
          if(h[2]===8){requireValue(numeric.value===50,'Only midpoint percentage is verified');const total=poly.points.slice(1).reduce((s,q,i)=>s+Math.hypot(...q.map((x,k)=>x-poly.points[i][k])),0);p=pointOnConstructionCurve(poly.points,total/2,true);}
          else p=pointOnConstructionCurve(poly.points,numeric.value,(word(16)>>>16)===65535);
        }
        else if(h[2]===8){requireValue(numeric.value===50,'Only midpoint percentage is verified');p=storedPoint([(o.points[0][0]+o.points[1][0])/2,(o.points[0][1]+o.points[1][1])/2]);}
        else p=pointAtDistance(o.points,numeric.value,(word(16)>>>16)===65535);
        dependencies.push(...numeric.dependencies);}
      selections.push({point:p,dependencies});requireValue(selections.length<=2,'Too many selected points');lastFamily='selector';continue;
    }
    if(h[0]%100===94){
      if(h[2]===14&&h[3]===10){
        requireValue(h[0]===294&&h[1]===201&&(word(12)>>>16)===65535,'Unsupported offset-point creation');zero(16,32);
        requireValue(lastFamily==='selector'&&selections.length===1&&numeric,'Missing offset-point inputs');
        const direction=source(word(8)),g=lineGeometry(direction.points),p=selections[0].point;
        add(word(12)&65535,[p.map((n,i)=>n+[g.dx,g.dy][i]/g.length*numeric.value)],record,[...new Set([...selections[0].dependencies,direction.id,...numeric.dependencies])]);
        selections=[];numeric=null;lastFamily='creation';continue;
      }
      requireValue(h[1]===h[0]-93&&h[3]===0&&[1,2,3,4].includes(h[2]),'Unsupported creation at record '+record);zero(8,12);zero(16,32);
      const count=h[2]===1?1:2;requireValue(lastFamily==='selector'&&selections.length===count,'Incomplete point selection');
      const points=selections.map(s=>s.point.slice());if(h[2]===3)points[1][1]=points[0][1];if(h[2]===4)points[1][0]=points[0][0];
      add(word(12),points,record,[...new Set(selections.flatMap(s=>s.dependencies))]);selections=[];numeric=null;lastFamily='creation';continue;
    }
    throw new Error('Unsupported history operation '+h.join('/')+' at record '+record);
  }
  return {created,trace,historyRecordsExecuted:history.length/32,standaloneFullReplay:false};
}
