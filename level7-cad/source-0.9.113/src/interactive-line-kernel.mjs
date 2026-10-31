/** Bounded decoding of original QS line calls. No Grafis code or images execute.
 * The surrounding variable-size reference chain is followed by declared lengths.
 * Only origin / endpoint start picks and absolute cardinal direction are executed.
 */
import {pointAtDistance} from './linear-history-kernel.mjs';
import {straightLineIntersection} from './geometric-z-kernel.mjs';
import {pointOnConstructionCurve} from './curve-direction-kernel.mjs';
import {constructionPoints} from './parallel-path-kernel.mjs';
const ensure=(b,m)=>{if(!b)throw Error(m);};
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const number=n=>{ensure(Number.isFinite(n)&&Math.abs(n)<=1e6,'Invalid numeric line parameter');return n;};
function entries(bytes){const v=view(bytes),rows=[];let at=0;while(at<bytes.length){ensure(at+16<=bytes.length,'Truncated interactive entry');const size=v.getUint32(at,true)*8;ensure(size>=16&&at+size<=bytes.length,'Invalid interactive entry span');rows.push(bytes.subarray(at,at+size));at+=size;ensure(rows.length<=10000,'Interactive entry count limit');}return rows;}
export function replayCardinalQSLine({historyRecord,record,parameters,references,objects,zValues,xInputs=[],allowExperimentalSelectors=false,allowExperimentalAngles=false}){
 ensure(historyRecord instanceof Uint8Array&&historyRecord.length===32,'Invalid interactive history record');
 const h=view(historyRecord);ensure(h.getUint16(0,true)===101&&h.getUint16(2,true)===104,'Not an interactive call');
 const name=String.fromCharCode(...historyRecord.subarray(12)).replace(/\0+$/,'');ensure(name==='GraPrg_GK_QS_c001_02','Unsupported interactive construction');
 const bound=new Map(),defaults=new Map();
 for(const bytes of entries(parameters)){
  ensure(bytes.length>=24,'Truncated interactive parameter');const v=view(bytes),index=v.getInt16(4,true);
  if(index===-12){const n=v.getUint32(20,true);ensure(n%8===0&&24+n<=bytes.length,'Invalid parameter binding table');for(let at=24;at<24+n;at+=8){const key=v.getUint32(at,true),code=v.getUint32(at+4,true);ensure(!bound.has(key),'Duplicate interactive parameter binding');bound.set(key,code);}}
  else if(index>=0&&bytes.subarray(6,14).every(b=>b===32)){ensure(!defaults.has(index),'Duplicate interactive default');defaults.set(index,number(v.getFloat32(16,true)));}
 }
 ensure(defaults.get(0)===2&&defaults.get(1)===1,'Unsupported QS mode');
 for(const[index,value]of defaults)if(index!==0&&index!==1&&index!==7&&!(allowExperimentalSelectors&&[9,10].includes(index)))ensure(value===0||allowExperimentalSelectors&&index===2&&value===3,'Nonzero unsupported QS option '+index);
 for(const[index,code]of bound)if(index!==7)ensure(code===0,'Unsupported bound QS option '+index);
 const resolveZ=code=>{
  if(Number.isInteger(code)&&code>=1&&code<=80){const x=xInputs.find(x=>x.name==='X'+code);ensure(x?.status==='resolved-stored-input','Line X parameter is unresolved for the selected size');return {value:number(x.value),dependency:'X'+code};}
  ensure(code>200,'Missing verified Z binding');const z=zValues.find(z=>z.index===code-200);ensure(z&&z.recordStep<=record,'Line parameter is unresolved at construction position');return {...z,dependency:'Z'+z.index};
 };
 const binding=bound.get(7),z=binding?resolveZ(binding):null;
 ensure(z||allowExperimentalSelectors,'Missing verified line length Z binding');
 const length=number(z?z.value:defaults.get(7));ensure(length>0,'Nonpositive interactive line length');
 const relevant=entries(references).filter(b=>{const v=view(b);return v.getUint16(6,true)===1&&v.getUint16(10,true)===record;});
 const unique=type=>{const a=relevant.filter(b=>view(b).getUint16(8,true)===type);ensure(a.length===1,'Ambiguous/missing interactive record type '+type);return view(a[0]);};
 // Parameter 2 identifies a displacement-line pick. Zero displacement is the
 // only admitted case; options 4/5 and all displacement values must remain zero.
 if(defaults.get(2)===3){const displacement=unique(3);ensure(displacement.byteLength===40&&displacement.getUint32(12,true)===3,'Unknown inactive displacement reference');}
 const creation=unique(5),pick=unique(6),direction=unique(7);
 ensure(creation.byteLength===24&&creation.getUint32(12,true)===101&&creation.getUint32(20,true)===0,'Unknown interactive creation header');
 const id=creation.getUint32(16,true);ensure(id>0&&!objects.some(o=>o.id===id),'Duplicate interactive result');
 ensure(pick.byteLength===40&&pick.getUint32(12,true)===1&&pick.getUint32(20,true)===0&&pick.getUint32(32,true)===0&&pick.getUint32(36,true)===0,'Unsupported interactive pick fields');
 const mode=pick.getUint16(16,true),flags=pick.getUint16(18,true),dependencies=z?[z.dependency]:[];let start;
 if(mode===7&&flags===0){start=[number(pick.getFloat32(24,true)),number(pick.getFloat32(28,true))];}
 else if(allowExperimentalSelectors&&mode===1&&flags===256){const objectId=pick.getUint16(24,true),o=objects.find(o=>o.id===objectId);ensure(pick.getUint16(26,true)===1&&pick.getUint32(28,true)===0&&o&&!o.geometryKind&&o.points.length===1,'Unsupported interactive point');start=o.points[0].slice();dependencies.push(objectId);}
 else if(mode===2&&flags===512){const objectId=pick.getUint32(24,true),fraction=pick.getFloat32(28,true),o=objects.find(o=>o.id===objectId);ensure(o&&(o.points.length===2||allowExperimentalSelectors&&o.geometryKind==='sampled-curve'&&[.0001,.08].includes(o.samplingToleranceMm)&&o.points.length>=3&&o.points.length<=8192)&&(fraction===0||fraction===1),'Unsupported interactive endpoint');start=(fraction?o.points.at(-1):o.points[0]).slice();dependencies.push(objectId);}
 else if(allowExperimentalSelectors&&mode===5&&[512,767].includes(flags)){const objectId=pick.getUint32(24,true),fraction=number(flags===512?1-pick.getFloat32(28,true):pick.getFloat32(28,true)),o=objects.find(o=>o.id===objectId);ensure(o&&fraction>=0&&fraction<=1,'Unsupported relative straight-line pick');
  if(o.geometryKind){ensure(o.geometryKind==='sampled-curve'&&o.samplingToleranceMm===.0001&&o.directionPolyline?.family==='qq-two-relative-end-v1'&&fraction===.5,'Unsupported relative curve pick');const p=o.directionPolyline.points,total=p.slice(1).reduce((sum,q,i)=>sum+Math.hypot(...q.map((x,k)=>x-p[i][k])),0);start=pointOnConstructionCurve(p,total/2,true);}
  else {ensure(o.points.length===2,'Unsupported relative straight-line pick');start=o.points[0].map((a,k)=>Math.fround(number(a+(o.points[1][k]-a)*fraction)));}dependencies.push(objectId);}
 else if(allowExperimentalSelectors&&mode===4&&[512,767].includes(flags)){const objectId=pick.getUint16(24,true),distance=resolveZ(pick.getUint16(26,true)),o=objects.find(o=>o.id===objectId);ensure(o,'Missing interactive distance line');start=o.geometryKind?pointOnConstructionCurve(constructionPoints(o),number(distance.value),flags===767):pointAtDistance(o.points,number(distance.value),flags===767);dependencies.push(objectId,distance.dependency);}
 else if(allowExperimentalSelectors&&mode===6&&flags===0){const ids=[pick.getUint16(24,true),pick.getUint16(26,true)],lines=ids.map(id=>objects.find(o=>o.id===id)),hint=number(pick.getFloat32(28,true));ensure(ids[0]!==ids[1]&&lines.every(o=>o&&!o.geometryKind&&o.points.length===2)&&hint>=0&&hint<=1,'Unsupported QS intersection operands');start=straightLineIntersection(...lines.map(o=>o.points)).map(Math.fround);dependencies.push(...ids);}
 else throw Error('Unsupported interactive start selector '+mode+'/'+flags);
 // In the default displacement mode, option9 is the signed distance along
 // the picked straight line. Option10 stores the alternative percentage display;
 // it is not a second displacement when the mode options are all zero.
 if(defaults.get(9)!==0||defaults.get(10)!==0&&defaults.get(2)!==3){
  ensure(allowExperimentalSelectors&&[2,3,4,5,6,8,11,12,13,14,15].every(i=>defaults.get(i)===0),'Unsupported QS displacement mode');
  ensure([2,4,5].includes(mode)&&[512,767].includes(flags),'Unsupported QS displacement base');
  const source=objects.find(o=>o.id===pick.getUint16(24,true));ensure(source&&!source.geometryKind&&source.points.length===2,'QS displacement requires a straight base');
  const delta=source.points[1].map((x,k)=>x-source.points[0][k]),norm=Math.hypot(...delta);ensure(norm>1e-7,'Degenerate QS displacement base');
  start=start.map((x,k)=>Math.fround(number(x+defaults.get(9)*delta[k]/norm)));
 }
 ensure(direction.byteLength===80&&direction.getUint32(12,true)===2&&direction.getUint32(16,true)===1,'Only absolute direction is supported');
 for(let at=20;at<(allowExperimentalAngles?74:76);at++)ensure(direction.getUint8(at)===0,'Unknown absolute direction data');
 const angleBinding=allowExperimentalAngles?direction.getUint16(74,true):0;
 const angleZ=angleBinding?resolveZ(angleBinding):null;
 const angle=number(angleZ?angleZ.value:direction.getFloat32(76,true));
 ensure(allowExperimentalAngles||angle%90===0,'Only cardinal direction has been verified');
 if(angleZ)dependencies.push(angleZ.dependency);
 const [dx,dy]=angle%90===0?[[1,0],[0,1],[-1,0],[0,-1]][((angle/90)%4+4)%4]:[Math.cos(angle*Math.PI/180),Math.sin(angle*Math.PI/180)];
 const points=[start,[Math.fround(number(start[0]+dx*length)),Math.fround(number(start[1]+dy*length))]];return{id,points,record,dependencies,line10Construction:{record,length,points:points.map(p=>p.slice())},operation:angle%90===0?'interactive-cardinal-line':'interactive-absolute-angle-line'};
}
