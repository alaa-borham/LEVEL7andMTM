const need=(ok,m)=>{if(!ok)throw Error(m);},finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6;
export function resolveConstructionPosition({position,mode='free',points=[],lines=[],radius=8,step=0,value='',x='',y='',fromEnd=false,shift=false,operand}={}){
 need(position&&finite(position.x)&&finite(position.y)&&Number.isFinite(radius)&&radius>0&&Number.isFinite(step)&&step>=0&&step<=1000,'موضع أو شبكة غير صالحة.');const grid=n=>step?Math.round(n/step)*step:n,parse=(s,fallback)=>{if(String(s).trim()==='')return fallback;const n=Number(s);need(finite(n),'أدخل قيمة عددية صحيحة.');return n;};
 const point=points.map(p=>({...p,d:Math.hypot(p.x-position.x,p.y-position.y)})).filter(p=>p.d<=radius).sort((a,b)=>a.d-b.d)[0];
 if(mode==='point'||mode==='free'&&point)return point?{x:point.x,y:point.y,pointId:point.id??point.objectId}:null;
 if(mode==='xy'){const a=operand?operand(x,position.x):{value:parse(x,position.x)},b=operand?operand(y,position.y):{value:parse(y,position.y)};return{x:a.operand||String(x).trim()?a.value:grid(a.value),y:b.operand||String(y).trim()?b.value:grid(b.value),...(a.operand?{xOperand:a.operand}:{}),...(b.operand?{yOperand:b.operand}:{}),pointConstruction:true};}
 const choices=lines.map(l=>{const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,length=Math.hypot(dx,dy);if(length<1e-7)return null;const t=Math.max(0,Math.min(1,((position.x-l.a.x)*dx+(position.y-l.a.y)*dy)/length**2)),q={x:l.a.x+t*dx,y:l.a.y+t*dy};return{l,length,t,d:Math.hypot(q.x-position.x,q.y-position.y)};}).filter(l=>l&&l.d<=radius).sort((a,b)=>a.d-b.d);
 if(['line','fraction','distance'].includes(mode)||mode==='free'&&choices.length){const pick=choices[0];if(!pick)return null;const{l,length}=pick;let t=pick.t,type=mode==='distance'?'distance':'fraction',n;
  if(shift){t=t<.5?0:1;type='fraction';n=t;}else if(type==='distance'){n=String(value).trim()?parse(value,0):grid((fromEnd?1-t:t)*length);need(n>=0&&n<=length,'المسافة تتجاوز طول المسار المرجعي.');t=fromEnd?1-n/length:n/length;}else{n=mode==='fraction'?(String(value).trim()?parse(value,0):grid((fromEnd?1-t:t)*100))/100:t;need(n>=0&&n<=1,'النسبة من صفر إلى 100٪.');t=mode==='fraction'&&fromEnd?1-n:n;}
  return{x:l.a.x+t*(l.b.x-l.a.x),y:l.a.y+t*(l.b.y-l.a.y),constructionBinding:{lineId:l.id??l.objectId,type,value:type==='distance'?n:t,fromEnd:type==='distance'&&fromEnd},sourceId:l.id??l.objectId,fraction:t};
 }
 return{x:grid(position.x),y:grid(position.y)};
}
