/** Read-only finished-measurement evaluation from declared native references.
 * No evaluated cache, label position or captured native result enters calculation. */
import {serializeMdl} from './native-mdl.js';
import {createPartHistoryCalculation} from './part-history-engine.mjs';
import {constructionPoints} from './construction-polyline-kernel.mjs';
import {pointOnConstructionCurve} from './curve-direction-kernel.mjs';
import {uniqueConstructionIntersection} from './construction-intersections.mjs';
const need=(ok,m)=>{if(!ok)throw Error(m);},v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),distance=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
const names={1:'مسافة مباشرة',2:'مسافة أفقية',3:'مسافة رأسية',6:'طول خط أو منحنى',9:'طول جزئي على منحنى',13:'مجموع أطوال خطوط'};
export function roundedDimensionValue(value){const low=Math.floor(value),fraction=value-low;return fraction===.5?low+low%2:Math.round(value);}
export function readRecordedDimensionDefinitions(doc,{partId}={}){
 need(Number.isInteger(partId)&&partId>=1&&partId<=999,'اختر بارتًا موجودًا.');const bytes=serializeMdl(doc);need(doc.variant==='VA','Unsupported native variant');const blocks=doc.blocks.filter(b=>b.id.join('.')===`3.${partId}.6.37`);need(blocks.length<=1,'Ambiguous finished-measurement definitions');if(!blocks.length)return[];const block=blocks[0],body=bytes.subarray(block.payloadOffset,block.endOffset),rows=[],ids=new Set();
 for(let at=0;at<body.length;){need(rows.length<1024&&at+24<=body.length,'Truncated or excessive dimension table');const q=v(body.subarray(at)),length=q.getUint32(0,true)*8;need(length>=32&&length<=8192&&at+length<=body.length,'Invalid native dimension definition span');const raw=body.slice(at,at+length),d=v(raw),objectId=d.getUint16(10,true),type=d.getUint16(12,true),style=d.getUint16(6,true);need(objectId>=2001&&objectId<60000&&!ids.has(objectId),'Invalid or duplicate dimension identity');ids.add(objectId);rows.push({partId,objectId,ordinal:d.getUint16(8,true),type,kind:names[type&255]??'نوع غير مدعوم',format:d.getUint16(14,true),style,code:String.fromCharCode(...raw.subarray(-8)).trim(),raw});at+=length;
 }return rows.map(r=>({...r,code:r.code.replace(/[\0 ]+$/,'')}));
}
export function recordedDimensionsText(report){
 const cell=value=>{let s=String(value??'').replace(/[\t\r\n\0]/g,' ');return /^[=+\-@]/.test(s)?"'"+s:s;};
 const rows=[['Part','Size','Measurement','Code','Kind','Value mm','Multiplier','Displayed value mm','Rounded label','Source objects','Status'],...report.entries.map(e=>[report.partId,report.sizeKey,'M'+e.ordinal,e.code,e.kind,e.status==='calculated'?e.value:'',e.multiplier??'',e.displayedValue??'',e.label??'',e.sourceObjectIds.join(','),e.status==='calculated'?'Calculated':e.reason])];return rows.map(row=>row.map(cell).join('\t')).join('\r\n')+'\r\n';
}
export function evaluateRecordedDimensions(doc,{partId,sizeKey}={}){
 const definitions=readRecordedDimensionDefinitions(doc,{partId}),part=createPartHistoryCalculation(doc,{sizeKey}).get(partId),objects=new Map(part.objects.map(o=>[o.id,o]));
 const entries=definitions.map(({raw,...definition})=>{
  const dependencies=[],q=v(raw),operand=id=>{const o=objects.get(id);need(o,'مصدر القياس غير موجود: '+id);dependencies.push(id);return o;},path=o=>constructionPoints(o),length=ps=>ps.slice(1).reduce((s,p,i)=>s+distance(p,ps[i]),0);
  try{
   need(part.historyFullyExecuted,'لم يكتمل حساب سجل البارت؛ لا يُقاس رسم جزئي.');need([2305,2306,2307,2310,2313,2317,2562,2563,2566].includes(definition.type)&&(definition.format&255)===6,'نوع القياس أو تنسيقه لم يُفكّ بعد.');need(q.getUint32(0,true)*8===raw.length&&q.getUint16(4,true)===0,'Unknown dimension header');
   const kind=definition.type&255,multiplier=definition.style&1024?2:1;need(!(definition.style&2048),'مضاعف القياس غير مدعوم.');
   function point(at){need(at+24<=raw.length-8,'Truncated dimension selector');const s=v(raw.subarray(at,at+24)),mode=s.getUint16(0,true),flags=s.getUint16(2,true),id=s.getUint16(8,true),secondId=s.getUint16(10,true),parameter=s.getFloat32(12,true),o=operand(id);need(s.getUint32(4,true)===0&&s.getUint32(16,true)===0&&s.getUint32(20,true)===0,'Unknown dimension selector fields');
    if(mode===1){need(!o.geometryKind&&o.points.length===1&&flags===256&&secondId===1&&parameter===0,'Unsupported dimension point selector');return o.points[0].slice();}
    if(mode===2){need(flags===512&&secondId===0&&Number.isFinite(parameter)&&parameter>=0&&parameter<=1,'Unsupported dimension fraction');const ps=path(o);return parameter===0?ps[0].slice():parameter===1?ps.at(-1).slice():pointOnConstructionCurve(ps,length(ps)*parameter,true);}
    if(mode===6){need(flags===0&&Number.isFinite(parameter)&&parameter>=0&&parameter<=1,'Unsupported dimension intersection hint');const second=operand(secondId);return uniqueConstructionIntersection(path(o),path(second),{extendA:o.geometryKind?[]:[0,1],extendB:second.geometryKind?[]:[0,1]}).point;}
    if(mode===4){const ps=path(o),total=length(ps);need([512,767].includes(flags)&&secondId===0&&Number.isFinite(parameter)&&parameter>=0&&parameter<=total,'Unsupported dimension distance selector');return pointOnConstructionCurve(ps,parameter,flags===767);}
    throw Error('محدد نقطة القياس غير مدعوم: '+mode);
   }
   let value,selectedPoints;
   if(kind===13){const count=definition.format>>>8;need(count>=2&&count<=64&&raw.length===40+count*16&&raw.subarray(raw.length-16,raw.length-8).every(n=>n===0),'Unsupported chain dimension layout');value=0;selectedPoints=[];for(let i=0;i<count;i++){const at=24+16*i,flags=q.getUint32(at,true),hint=q.getFloat32(at+12,true);need([0,0xff000000].includes(flags)&&q.getUint32(at+4,true)===0&&Number.isFinite(hint)&&hint>=0&&hint<=1,'Unsupported chain dimension source');const ps=path(operand(q.getUint32(at+8,true)));value+=length(ps);selectedPoints.push(ps[0].slice(),ps.at(-1).slice());}}
   else if(kind===6){need(definition.format===6&&raw.length===56&&q.getUint32(24,true)===0&&q.getUint32(28,true)===0&&q.getUint32(40,true)===0&&q.getUint32(44,true)===0,'Unsupported whole-path dimension fields');const hint=q.getFloat32(36,true);need(Number.isFinite(hint)&&hint>=0&&hint<=1,'Invalid dimension path pick');const o=operand(q.getUint32(32,true)),ps=path(o);value=length(ps);selectedPoints=[ps[0].slice(),ps.at(-1).slice()];}
   else if(kind===9){need(definition.format===6&&raw.length===104&&raw.subarray(72,80).every(n=>n===0)&&raw.subarray(88,96).every(n=>n===0),'Unsupported partial-length dimension');const id=q.getUint32(80,true),hint=q.getFloat32(84,true);need(Number.isFinite(hint)&&hint>=0&&hint<=1,'Invalid partial-length pick');const ps=path(operand(id)),total=length(ps);selectedPoints=[point(24),point(48)];const position=at=>{need(q.getUint16(at+8,true)===id&&q.getUint16(at+10,true)===0,'Partial-length references differ');const mode=q.getUint16(at,true),flags=q.getUint16(at+2,true),t=q.getFloat32(at+12,true);need([2,4].includes(mode),'Unsupported partial-length selector');return mode===2?t*total:flags===767?t:total-t;};value=Math.abs(position(24)-position(48));}
   else{need(definition.format===6&&raw.length===88,'Unsupported two-point dimension layout');selectedPoints=[point(24),point(48)];need(raw.subarray(72,80).every(n=>n===0),'Unknown dimension tail');const[a,b]=selectedPoints;value=kind===1?distance(a,b):Math.abs(b[kind===2?0:1]-a[kind===2?0:1]);}
   need(Number.isFinite(value)&&value>=0&&value<=1e6,'Invalid calculated measurement');const displayedValue=value*multiplier,label=String(roundedDimensionValue(displayedValue))+(multiplier===2?' (2*)':'');return{...definition,status:'calculated',value,displayedValue,multiplier,label,unit:'mm',selectedPoints,sourceObjectIds:[...new Set(dependencies)],nativeCompatibilityVerified:false};
  }catch(error){return{...definition,status:'unsupported',reason:error.message,sourceObjectIds:[...new Set(dependencies)]};}
 });return{partId,sizeKey,entries,calculated:entries.filter(e=>e.status==='calculated').length,total:entries.length,usesCachedGeometryInputs:false,readOnly:true,canSaveGeometry:false,fullIndependentGeometry:false};
}
