import{readSequenceLineRecord}from'./native-sequence-line-record.mjs';
import{readRaster0Record}from'./native-raster0-record.mjs';
import{readOriginalPerpendicularRecords}from'./native-perpendicular-records.mjs';
import{readOriginalJoinRecord}from'./native-join-records.mjs';
import{readOriginalCutRecords,readOriginalSplitRecords}from'./native-cut-records.mjs';
import{readIntersectionNotchRecords,readCopiedNotchRecord}from'./native-intersection-notch-records.mjs';
import{readEndpointNotchRecords}from'./native-endpoint-notch-records.mjs';
import{nativeLineStates,nativePointMarks}from'./native-line-attributes.mjs';
const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
export function readLinkedPointRecords(raw){
 if(!(raw instanceof Uint8Array)||![64,96].includes(raw.length))return null;
 const relative=raw.length===64,q=v(raw),offset=relative?0:32,id=q.getUint32(raw.length-20,true),sourceId=q.getUint32(offset+8,true),value=q.getFloat32(relative?28:8,true),mode=q.getUint32(offset+16,true);
 if(id<2001||id>=60000||sourceId<2001||sourceId>=60000||id===sourceId||!Number.isFinite(value)||(relative?value<0||value>1:value<0||value>1e6)||!(relative?mode===18:[18,0xffff0012].includes(mode)))return null;
 const expected=new Uint8Array(raw.length),e=v(expected),headers=relative?[[196,101,3,0],[294,201,1,0]]:[[197,100,9604,0],[296,201,10,0],[394,301,1,0]];headers.forEach((row,i)=>row.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));e.setUint32(offset+8,sourceId,true);e.setUint32(offset+12,relative?65536:0,true);e.setUint32(offset+16,mode,true);e.setFloat32(relative?28:8,value,true);e.setUint32(raw.length-20,id,true);
 return raw.every((n,i)=>n===expected[i])?{id,sourceId,type:relative?'fraction':'distance',value,fromEnd:!relative&&mode===18}:null;
}
function trailingDisplayStart(history,end){
 if(end>=32){const q=v(history.subarray(end-32,end)),n=q.getUint16(4,true);if(q.getUint16(0,true)===113&&q.getUint16(2,true)===101&&n>=1&&n<=13){const ids=Array.from({length:n},(_,i)=>q.getUint16(6+i*2,true));if(new Set(ids).size===n&&ids.every(id=>id>=2001&&id<60000))return end-32;}}

 if(end>=32){const raw=history.subarray(end-32,end),q=v(raw),id=q.getUint16(4,true);if(q.getUint16(0,true)===113&&q.getUint16(2,true)===100&&id>=2001&&id<60000&&[1,2].includes(q.getUint16(6,true))&&raw.subarray(8).every(n=>n===0))return end-32;}
 for(let rows=1;rows<=19&&end>=rows*32;rows++){const at=end-rows*32,raw=history.subarray(at,end),q=v(raw),n=q.getUint16(4,true);if(q.getUint16(0,true)!==117||q.getUint16(2,true)!==103||n<1||n>128||rows!==Math.ceil(Math.max(0,n-6)/7)+1)continue;let count=0,ok=true;for(let r=0;r<rows;r++){const row=raw.subarray(r*32,r*32+32),b=v(row),offset=r?4:6,capacity=r?7:6;if(b.getUint16(0,true)!==117+r*100||b.getUint16(2,true)!==103+r*100){ok=false;break;}for(let i=0;i<capacity&&count<n;i++,count++){const id=b.getUint16(offset+4*i,true),state=b.getUint16(offset+4*i+2,true);if(id<2001||id>=60000||!(nativeLineStates.includes(state)||nativePointMarks.some(s=>s.id===state)))ok=false;}if(!r&&!row.subarray(6+Math.min(n,6)*4).every(n=>n===0))ok=false;}if(ok&&count===n)return at;
 }return end;
}
export function trailingLinkedPointStart(history){
 let at=history.length,first=null;while(at){const display=trailingDisplayStart(history,at);if(display<at){at=display;continue;}if(at>=32&&readOriginalJoinRecord(history.subarray(at-32,at))){at-=32;continue;}if(at>=64&&(readOriginalCutRecords(history.subarray(at-64,at))||readOriginalSplitRecords(history.subarray(at-64,at)))){at-=64;continue;}if(at>=32&&readCopiedNotchRecord(history.subarray(at-32,at))){at-=32;continue;}if(at>=96&&(readEndpointNotchRecords(history.subarray(at-96,at))||readIntersectionNotchRecords(history.subarray(at-96,at)))){at-=96;continue;}if(at>=64&&readOriginalPerpendicularRecords(history.subarray(at-64,at))){at-=64;first=at;continue;}if(at>=32&&(readRaster0Record(history.subarray(at-32,at))||readSequenceLineRecord(history.subarray(at-32,at)))){at-=32;first=at;continue;}let size=0;for(const n of[64,96])if(at>=n&&readLinkedPointRecords(history.subarray(at-n,at))){size=n;break;}if(!size)break;at-=size;first=at;}return first??history.length;
}
export function readReferenceLineRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==96)return null;const q=v(raw),id=q.getUint32(76,true),startPointId=q.getUint32(8,true),endPointId=q.getUint32(40,true);
 if(![id,startPointId,endPointId].every(n=>n>=2001&&n<60000)||new Set([id,startPointId,endPointId]).size!==3)return null;
 const expected=new Uint8Array(96),e=v(expected);[[196,101,2,0],[296,201,2,0],[394,301,2,0]].forEach((h,i)=>h.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));
 e.setUint32(8,startPointId,true);e.setUint32(12,65536,true);e.setUint32(16,18,true);e.setUint32(40,endPointId,true);e.setUint32(44,65536,true);e.setUint32(48,19,true);e.setUint32(76,id,true);
 return raw.every((n,i)=>n===expected[i])?{id,startPointId,endPointId}:null;
}
export function readAbsolutePointRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==128)return null;const q=v(raw),id=q.getUint32(108,true),x=q.getFloat32(8,true),y=q.getFloat32(40,true);if(id<2001||id>=60000||![x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))return null;
 const expected=new Uint8Array(128),e=v(expected);[[197,100,9601,0],[297,200,9602,0],[396,301,12,0],[494,401,1,0]].forEach((h,i)=>h.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));e.setFloat32(8,x,true);e.setFloat32(40,y,true);e.setUint32(80,18,true);e.setUint32(108,id,true);return raw.every((n,i)=>n===expected[i])?{id,x,y}:null;
}
export function readStableOffsetRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==96)return null;const q=v(raw),id=q.getUint16(70,true),start=q.getFloat32(8,true),end=q.getFloat32(40,true),side=q.getFloat32(80,true);if(id<2001||id>=60000||![start,end].every(n=>Number.isFinite(n)&&Math.abs(n)<=1000)||![1,-1].includes(side))return null;
 const expected=new Uint8Array(96),e=v(expected);[[197,100,402,0],[297,200,403,0],[104,206,0,id,65535,id]].forEach((h,i)=>h.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));e.setFloat32(8,start,true);e.setFloat32(40,end,true);e.setFloat32(80,side,true);e.setFloat32(88,end,true);return raw.every((n,i)=>n===expected[i])?{id,start,end,side}:null;
}
export function trailingLinkedDrawingGroups(history){
 let at=history.length;const groups=[];while(at){const display=trailingDisplayStart(history,at);if(display<at){at=display;continue;}let found=null;if(at>=32){const r=readRaster0Record(history.subarray(at-32,at))||readSequenceLineRecord(history.subarray(at-32,at));if(r)found={at:at-32,end:at,kind:'raster',...r};}if(!found&&at>=64){const p=readOriginalPerpendicularRecords(history.subarray(at-64,at));if(p)found={at:at-64,end:at,kind:'perpendicular',...p};}for(const n of found?[]:[64,96,128]){if(at<n)continue;const raw=history.subarray(at-n,at),point=readLinkedPointRecords(raw),line=point?null:readReferenceLineRecords(raw),offset=point||line?null:readStableOffsetRecords(raw),absolute=point||line||offset?null:readAbsolutePointRecords(raw),length=point||line||offset||absolute?null:readStableLengthRecords(raw);if(point||line||offset||absolute||length){found={at:at-n,end:at,kind:point?'point':line?'line':offset?'offset':absolute?'absolute':'length',...(point??line??offset??absolute??length)};break;}}if(!found&&at>=64){const cut=readOriginalCutRecords(history.subarray(at-64,at));if(cut)found={at:at-64,end:at,kind:'cut',id:cut.targetId,...cut};else{const split=readOriginalSplitRecords(history.subarray(at-64,at));if(split)found={at:at-64,end:at,kind:'split',id:split.newId,...split};}}if(!found&&at>=96){const n=readEndpointNotchRecords(history.subarray(at-96,at))||readIntersectionNotchRecords(history.subarray(at-96,at));if(n)found={at:at-96,end:at,kind:'notch',...n};}if(!found&&at>=32){const j=readOriginalJoinRecord(history.subarray(at-32,at));if(j)found={at:at-32,end:at,kind:'join',id:j.retainedId,...j};}if(!found&&at>=32){const n=readCopiedNotchRecord(history.subarray(at-32,at));if(n)found={at:at-32,end:at,kind:'notch',...n};}if(!found)break;groups.unshift(found);at=found.at;}return groups;
}
export function trailingLinkedDrawingStart(history,stopAtObjectId){
 const groups=trailingLinkedDrawingGroups(history);const parent=groups.findLast(g=>['notch','split','perpendicular'].includes(g.kind)&&g.id===stopAtObjectId),own=groups.find(g=>g.at>=(parent?.end??0)&&(g.kind==='notch'&&(g.sourceId===stopAtObjectId||g.directionSourceId===stopAtObjectId||g.targetId===stopAtObjectId)||['cut','split'].includes(g.kind)&&g.axisId===stopAtObjectId||g.kind==='raster'&&g.sourceId===stopAtObjectId||g.kind==='perpendicular'&&(g.sourceId===stopAtObjectId||g.start?.lineId===stopAtObjectId||g.start?.pointId===stopAtObjectId)||g.kind==='point'&&g.sourceId===stopAtObjectId));if(own)return Math.max(parent?.end??0,Math.min(own.at,trailingLinkedPointStart(history)));if(parent)return history.length;const first=groups.findIndex(g=>g.kind==='point');if(first<0)return trailingLinkedPointStart(history);
 const points=new Set(groups.slice(first).filter(g=>g.kind==='point'||g.kind==='absolute').map(g=>g.id));
 if(!groups.slice(first).some(g=>g.kind==='line'&&(points.has(g.startPointId)||points.has(g.endPointId))))return trailingLinkedPointStart(history);
 let at=history.length;for(let i=groups.length-1;i>=first;i--){if(groups[i].id===stopAtObjectId)break;at=groups[i].at;}return at;
}

export function readStableLengthRecords(raw){
 if(!(raw instanceof Uint8Array)||raw.length!==64)return null;const q=v(raw),id=q.getUint16(38,true),delta=q.getFloat32(8,true),end=q.getUint16(40,true);if(id<2001||id>=60000||!Number.isFinite(delta)||Math.abs(delta)>10000||![0,65535].includes(end))return null;
 const binding=q.getUint16(6,true),code=q.getUint16(4,true),absolute=code===603;if(![603,604].includes(code)||binding&&binding<=200||binding&&delta!==0||absolute&&(!binding||end!==65535))return null;
 const expected=new Uint8Array(64),e=v(expected);[[197,100,code,binding],[206,200,1,id,end,0,absolute?0:65535]].forEach((h,i)=>h.forEach((n,j)=>e.setUint16(i*32+j*2,n,true)));e.setFloat32(8,delta,true);return raw.every((n,i)=>n===expected[i])?{id,delta,fromStart:end===0,...(binding?{zIndex:binding-200}:{}),...(absolute?{absolute:true}:{})}:null;
}
