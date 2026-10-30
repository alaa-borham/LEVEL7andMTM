/** Bounded native inheritance group reader. No cache or public parent geometry inputs. */
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function readInheritanceGroup(history,firstRecord){
 ensure(history instanceof Uint8Array&&history.length%32===0,'Invalid inheritance history');
 ensure(Number.isInteger(firstRecord)&&firstRecord>0&&firstRecord<=history.length/32,'Invalid inheritance position');
 const at=n=>{ensure(n<=history.length/32,'Truncated inheritance group');return history.subarray((n-1)*32,n*32);};
 const first=view(at(firstRecord)),count=first.getUint16(4,true);
 ensure(first.getUint16(0,true)===112&&first.getUint16(2,true)===101&&first.getUint16(6,true)===0,'Unsupported inheritance header');
 ensure(count>0&&count<=4096,'Invalid inheritance object count');
 const payload=new Uint8Array(count*8);let copied=Math.min(24,payload.length),record=firstRecord;
 payload.set(at(record).subarray(8,8+copied));
 for(let sequence=2;copied<payload.length;sequence++){
  const bytes=at(++record),v=view(bytes);
  ensure(v.getUint16(0,true)===sequence*100+12&&v.getUint16(2,true)===sequence*100+1,'Invalid inheritance continuation');
  const n=Math.min(28,payload.length-copied);payload.set(bytes.subarray(4,4+n),copied);copied+=n;
 }
 let move=null,turn=null,tail=at(++record),tv=view(tail);
 // Native T81L/T81M witnesses: one straight inherited line; two fractional
 // selectors for mode 5, or four for mode 6. Other transform layouts stay closed.
 if(count===1&&tv.getUint16(0,true)===296&&tv.getUint16(2,true)===201){
  const selector=(bytes,op,sub)=>{const q=view(bytes),objectId=q.getUint32(8,true),fraction=q.getFloat32(28,true);ensure(q.getUint16(0,true)===op&&q.getUint16(2,true)===sub&&q.getUint32(4,true)===3&&objectId>=2001&&objectId<60000&&q.getUint32(12,true)===65536&&q.getUint32(16,true)>0&&q.getUint32(16,true)<65536&&bytes.subarray(20,28).every(n=>n===0)&&Number.isFinite(fraction)&&fraction>=0&&fraction<=1,'Unsupported insertion move selector');return{objectId,fraction};};
  ensure(tv.getUint32(16,true)===38,'Unsupported insertion start selector kind');move={start:selector(tail,296,201),end:selector(at(++record),396,301)};ensure(view(at(record)).getUint32(16,true)===39,'Unsupported insertion final selector kind');
  tail=at(++record);tv=view(tail);
  if(tv.getUint16(0,true)===496&&tv.getUint16(2,true)===401){const sourceDirection=move.end;ensure(sourceDirection.objectId===move.start.objectId&&tv.getUint32(16,true)===40,'Unsupported insertion turn source');move.end=selector(tail,496,401);const next=at(++record);ensure(view(next).getUint32(16,true)===41,'Unsupported insertion turn target');turn={sourceDirection,targetDirection:selector(next,596,501)};ensure(turn.targetDirection.objectId===move.end.objectId,'Insertion turn target directions need the same line');tail=at(++record);tv=view(tail);}
 }
 ensure(tv.getUint16(0,true)===112&&tv.getUint16(2,true)===103&&tv.getUint16(4,true)===count&&tv.getUint16(6,true)===(turn?6:move?5:8)&&tail.subarray(8).every(n=>n===0),'Unsupported inheritance terminator');
 const mappings=[],destinations=new Set(),pv=view(payload);
 for(let p=0;p<payload.length;p+=8){
  const sourcePartId=pv.getUint16(p,true),sourceObjectId=pv.getUint16(p+2,true),objectClass=pv.getUint16(p+4,true),objectId=pv.getUint16(p+6,true);
  ensure(sourcePartId>0&&sourcePartId<=999&&sourceObjectId>=2001&&sourceObjectId<65535&&objectId>=2001&&objectId<65535,'Invalid inherited object identity');
  ensure([1,2,3].includes(objectClass),'Unsupported inherited object class');if(objectClass===3)ensure(count===1&&!move&&tv.getUint16(6,true)===8,'Only one untransformed manufacturing symbol is witnessed');ensure(!destinations.has(objectId),'Duplicate inherited destination');destinations.add(objectId);
  mappings.push({sourcePartId,sourceObjectId,objectClass,objectId});
 }
 if(move)ensure(move.start.objectId===mappings[0].objectId&&mappings[0].objectClass===2&&move.end.objectId!==move.start.objectId,'Unsupported insertion move identities');
 return {firstRecord,lastRecord:record,mappings,sourcePartIds:[...new Set(mappings.map(m=>m.sourcePartId))],...(move?{move}:{}),...(turn?{turn}:{})};
}

export function moveInheritedLine(group,inherited,existing){
 if(!group.move)return inherited;
 const get=(selector,objects)=>{const o=objects.find(o=>o.id===selector.objectId);ensure(o&&!o.geometryKind&&o.points.length===2,'Insertion move needs a straight reference line');return o.points[0].map((n,k)=>n+selector.fraction*(o.points[1][k]-n));};
 ensure(inherited.length===1&&!inherited[0].geometryKind&&inherited[0].points.length===2,'Only the witnessed single straight insertion move is supported');
 const start=get(group.move.start,inherited),end=get(group.move.end,existing),delta=end.map((n,k)=>n-start[k]);
 ensure(delta.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6),'Invalid insertion displacement');
 if(group.turn){const a=get(group.turn.sourceDirection,inherited).map((n,k)=>n-start[k]),b=get(group.turn.targetDirection,existing).map((n,k)=>n-end[k]),la=Math.hypot(...a),lb=Math.hypot(...b);ensure(la>1e-6&&lb>1e-6,'Insertion turn direction is undefined');const c=(a[0]*b[0]+a[1]*b[1])/(la*lb),s=(a[0]*b[1]-a[1]*b[0])/(la*lb);return inherited.map(o=>({...o,points:o.points.map(p=>[Math.fround(end[0]+c*(p[0]-start[0])-s*(p[1]-start[1])),Math.fround(end[1]+s*(p[0]-start[0])+c*(p[1]-start[1]))]),operation:'inherit-turned-straight-line',dependencies:[...o.dependencies,group.move.end.objectId]}));}
 return inherited.map(o=>({...o,points:o.points.map(p=>p.map((n,k)=>Math.fround(n+delta[k]))),operation:'inherit-moved-straight-line',dependencies:[...o.dependencies,group.move.end.objectId]}));
}
