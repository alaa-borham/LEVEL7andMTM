import{readOriginalReflectionRecords}from'./native-reflection-records.mjs';
import{readPointMoveRecords}from'./native-point-move-records.mjs';
import{readPointMirrorRecords}from'./native-point-mirror-records.mjs';
import{readPointRotateRecords}from'./native-point-rotate-records.mjs';
import{readPointTurnMoveRecords}from'./native-point-turnmove-records.mjs';
const families=[
 {read:readOriginalReflectionRecords,bytes:64,offsets:[0],hints:[[16,24]]},
 {read:readPointMoveRecords,bytes:128,offsets:[64],hints:[[72,80]]},
 {read:readPointMirrorRecords,bytes:128,offsets:[64],hints:[[72,88]]},
 {read:readPointRotateRecords,bytes:160,offsets:[96],hints:[[104,120]]},
 {read:readPointTurnMoveRecords,bytes:192,offsets:[128,160],hints:[[136,160],[184,192]]},
];
/** Accept only measured cached float normalization, even across mixed operations.
 * Selectors, identities, operation codes and record references remain exact. */
export function sameNativeTransformHintHistory(a,b){
 if(a.length!==b.length||a.length%32)return false;let changed=false;
 for(let at=0;at<a.length;at+=32){
  if(a.subarray(at,at+32).every((n,i)=>n===b[at+i]))continue;
  let accepted=false;
  for(const family of families){for(const offset of family.offsets){
   const start=at-offset;if(start<0||start+family.bytes>a.length)continue;
   const x=a.slice(start,start+family.bytes),y=b.slice(start,start+family.bytes),record=start/32+1;
   if(!family.read(x,record)||!family.read(y,record))continue;
   for(const[from,to]of family.hints){x.fill(0,from,to);y.fill(0,from,to);}
   if(!x.every((n,i)=>n===y[i]))continue;
   accepted=true;changed=true;at=start+family.bytes-32;break;
  }if(accepted)break;}
  if(!accepted)return false;
 }return changed;
}
