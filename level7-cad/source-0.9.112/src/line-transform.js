// Numeric edits of straight endpoints, not new native dependency opcodes.
const need=(ok,message)=>{if(!ok)throw Error(message);};
const finite=(x,limit=1e6)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=limit;
export function transformLine(line,{action,anchor='start',value,axis='vertical'}){
  need(line&&[line.a?.x,line.a?.y,line.b?.x,line.b?.y].every(x=>finite(x)),'اختر خطًا مستقيمًا صالحًا.');
  need(['start','end','center'].includes(anchor),'اختر بداية الخط أو نهايته أو منتصفه.');
  const {a,b}=line,length=Math.hypot(b.x-a.x,b.y-a.y);
  need(length>0,'الخط يحتاج طرفين مختلفين.');
  const pivot=anchor==='start'?a:anchor==='end'?b:{x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  let convert;
  if(action==='length'){
    need(finite(value)&&value>0,'أدخل طولًا أكبر من صفر وحتى 1000000 مم.');
    convert=p=>({x:pivot.x+(p.x-pivot.x)*value/length,y:pivot.y+(p.y-pivot.y)*value/length});
  }else if(action==='rotate'){
    need(finite(value,360)&&value!==0,'أدخل زاوية غير صفرية بين −360 و360 درجة.');
    // Exact quadrant coefficients avoid displacing a fixed/bound coordinate by roundoff.
    const q=value/90,rad=value*Math.PI/180,c=Number.isInteger(q)?[1,0,-1,0][((q%4)+4)%4]:Math.cos(rad),s=Number.isInteger(q)?[0,1,0,-1][((q%4)+4)%4]:Math.sin(rad);
    convert=p=>({x:pivot.x+(p.x-pivot.x)*c-(p.y-pivot.y)*s,y:pivot.y+(p.x-pivot.x)*s+(p.y-pivot.y)*c});
  }else if(action==='mirror-copy'){
    need(['vertical','horizontal'].includes(axis)&&finite(value),'أدخل موضع محور الانعكاس بالمليمتر.');
    convert=p=>axis==='vertical'?{x:2*value-p.x,y:p.y}:{x:p.x,y:2*value-p.y};
  }else throw Error('عملية تحويل غير مدعومة.');
  const points=[a,b].map(p=>{const q=convert(p);need(finite(q.x)&&finite(q.y),'نتيجة التحويل خارج نطاق الإحداثيات.');return{x:Math.fround(q.x),y:Math.fround(q.y)};});
  need(points[0].x!==points[1].x||points[0].y!==points[1].y,'التحويل يجعل طول الخط صفرًا عند الحفظ.');
  need(points[0].x!==a.x||points[0].y!==a.y||points[1].x!==b.x||points[1].y!==b.y,'التحويل لا يغير الخط بدقة الحفظ الحالية.');
  return{start:points[0],end:points[1]};
}
