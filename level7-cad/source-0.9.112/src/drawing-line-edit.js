import * as owned from './native-owned-parts.js';
import * as literal from './native-part-drawing.js';
import {readCachedPreview} from './native-cache-preview.js';
import {transformLine} from './line-transform.js';
export async function editDrawingLine(doc,{partId,objectId,dx,dy,action,anchor,value,axis}){
 if(!['move','copy','length','rotate','mirror-copy'].includes(action))throw Error('عملية غير مدعومة.');
 if(['move','copy'].includes(action)&&(![dx,dy].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000)||(!dx&&!dy)))throw Error('اختر العملية وأدخل إزاحة غير صفرية بين −1000 و1000 مم.');
 const n=await owned.inspectExperimentalParametricEngine(doc,{partId}),g=n.eligible?null:await literal.inspectPartDrawing(doc,{partId});
 if(!n.eligible&&!g?.eligible)throw Error(g?.reason||'Drawing unavailable');
 if(action==='move')return n.eligible?owned.moveExperimentalLine(doc,{partId,objectId,dx,dy}):literal.movePartLine(doc,{partId,objectId,dx,dy});
 let line=(n.eligible?n.objects:g.newObjects).find(o=>o.kind==='line'&&o.objectId===objectId);
 if(!line&&!n.eligible&&['copy','mirror-copy'].includes(action)){const cached=readCachedPreview(doc,{partId}).objects.find(o=>o.objectId===objectId&&o.kind==='sample-path'&&o.points.length===2);if(cached)line={a:cached.points[0],b:cached.points[1]};}
 if(!line)throw Error('اختر خطًا مستقيمًا مدعومًا في البارت الحالي.');
 const args={partId,objectId,...(action==='copy'?{start:{x:line.a.x+dx,y:line.a.y+dy},end:{x:line.b.x+dx,y:line.b.y+dy}}:transformLine(line,{action,anchor,value,axis}))};
 if(['length','rotate'].includes(action))return n.eligible?owned.reshapeExperimentalLine(doc,args):literal.reshapePartLine(doc,args);
 return n.eligible?owned.appendExperimentalBoundSegment(doc,args):literal.appendPartSegment(doc,args);
}
