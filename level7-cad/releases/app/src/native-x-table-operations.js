/** Structural changes to verified plain VA X tables. No geometry is rewritten. */
import {parseMdl,serializeMdl} from './native-mdl.js';
import {readNativeXValues} from './native-x-values.js';
import {readNativeZValues} from './native-z-values.js';
import {validateScalarFormula} from './native-alaa-z-scalars.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),key=b=>b.id.join('.');
function join(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
function check(b){let n=0;const v=dv(b);for(let i=4;i<b.length;i+=2){n=(n+Math.imul(i/2+1,v.getInt16(i,true)))|0;if(n>=1024000000)n-=1024000000;}return n>>>0;}
function replace(source,doc,target,payload){
 const sections=doc.blocks.map(b=>{if(key(b)!==target)return source.slice(b.offset,b.endOffset);const out=join([source.subarray(b.offset,b.payloadOffset),payload]);dv(out).setUint32(4,out.length/8,true);dv(out).setUint32(0,check(out),true);return out;});
 const bytes=join([source.subarray(0,80),...sections,source.subarray(-8)]);dv(bytes).setUint32(4,bytes.length/8-1,true);dv(bytes).setUint32(0,check(bytes.subarray(0,80)),true);const result=parseMdl(bytes);
 need(result.blocks.length===doc.blocks.length,'Unexpected block count');
 for(let i=0;i<doc.blocks.length;i++){const a=doc.blocks[i],b=result.blocks[i];need(key(a)===key(b),'Unexpected block order');if(key(a)!==target)need(source.subarray(a.offset,a.endOffset).every((v,j)=>v===bytes[b.offset+j])&&a.endOffset-a.offset===b.endOffset-b.offset,'Unrelated native block changed');}
 return result;
}
function scalarRow(index,value){need(Number.isFinite(value)&&Math.abs(value)<=1e9,'X must be a finite number within ±1e9.');const b=new Uint8Array(24);dv(b).setUint32(0,3,true);dv(b).setUint16(4,index,true);b.fill(32,6,14);dv(b).setFloat32(16,Math.fround(value),true);return b;}
export function applyNativeXTableOperations(document,operations,{formulaEdits=[]}={}){
 need(Array.isArray(operations)&&operations.length<=160,'Too many X table operations');
 let doc=parseMdl(serializeMdl(document));need(doc.variant==='VA','Only verified VA tables support structural editing');const added=new Set(),changes=[];
 for(const op of operations){
  const {partId,scope,action}=op;need(Number.isInteger(partId)&&partId>0&&['global','local'].includes(scope),'Invalid X table identity');
  const table=readNativeXValues(doc,{partId}),rows=table[scope+'Entries'],id=scope==='global'?'2.3.0.0':`3.${partId}.3.1`,identity=scope==='global'?'global':`local:${partId}`;
  need(table.tables[scope].status==='available','إنشاء جدول X غير موجود بعد غير مدعوم؛ اختر جدولًا موجودًا ومقروءًا.');
  const source=serializeMdl(doc),block=doc.blocks.find(b=>key(b)===id),indices=[...new Set(rows.map(r=>r.index))],last=indices.at(-1)||0;
  need(indices.every((n,i)=>n===i+1),'A contiguous native X table is required');let next=rows.map(r=>r.rawEntry),index;
  if(action==='add'){
   need(last<80,'Maximum 80 X values');index=last+1;next.push(scalarRow(index,op.value??0));added.add(identity+':'+index);
  }else if(action==='delete-last'){
   index=last;need(index>1,'احتفظ بقيمة X واحدة على الأقل في الجدول.');
   // An add followed by delete is a reversal of our own table-only operation.
   // For pre-existing entries, unknown construction consumers cannot be certified absent.
   if(!added.has(identity+':'+index)){
    const affected=doc.blocks.filter(b=>b.id[0]===3&&(scope==='global'||b.id[1]===partId));
    need(!affected.some(b=>b.id[2]===2&&b.payloadSize>0||b.id[2]===3&&b.id[3]!==1&&b.payloadSize>0),'لا يمكن حذف X قديمة قبل التحقق من مراجعها في سجل الإنشاء. يمكن حذف الإضافات الجديدة غير المستخدمة في هذه الجلسة.');
   }
   const affectedIds=[...new Set(doc.blocks.filter(b=>b.id[0]===3&&(scope==='global'||b.id[1]===partId)).map(b=>b.id[1]))],name=(scope==='global'?'XG':'X')+index;
   for(const p of affectedIds){const z=readNativeZValues(doc,{partId:p});need(z.tableStatus==='available'||z.tableStatus==='absent','Unknown Z table prevents deletion');for(const row of z.entries){need(!row.opaque,'Unknown Z definition prevents deletion');const f=formulaEdits.find(e=>e.kind==='Z'&&e.partId===p&&e.index===row.index)?.formula??row.formula;need(!validateScalarFormula(/^X[1-9]\d*\/$/i.test(f)?f.slice(0,-1):f).references.includes(name),`${name} مستخدمة في Z${row.index} بالبارت ${p}.`);}}
   next=rows.filter(r=>r.index!==index).map(r=>r.rawEntry);added.delete(identity+':'+index);
  }else if(action==='remove-size'){
   index=op.index;const target=rows.find(r=>r.index===index&&r.sizeKey===op.sizeKey);need(target&&!target.isDefault,'اختر صف مقاس محدد؛ القيمة الافتراضية لا تُحذف بهذا الأمر.');need(rows.some(r=>r.index===index&&r.isDefault),'لا يمكن إزالة المقاس دون قيمة افتراضية.');next=rows.filter(r=>r!==target).map(r=>r.rawEntry);
  }else throw Error('Unknown X table operation');
  // Preserve the exact reserved terminal slot when X80 remains present.
  const used=rows.reduce((n,r)=>n+r.byteLength,0),tail=source.slice(block.payloadOffset+used,block.endOffset);if(tail.length&&!(action==='delete-last'&&last===80))next.push(tail);
  doc=replace(source,doc,id,join(next));const after=readNativeXValues(doc,{partId});need(after.tables[scope].status==='available','Edited X table failed validation');changes.push({...op,index});
 }
 return {document:doc,bytes:serializeMdl(doc),changes,geometryRecalculated:false,requiresGrafisRecalculation:true};
}
