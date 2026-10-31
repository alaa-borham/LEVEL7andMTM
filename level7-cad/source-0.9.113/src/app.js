import { uid, newProject, makePiece, pieceBounds, projectBounds, sampleOutline, outlinePath, seamOutline, areaOfPiece, perimeterOfPiece, transformPiece, gradePiece, generateBlock, regenerateProject, validateProject } from './geometry.js';
import { serializeProject, parseProject, exportSvg, exportDxf, importDxf, exportHpgl, parseMeasurementTable } from './io.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const round = (n, digits=1) => Number(n.toFixed(digits));
const colors = ['#c98367','#a58ec0','#246d61','#548cac','#a59c54'];
const measurementLabels = {waist:'محيط الخصر',hip:'محيط الأرداف',bust:'محيط الصدر',neck:'محيط الرقبة',backLength:'طول الظهر',shoulder:'طول الكتف',armholeDepth:'عمق حردة الإبط',skirtLength:'طول التنورة',trouserLength:'طول البنطلون',inseam:'طول الرجل الداخلي',ease:'الراحة الكلية'};
const measurementLimits={waist:[100,4000],hip:[100,4500],bust:[100,4500],neck:[100,1500],backLength:[80,1500],shoulder:[20,600],armholeDepth:[40,800],skirtLength:[100,2500],trouserLength:[200,2500],inseam:[80,2000],ease:[0,800]};
const svg = $('#drawing');
let project = newProject();
let selected = null, selectedPoint = null, tool = 'select', draft = [], pointerWorld = {x:0,y:0};
let drag = null, undoStack = [], redoStack = [], zoom = 0.65, pan = {x:120,y:100}, toastTimer;
let currentTab='pieces', dirty=false, measurementsDirty=false;
try {
  const saved = localStorage.getItem('pattern-studio-project-v1');
  if (saved) project = parseProject(saved);
  else { project.name='تجربة باترون تنورة'; project.pieces=generateBlock('skirt',project.measurements); }
} catch { project=newProject(); }
selected=project.pieces[0]?.id ?? null;

function notify(message, duration=4200) {
  $('#toast').textContent=message; $('#toast').hidden=false;
  $('#status').textContent=message;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,duration);
}
function autosave() {
  try { localStorage.setItem('pattern-studio-project-v1',serializeProject(project)); $('#saveState').textContent='حفظ تلقائي على هذا الجهاز'; }
  catch { $('#saveState').textContent='احفظ المشروع إلى ملف لحماية عملك'; }
}
function recordBefore(before,label) {
  undoStack.push(before); if(undoStack.length>80) undoStack.shift(); redoStack=[];
  project.operations ??=[]; project.operations.push({label,at:new Date().toISOString()});
  if(project.operations.length>200) project.operations.shift();
  dirty=true; autosave();
}
function commit(label,mutation) {
  const before=clone(project);
  try { mutation(); validateProject(project); recordBefore(before,label); render(); return true; }
  catch(error) { project=before; const message=String(error.message??'تعذر تنفيذ العملية'),key=Object.keys(measurementLabels).find(k=>new RegExp(`\\b${k}\\b`).test(message)); notify(key?`تحقق من ${measurementLabels[key]}: المجال ${measurementLimits[key][0]} إلى ${measurementLimits[key][1]} mm.`:message); render(); return false; }
}
function currentPiece() { return project.pieces.find(p=>p.id===selected); }
function pointLocal(world,piece) {return {x:world.x-(piece.offset?.x??0),y:world.y-(piece.offset?.y??0)};}
function eventWorld(e,snap=true) {
  const r=svg.getBoundingClientRect(); let x=(e.clientX-r.left-pan.x)/zoom,y=(e.clientY-r.top-pan.y)/zoom;
  if(snap && $('#snapGrid').checked && !e.altKey) { x=Math.round(x/5)*5; y=Math.round(y/5)*5; }
  return {x,y};
}
function setTool(next) {
  tool=next; draft=[];
  document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  svg.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';
  const hints={select:'حدد قطعة أو نقطة لتعديلها',pan:'اسحب لتحريك مساحة العمل',line:'انقر نقاط المحيط · Enter للإنهاء · انقر البداية للإغلاق',curve:'انقر البداية، المقبض الأول، المقبض الثاني، ثم النهاية',rectangle:'انقر زاويتين للمستطيل',notch:'انقر قرب حافة قطعة لإضافة علامة تطابق',grain:'حدد قطعة، ثم انقر طرفي اتجاه النسيج',measure:'انقر نقطتين لقياس المسافة'};
  $('#canvasHint').textContent=hints[tool]; renderCanvas();
}
function setTab(tab) {
  currentTab=tab;
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  ['pieces','measurements','history'].forEach(t=>$(`#${t}Tab`).hidden=t!==tab);
}
function render() { renderPanels(); renderCanvas(); }
function renderPanels() {
  $('#projectName').value=project.name;
  $('#pieceCount').textContent=project.pieces.length;
  $('#undoBtn').disabled=!undoStack.length; $('#redoBtn').disabled=!redoStack.length;
  $('#pieceList').innerHTML=project.pieces.length?project.pieces.map((p,i)=>{
    const b=pieceBounds(p),pad=12;
    return `<button class="piece-item ${p.id===selected?'selected':''}" data-select="${esc(p.id)}"><svg class="piece-preview" viewBox="${b.minX-pad} ${b.minY-pad} ${Math.max(b.width+pad*2,1)} ${Math.max(b.height+pad*2,1)}"><path d="${outlinePath(p)}"/></svg><span><strong>${esc(p.name)}</strong><small>${round(b.width)} × ${round(b.height)} mm</small></span><span class="piece-number">${String(i+1).padStart(2,'0')}</span></button>`;
  }).join(''):'<div class="empty-list">لا توجد قطع بعد.<br>ارسم محيطًا أو أضف باترونًا من القياسات.</div>';
  const p=currentPiece();
  if(!p) $('#pieceInspector').innerHTML='<button class="primary full" data-action="block">＋ إضافة باترون من القياسات</button>';
  else {
    const pt=p.points.find(point=>point.id===selectedPoint),b=pieceBounds(p);
    $('#pieceInspector').innerHTML=`<hr><div class="section-heading"><h2>خصائص القطعة</h2>${p.generator?'<span class="badge">مرتبطة بالقياسات</span>':''}</div><label class="field-stack subtle">اسم القطعة<input id="pieceName" type="text" maxlength="100" value="${esc(p.name)}"></label><label class="field">بدل الخياطة <input id="pieceSeam" type="number" min="0" max="100" step="1" value="${p.seamAllowance??0}"><span>mm</span></label><label class="field">عدد مرات القص <input id="pieceQuantity" type="number" min="1" max="100" value="${p.quantity??1}"></label><label class="field"><span>قص على ثنية القماش</span><input id="pieceFold" type="checkbox" ${p.onFold?'checked':''}></label><div class="two-fields"><label>X mm<input id="pieceOffsetX" type="number" value="${round(p.offset?.x??0)}"></label><label>Y mm<input id="pieceOffsetY" type="number" value="${round(p.offset?.y??0)}"></label></div><p class="subtle" style="margin-top:13px">المحيط ${round(perimeterOfPiece(p))} mm · المساحة ${round(areaOfPiece(p)/100,1)} cm²<br>${p.closed?'محيط مغلق':'خط مفتوح'} · ${p.points.length} نقاط</p><div class="inline-actions"><button data-action="duplicate">نسخ</button><button data-action="close">${p.closed?'فتح المحيط':'إغلاق المحيط'}</button><button data-action="delete">حذف</button></div>${pt?`<hr><div class="point-heading"><h3>النقطة ${p.points.indexOf(pt)+1}</h3><span class="unit">mm</span></div><div class="two-fields"><label>X<input id="pointX" type="number" step="0.1" value="${round(pt.x)}"></label><label>Y<input id="pointY" type="number" step="0.1" value="${round(pt.y)}"></label></div><h3 style="margin-top:17px">فرق النقطة لكل مقاس</h3><div class="two-fields"><label>ΔX<input id="gradeX" type="number" step="0.1" value="${pt.grade?.dx??0}"></label><label>ΔY<input id="gradeY" type="number" step="0.1" value="${pt.grade?.dy??0}"></label></div><div class="inline-actions"><button data-action="smooth">تنعيم النقطة</button><button data-action="corner">زاوية حادة</button></div>`:'<p class="subtle">انقر نقطة على القطعة لتعديل إحداثياتها وتدريجها.</p>'}`;
  }
  if(!measurementsDirty) $('#measurementsForm').innerHTML=Object.entries(measurementLabels).map(([key,label])=>`<label class="field">${label}<input name="${key}" type="number" min="${measurementLimits[key][0]}" max="${measurementLimits[key][1]}" step="1" value="${project.measurements[key]??0}" required></label>`).join('');
  $('#sizeStep').value=project.sizeStep??40;
  $('#sizeLegend').innerHTML=(project.sizes??[-2,-1,0,1,2]).map((s,i)=>`<span style="color:${colors[i%5]}">${s===0?'الأساسي':s>0?'+'+s:s}</span>`).join('');
  $('#historyList').innerHTML=(project.operations??[]).slice().reverse().map(op=>`<li>${esc(op.label)} <time>${new Date(op.at).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}</time></li>`).join('') || '<li>لم تُسجل عمليات بعد</li>';
  $('#selectionStatus').textContent=p?`${p.name}${selectedPoint?' · نقطة محددة':''}`:'لا يوجد تحديد';
}
function polyPath(points,closed=true) {return points.length?points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+(closed?' Z':''):'';}
function cubicPoint(a,b,t) {
  const c=a.out??a,d=b.in??b,u=1-t;
  return {x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y};
}
function edgePoint(piece,edge,t) {return cubicPoint(piece.points[edge],piece.points[(edge+1)%piece.points.length],t);}
function renderCanvas() {
  const w=svg.clientWidth||1000,h=svg.clientHeight||700,stroke=1.4/zoom,font=10/zoom;
  const worldBox={x:-pan.x/zoom,y:-pan.y/zoom,w:w/zoom,h:h/zoom};
  let content=`<defs><pattern id="minorGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0 H0 V10" fill="none" stroke="#dfe5da" stroke-width="${0.5/zoom}"/></pattern><pattern id="majorGrid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#minorGrid)"/><path d="M100 0 H0 V100" fill="none" stroke="#cdd8ca" stroke-width="${0.8/zoom}"/></pattern><marker id="grainArrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#6b806c" stroke-width="1"/></marker></defs><rect width="100%" height="100%" fill="#f5f6f0"/><g transform="translate(${pan.x},${pan.y}) scale(${zoom})">`;
  if($('#showGrid').checked) content+=`<rect x="${worldBox.x}" y="${worldBox.y}" width="${worldBox.w}" height="${worldBox.h}" fill="url(#majorGrid)"/>`;
  let gradedContent='';
  if($('#showGrading').checked) for(const piece of project.pieces) for(const [i,step] of (project.sizes??[-2,-1,0,1,2]).entries()) {
    if(step===0) continue;
    try {const g=gradePiece(piece,step,project); gradedContent+=`<path class="graded-outline" d="${outlinePath(g)}" transform="translate(${g.offset?.x??0},${g.offset?.y??0})" fill="none" stroke="${colors[i%5]}" stroke-width="${.85/zoom}" opacity=".8" stroke-dasharray="${3/zoom} ${3/zoom}" pointer-events="none"/>`;}catch{}
  }
  for(const [index,p] of project.pieces.entries()) {
    const b=pieceBounds(p),active=p.id===selected,col=active?'#277e68':'#779384';
    content+=`<g data-piece="${esc(p.id)}" transform="translate(${p.offset?.x??0},${p.offset?.y??0})"><path class="piece-path" d="${outlinePath(p)}" fill="${p.closed?(active?'#f9fffb':'#fffef9'):'none'}" stroke="${col}" stroke-width="${active?stroke:1/zoom}"/><path d="${outlinePath(p)}" fill="none" stroke="transparent" stroke-width="${12/zoom}" class="piece-path"/>`;
    const seam=seamOutline(p); if(seam.length) content+=`<path d="${polyPath(seam)}" fill="none" stroke="#a4b39b" stroke-width="${.8/zoom}" stroke-dasharray="${4/zoom} ${3/zoom}" pointer-events="none"/>`;
    for(const internal of p.internalLines??[]) content+=`<path d="${polyPath(internal.points,false)}" fill="none" stroke="#8aa092" stroke-width="${.85/zoom}" stroke-dasharray="${3/zoom} ${2/zoom}"/>`;
    if(p.grain) content+=`<line x1="${p.grain.a.x}" y1="${p.grain.a.y}" x2="${p.grain.b.x}" y2="${p.grain.b.y}" stroke="#6b806c" stroke-width="${1/zoom}" marker-start="url(#grainArrow)" marker-end="url(#grainArrow)"/>`;
    for(const n of p.notches??[]) {
      if(!p.points[n.edge]) continue;
      const a=edgePoint(p,n.edge,n.t),a2=edgePoint(p,n.edge,Math.min(1,n.t+.01)),len=Math.hypot(a2.x-a.x,a2.y-a.y)||1,depth=n.depth??5;
      content+=`<path d="M${a.x},${a.y} l${-(a2.y-a.y)/len*depth},${(a2.x-a.x)/len*depth}" stroke="#485f56" fill="none" stroke-width="${1.2/zoom}"/>`;
    }
    const textX=b.minX+b.width/2,textY=b.minY+b.height*.58;
    content+=`<text x="${textX}" y="${textY}" text-anchor="middle" font-size="${font}" fill="#6f8778" pointer-events="none">${esc(p.name)}</text><text x="${textX}" y="${textY+16/zoom}" text-anchor="middle" font-size="${8/zoom}" fill="#9aa897" pointer-events="none">${String(index+1).padStart(2,'0')} · ×${p.quantity??1}${p.onFold?' · ثنية':''}</text>`;
    if($('#showDimensions').checked) {
      content+=`<path d="M${b.minX},${b.maxY+12/zoom} H${b.maxX} M${b.maxX+12/zoom},${b.minY} V${b.maxY}" fill="none" stroke="#abb6a6" stroke-width="${.6/zoom}"/><text class="dimension-text" x="${textX}" y="${b.maxY+25/zoom}" text-anchor="middle" font-size="${9/zoom}">${round(b.width)} mm</text><text class="dimension-text" x="${b.maxX+20/zoom}" y="${b.minY+b.height/2}" font-size="${9/zoom}" transform="rotate(90 ${b.maxX+20/zoom} ${b.minY+b.height/2})" text-anchor="middle">${round(b.height)} mm</text>`;
    }
    if(active) for(const pt of p.points) {
      if(pt.id===selectedPoint) for(const which of ['in','out']) if(pt[which]) content+=`<line x1="${pt.x}" y1="${pt.y}" x2="${pt[which].x}" y2="${pt[which].y}" stroke="#91b5a4" stroke-width="${.8/zoom}"/><circle class="handle" data-point="${esc(pt.id)}" data-handle="${which}" cx="${pt[which].x}" cy="${pt[which].y}" r="${4/zoom}" fill="#fff" stroke="#57a28c" stroke-width="${1/zoom}"/>`;
      content+=`<rect class="anchor" data-point="${esc(pt.id)}" x="${pt.x-3.2/zoom}" y="${pt.y-3.2/zoom}" width="${6.4/zoom}" height="${6.4/zoom}" fill="${pt.id===selectedPoint?'#245d4d':'#fbfff9'}" stroke="#428c70" stroke-width="${1/zoom}"/>`;
    }
    content+='</g>';
  }
  content+=gradedContent;
  for(const dim of project.dimensions??[]) content+=dimensionSvg(dim.a,dim.b,zoom);
  if(draft.length) {
    if(tool==='curve') {const pts=[...draft,pointerWorld];content+=`<path d="${polyPath(pts,false)}" fill="none" stroke="#bda16e" stroke-width="${1/zoom}" stroke-dasharray="${4/zoom} ${3/zoom}"/>`; if(pts.length===4) content+=`<path d="M${pts[0].x} ${pts[0].y} C${pts[1].x} ${pts[1].y} ${pts[2].x} ${pts[2].y} ${pts[3].x} ${pts[3].y}" fill="none" stroke="#297e67" stroke-width="${1.5/zoom}"/>`;}
    else if(tool==='rectangle') content+=`<rect x="${Math.min(draft[0].x,pointerWorld.x)}" y="${Math.min(draft[0].y,pointerWorld.y)}" width="${Math.abs(draft[0].x-pointerWorld.x)}" height="${Math.abs(draft[0].y-pointerWorld.y)}" fill="#acd7b12b" stroke="#297e67" stroke-width="${1/zoom}"/>`;
    else content+=`<path d="${polyPath([...draft,pointerWorld],false)}" fill="none" stroke="#297e67" stroke-width="${1.3/zoom}" stroke-dasharray="${4/zoom} ${3/zoom}"/>`;
    for(const p of draft) content+=`<circle cx="${p.x}" cy="${p.y}" r="${3/zoom}" fill="#26765d"/>`;
  }
  content+='</g>';
  // Screen-space ruler numbers, so their text stays readable at every zoom.
  const tickStep=zoom<.4?200:zoom<1.2?100:50;
  for(let x=Math.ceil(worldBox.x/tickStep)*tickStep;x<worldBox.x+worldBox.w;x+=tickStep) content+=`<text x="${pan.x+x*zoom}" y="12" font-size="8" fill="#95a38f" text-anchor="middle">${x}</text>`;
  for(let y=Math.ceil(worldBox.y/tickStep)*tickStep;y<worldBox.y+worldBox.h;y+=tickStep) content+=`<text x="5" y="${pan.y+y*zoom}" font-size="8" fill="#95a38f">${y}</text>`;
  svg.innerHTML=content; $('#zoomLabel').textContent=Math.round(zoom*100)+'%';
}
function dimensionSvg(a,b,z) {
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},d=Math.hypot(b.x-a.x,b.y-a.y);
  return `<g pointer-events="none"><path d="M${a.x},${a.y} L${b.x},${b.y}" fill="none" stroke="#b38046" stroke-width="${1/z}" stroke-dasharray="${3/z} ${2/z}"/><circle cx="${a.x}" cy="${a.y}" r="${2/z}" fill="#b38046"/><circle cx="${b.x}" cy="${b.y}" r="${2/z}" fill="#b38046"/><text x="${mid.x}" y="${mid.y-7/z}" text-anchor="middle" font-size="${11/z}" fill="#9d702d">${round(d)} mm</text></g>`;
}
function fit() {
  const b=projectBounds(project.pieces); const w=svg.clientWidth,h=svg.clientHeight;
  if(!project.pieces.length) {zoom=.8;pan={x:100,y:100};}
  else {zoom=Math.max(.05,Math.min(3,(w-160)/Math.max(b.width,100),(h-170)/Math.max(b.height,100)));pan={x:(w-b.width*zoom)/2-b.minX*zoom,y:(h-b.height*zoom)/2-b.minY*zoom};}
  renderCanvas();
}
function zoomAt(factor,screen={x:svg.clientWidth/2,y:svg.clientHeight/2}) {
  const old=zoom; zoom=Math.max(.04,Math.min(8,zoom*factor));
  pan={x:screen.x-(screen.x-pan.x)*zoom/old,y:screen.y-(screen.y-pan.y)*zoom/old}; renderCanvas();
}
function finalizeLine(closed=false) {
  if(draft.length<2 || closed&&draft.length<3) {draft=[];renderCanvas();return;}
  const pts=clone(draft);draft=[];
  commit(closed?'رسم قطعة مغلقة':'رسم خطوط',()=>{const p=makePiece(`قطعة ${project.pieces.length+1}`,pts,closed);project.pieces.push(p);selected=p.id;selectedPoint=null;});
}
svg.addEventListener('pointerdown',e=>{
  if(e.button===2) return; e.preventDefault();svg.focus();
  const world=eventWorld(e),raw=eventWorld(e,false);pointerWorld=world;
  const pieceId=e.target.closest('[data-piece]')?.dataset.piece,hit=project.pieces.find(p=>p.id===pieceId);
  if(e.button===1 || tool==='pan') {drag={type:'pan',start:{x:e.clientX,y:e.clientY},pan:{...pan}};svg.setPointerCapture(e.pointerId);return;}
  if(tool==='select') {
    if(hit) {
      selected=hit.id;selectedPoint=e.target.dataset.point??null;
      drag={type:selectedPoint?'point':'piece',point:selectedPoint,handle:e.target.dataset.handle,piece:hit.id,start:raw,before:clone(project),original:clone(hit),changed:false};
      svg.setPointerCapture(e.pointerId); renderPanels();renderCanvas();
    } else {selected=null;selectedPoint=null;render();}return;
  }
  if(tool==='line') {
    if(draft.length>=3 && Math.hypot(raw.x-draft[0].x,raw.y-draft[0].y)<10/zoom) finalizeLine(true);
    else {draft.push(world);renderCanvas();}return;
  }
  if(tool==='curve') {
    draft.push(world);
    if(draft.length===4) {const points=clone(draft);draft=[];commit('رسم منحنى بيزيه',()=>{const p=makePiece(`منحنى ${project.pieces.length+1}`,[{...points[0],out:points[1]},{...points[3],in:points[2]}],false);project.pieces.push(p);selected=p.id;});}else renderCanvas();return;
  }
  if(tool==='rectangle') {
    draft.push(world);if(draft.length===2) {const [a,b]=draft;draft=[];if(Math.abs(a.x-b.x)<1||Math.abs(a.y-b.y)<1){notify('اختر مستطيلًا أكبر من 1 mm');return;}commit('رسم مستطيل',()=>{const p=makePiece(`مستطيل ${project.pieces.length+1}`,[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}],true);project.pieces.push(p);selected=p.id;});}else renderCanvas();return;
  }
  if(tool==='measure') {
    draft.push(world);if(draft.length===2){const [a,b]=clone(draft);draft=[];commit('قياس مسافة',()=>{project.dimensions??=[];project.dimensions.push({a,b});});notify(`المسافة: ${round(Math.hypot(a.x-b.x,a.y-b.y))} mm`);}else renderCanvas();return;
  }
  if(tool==='grain') {
    if(hit && !draft.length) selected=hit.id;
    const p=currentPiece();if(!p){notify('حدد قطعة أولًا');return;}
    draft.push(world);if(draft.length===2){const [a,b]=draft;draft=[];commit('تعديل اتجاه النسيج',()=>{p.grain={a:pointLocal(a,p),b:pointLocal(b,p)};});}else render();return;
  }
  if(tool==='notch') {
    const p=hit??currentPiece();if(!p){notify('انقر قرب حافة قطعة');return;}const local=pointLocal(raw,p);let best={dist:Infinity};
    for(let edge=0;edge<p.points.length-(p.closed?0:1);edge++) for(let i=0;i<=40;i++){const t=i/40,q=edgePoint(p,edge,t),d=Math.hypot(q.x-local.x,q.y-local.y);if(d<best.dist)best={dist:d,edge,t};}
    if(best.dist>20/zoom){notify('انقر أقرب إلى حافة القطعة');return;}
    commit('إضافة علامة تطابق',()=>{p.notches??=[];p.notches.push({edge:best.edge,t:best.t,depth:5});selected=p.id;});
  }
});
svg.addEventListener('pointermove',e=>{
  const raw=eventWorld(e,false);pointerWorld=eventWorld(e);
  $('#coordinate').textContent=`X ${round(raw.x)} · Y ${round(raw.y)} mm`;
  if(drag?.type==='pan') {pan={x:drag.pan.x+e.clientX-drag.start.x,y:drag.pan.y+e.clientY-drag.start.y};renderCanvas();return;}
  if(drag) {
    const p=project.pieces.find(p=>p.id===drag.piece);if(!p)return;
    let dx=raw.x-drag.start.x,dy=raw.y-drag.start.y;
    if($('#snapGrid').checked&&!e.altKey){dx=Math.round(dx/5)*5;dy=Math.round(dy/5)*5;}
    if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}
    drag.changed=drag.changed||Math.abs(dx)>.01||Math.abs(dy)>.01;
    if(drag.type==='piece')p.offset={x:(drag.original.offset?.x??0)+dx,y:(drag.original.offset?.y??0)+dy};
    else {const pt=p.points.find(q=>q.id===drag.point),orig=drag.original.points.find(q=>q.id===drag.point);if(drag.handle)pt[drag.handle]={x:orig[drag.handle].x+dx,y:orig[drag.handle].y+dy};else {pt.x=orig.x+dx;pt.y=orig.y+dy;for(const key of ['in','out'])if(orig[key])pt[key]={x:orig[key].x+dx,y:orig[key].y+dy};}if(drag.changed)delete p.generator;}
    renderCanvas();return;
  }
  if(draft.length)renderCanvas();
});
function endDrag(e) {
  if(!drag)return;const done=drag;drag=null;
  if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
  if(done.changed){try{validateProject(project);recordBefore(done.before,done.type==='piece'?'نقل قطعة':'تعديل نقطة');}catch(error){project=done.before;notify(error.message);}}
  render();
}
svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
svg.addEventListener('contextmenu',e=>{e.preventDefault();if(tool==='line')finalizeLine(false);else{draft=[];renderCanvas();}});

async function ask(title,label,value,type='number') {
  const dialog=document.createElement('dialog');dialog.style.width='390px';
  dialog.innerHTML=`<form method="dialog"><div class="dialog-title"><h2>${esc(title)}</h2></div><label class="field-stack">${esc(label)}<input name="answer" type="${type}" value="${esc(value)}" step="0.1" required></label><div class="print-options"><button class="primary" value="ok">تطبيق</button><button value="cancel" formnovalidate>إلغاء</button></div></form>`;
  document.body.append(dialog);dialog.showModal();const input=dialog.querySelector('input');input.focus();input.select();
  return new Promise(resolve=>dialog.addEventListener('close',()=>{const result=dialog.returnValue==='ok'?input.value:null;dialog.remove();resolve(result);},{once:true}));
}
async function confirmAction(title) {return (await ask(title,'اكتب «نعم» للمتابعة','', 'text'))==='نعم';}
async function saveText(text,filename,kind='text') {
  if(window.desktop) {const result=await window.desktop.saveFile({text,filename,kind});if(result?.saved)notify('تم الحفظ: '+result.name);return result;}
  const blob=new Blob([text],{type:kind==='svg'?'image/svg+xml':'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);notify('تم تنزيل الملف');return {saved:true};
}
function safeName() {return (project.name??'pattern').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'pattern';}
async function openFile(forceMeasurement=false) {
  if(window.desktop){const file=await window.desktop.openFile({measurements:forceMeasurement});if(file)await readFile(file.text,file.name);}
  else {$('#fileInput').accept=forceMeasurement?'.csv,.mas':'.json,.dxf,.csv,.mas';$('#fileInput').click();}
}
async function readFile(text,name) {
  try {
    if(/\.(csv|mas)$/i.test(name)) {
      const result=parseMeasurementTable(text);const mapped=Object.fromEntries(Object.entries(result.mapped??{}).filter(([key,val])=>key in measurementLabels && Number.isFinite(Number(val))));
      if(!Object.keys(mapped).length){notify('قُرئ الجدول، لكن لم تتطابق أسماء القياسات. استخدم CSV بعمودي name,value وأسماء مثل waist,hip,bust.',10000);return;}
      if(commit('استيراد جدول قياسات',()=>{Object.assign(project.measurements,mapped);project=regenerateProject(project);})){measurementsDirty=false;renderPanels();setTab('measurements');notify(`تم استيراد ${Object.keys(mapped).length} قياسات${result.warnings?.length?'؛ '+result.warnings.join(' · '):''}`,9000);}return;
    }
    if(/\.dxf$/i.test(name)) {
      const result=importDxf(text);if(!result.pieces.length)throw Error('لا توجد عناصر هندسية مدعومة في الملف');
      if(commit('استيراد DXF',()=>{project.pieces.push(...result.pieces);selected=result.pieces[0].id;selectedPoint=null;})){fit();notify(`استُوردت ${result.pieces.length} قطع${result.warnings?.length?' · '+result.warnings.slice(0,3).join(' · '):''}`,11000);}return;
    }
    const incoming=parseProject(text);
    if(dirty&&!await confirmAction('استبدال المشروع الحالي؟ احفظه أولًا إن احتجت إليه.'))return;
    project=incoming;undoStack=[];redoStack=[];selected=project.pieces[0]?.id??null;selectedPoint=null;measurementsDirty=false;dirty=false;autosave();render();fit();notify('تم فتح المشروع');
  }catch(error){notify('تعذر فتح الملف: '+error.message,9000);}
}
$('#fileInput').addEventListener('change',async e=>{const f=e.target.files[0];if(f){if(f.size>20*1024*1024){notify('الحد الأقصى للملف 20 MB');return;}await readFile(await f.text(),f.name);}e.target.value='';});
const actions={
  async new(){if(dirty&&!await confirmAction('بدء مشروع جديد؟ احفظ مشروعك أولًا إن احتجت إليه.'))return;commit('مشروع جديد',()=>{project=newProject();selected=null;selectedPoint=null;});measurementsDirty=false;render();fit();},
  open:()=>openFile(),importMeasurements:()=>openFile(true),
  async save(){const result=await saveText(serializeProject(project),safeName()+'.pattern.json','project');if(result?.saved){dirty=false;$('#saveState').textContent='تم حفظ ملف المشروع';}},
  svg:()=>saveText(exportSvg(project),safeName()+'.svg','svg'),dxf:()=>saveText(exportDxf(project),safeName()+'.dxf','dxf'),hpgl:()=>saveText(exportHpgl(project),safeName()+'.plt','hpgl'),
  gradedDxf(){const graded=clone(project),b=projectBounds(project.pieces);graded.pieces=[];for(const [index,step]of project.sizes.entries())for(const piece of project.pieces){const p=gradePiece(piece,step,project);p.name+=` [${step>=0?'+':''}${step}]`;p.id=uid('graded');p.offset.x+=index*(b.width+100);graded.pieces.push(p);}return saveText(exportDxf(graded),safeName()+'-all-sizes.dxf','dxf');},
  print:()=>$('#printDialog').showModal(),printFull:()=>printProject(false),printA4:()=>printProject(true),help:()=>$('#helpDialog').showModal(),block:()=>$('#blockDialog').showModal(),fit,
  undo(){if(!undoStack.length)return;redoStack.push(clone(project));project=undoStack.pop();selected=project.pieces.some(p=>p.id===selected)?selected:project.pieces[0]?.id??null;selectedPoint=null;measurementsDirty=false;dirty=true;autosave();render();},
  redo(){if(!redoStack.length)return;undoStack.push(clone(project));project=redoStack.pop();selected=project.pieces.some(p=>p.id===selected)?selected:project.pieces[0]?.id??null;selectedPoint=null;measurementsDirty=false;dirty=true;autosave();render();},
  duplicate(){const p=currentPiece();if(!p)return notify('حدد قطعة أولًا');commit('نسخ قطعة',()=>{const copy=clone(p);copy.id=uid('piece');copy.name=p.name+' — نسخة';copy.points.forEach(pt=>pt.id=uid('point'));copy.offset={x:(p.offset?.x??0)+30,y:(p.offset?.y??0)+30};project.pieces.push(copy);selected=copy.id;selectedPoint=null;});},
  close(){const p=currentPiece();if(!p)return notify('حدد قطعة أولًا');if(p.points.length<3)return notify('يلزم 3 نقاط على الأقل لإغلاق المحيط');commit('تغيير إغلاق المحيط',()=>{p.closed=!p.closed;delete p.generator;});},
  delete(){const p=currentPiece();if(!p)return;if(selectedPoint){commit('حذف نقطة',()=>{p.points=p.points.filter(pt=>pt.id!==selectedPoint);p.notches=[];selectedPoint=null;delete p.generator;if(p.points.length<3)p.closed=false;if(p.points.length<2){project.pieces=project.pieces.filter(q=>q.id!==p.id);selected=null;}});}else commit('حذف قطعة',()=>{project.pieces=project.pieces.filter(q=>q.id!==p.id);selected=null;selectedPoint=null;});},
  mirrorX(){bakeTransform({mirrorX:true},'عكس أفقي');},mirrorY(){bakeTransform({mirrorY:true},'عكس رأسي');},
  async rotate(){if(!currentPiece())return notify('حدد قطعة أولًا');const angle=await ask('تدوير القطعة','الزاوية بالدرجات',90);if(angle!==null&&Number.isFinite(Number(angle)))bakeTransform({rotation:Number(angle)},'تدوير القطعة');},
  async scale(){if(!currentPiece())return notify('حدد قطعة أولًا');const value=await ask('تحجيم القطعة','النسبة المئوية',100);if(value!==null){const n=Number(value);if(n<=0||n>1000)return notify('اختر نسبة بين 0 و1000%');bakeTransform({scaleX:n/100,scaleY:n/100},'تحجيم القطعة');}},
  smooth(){const p=currentPiece(),i=p?.points.findIndex(pt=>pt.id===selectedPoint);if(i==null||i<0)return;commit('تنعيم نقطة',()=>{const pt=p.points[i],prev=p.points[(i-1+p.points.length)%p.points.length],next=p.points[(i+1)%p.points.length];const dx=(next.x-prev.x)/6,dy=(next.y-prev.y)/6;pt.in={x:pt.x-dx,y:pt.y-dy};pt.out={x:pt.x+dx,y:pt.y+dy};delete p.generator;});},
  corner(){const p=currentPiece(),pt=p?.points.find(q=>q.id===selectedPoint);if(!pt)return;commit('تحويل النقطة إلى زاوية',()=>{delete pt.in;delete pt.out;delete p.generator;});},
  applyMeasurements(){const form=$('#measurementsForm');if(!form.reportValidity())return;const values={};for(const [key]of Object.entries(measurementLabels))values[key]=Number(form.elements[key].value);if(commit('تطبيق القياسات وإعادة الحساب',()=>{project.measurements=values;project=regenerateProject(project);})){measurementsDirty=false;renderPanels();notify('أُعيد حساب القطع المرتبطة بالقوالب');}},
  zoomIn:()=>zoomAt(1.25),zoomOut:()=>zoomAt(.8)
};
function bakeTransform(transform,label){const p=currentPiece();if(!p)return notify('حدد قطعة أولًا');commit(label,()=>{const index=project.pieces.indexOf(p);project.pieces[index]=transformPiece(p,transform);});}
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  try {
    if(button.dataset.action){$('#exportMenu').hidden=true;await actions[button.dataset.action]?.();}
    if(button.dataset.tool)setTool(button.dataset.tool);
    if(button.dataset.select){selected=button.dataset.select;selectedPoint=null;setTab('pieces');render();}
    if(button.dataset.tab)setTab(button.dataset.tab);
    if(button.dataset.close)$('#'+button.dataset.close).close();
    if(button.dataset.block){$('#blockDialog').close();commit('إنشاء باترون من القياسات',()=>{const pieces=generateBlock(button.dataset.block,project.measurements);const b=projectBounds(project.pieces);const shift=project.pieces.length?b.maxX+80:0;for(const p of pieces){p.offset.x+=shift;project.pieces.push(p);}selected=pieces[0].id;selectedPoint=null;});fit();}
  }catch(error){notify(error.message??String(error),9000);}
});
$('#exportToggle').addEventListener('click',e=>{e.stopPropagation();$('#exportMenu').hidden=!$('#exportMenu').hidden;});
document.addEventListener('click',e=>{if(!e.target.closest('.dropdown'))$('#exportMenu').hidden=true;});
document.addEventListener('change',e=>{
  const id=e.target.id;
  if(['showGrading','showDimensions','showGrid','snapGrid'].includes(id)){renderCanvas();return;}
  if(e.target.closest('#measurementsForm')){measurementsDirty=true;return;}
  if(id==='sizeStep'){const n=Number(e.target.value);if(n>0&&n<=200)commit('تغيير فرق المقاس',()=>project.sizeStep=n);return;}
  if(id==='projectName'){commit('تسمية المشروع',()=>project.name=e.target.value.trim()||'مشروع جديد');return;}
  const p=currentPiece();if(!p)return;
  const mappings={pieceName:'name',pieceSeam:'seamAllowance',pieceQuantity:'quantity',pieceFold:'onFold'};
  if(id in mappings){const value=id==='pieceFold'?e.target.checked:id==='pieceName'?e.target.value:Number(e.target.value);commit('تعديل خصائص القطعة',()=>p[mappings[id]]=value);return;}
  if(['pieceOffsetX','pieceOffsetY'].includes(id)){const n=Number(e.target.value);if(!Number.isFinite(n))return;commit('تحديد موضع القطعة',()=>{p.offset[id==='pieceOffsetX'?'x':'y']=n;});return;}
  const pt=p.points.find(q=>q.id===selectedPoint);if(!pt)return;
  if(['pointX','pointY','gradeX','gradeY'].includes(id)){const n=Number(e.target.value);if(!Number.isFinite(n))return;commit('تعديل إحداثيات وتدريج النقطة',()=>{if(id.startsWith('point')){const axis=id==='pointX'?'x':'y',delta=n-pt[axis];pt[axis]=n;for(const which of ['in','out'])if(pt[which])pt[which][axis]+=delta;}else{pt.grade??={dx:0,dy:0};pt.grade[id==='gradeX'?'dx':'dy']=n;}delete p.generator;});}
});
document.addEventListener('keydown',e=>{
  const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.querySelector('dialog[open]');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();actions.save();return;}
  if(editing)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?actions.redo():actions.undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();actions.redo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();actions.open();return;}
  const shortcuts={v:'select',h:'pan',l:'line',c:'curve',r:'rectangle',n:'notch',g:'grain',m:'measure'};
  if(shortcuts[e.key.toLowerCase()]){e.preventDefault();setTool(shortcuts[e.key.toLowerCase()]);}
  if(e.key.toLowerCase()==='f')fit();
  if(e.key==='Escape'){if(drag?.before){project=drag.before;drag=null;}draft=[];setTool('select');render();}
  if(e.key==='Enter'&&tool==='line'){e.preventDefault();finalizeLine(false);}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();actions.delete();}
});

async function printProject(tiled) {
  $('#printDialog').close();
  if(!project.pieces.length)return notify('أضف قطعة للطباعة');
  const source=exportSvg(project),svgRoot=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
  const inside=svgRoot.innerHTML,[left,top,svgWidth,svgHeight]=svgRoot.getAttribute('viewBox').split(/\s+/).map(Number);
  const width=Math.max(120,svgWidth),height=svgHeight+25;
  let pages='';
  if(tiled){const columns=Math.ceil(Math.max(1,width-10)/180),rows=Math.ceil(Math.max(1,svgHeight-10)/240);if(columns*rows>250)return notify('عدد صفحات كبير؛ صدّر SVG أو DXF بدلًا من ذلك');for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)pages+=`<section class="sheet"><svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="250mm" viewBox="${left+col*180} ${top+row*240} 190 250">${inside}</svg><footer>${esc(project.name)} · الصف ${row+1}/${rows} · العمود ${col+1}/${columns}<div class="calibration">100 mm — تحقّق بالمسطرة</div></footer></section>`;}
  else pages=`<section class="sheet"><svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${svgHeight}mm" viewBox="${left} ${top} ${width} ${svgHeight}">${inside}</svg><footer>${esc(project.name)} · 1:1<div class="calibration">100 mm — تحقّق بالمسطرة</div></footer></section>`;
  const html=`<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>${esc(project.name)}</title><style>@page{size:${tiled?'A4':`${width+20}mm ${height+20}mm`};margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.sheet{padding:10mm;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}svg{display:block}footer{font-size:9px;margin-top:3mm;direction:rtl;text-align:left}.calibration{border:1px solid black;width:100mm;height:10mm;text-align:center;line-height:9mm;font-size:10px;margin-top:2mm}</style></head><body>${pages}</body></html>`;
  if(window.desktop){const result=await window.desktop.printPdf({html,filename:safeName()+(tiled?'-A4':'-1to1')+'.pdf'});if(result?.saved)notify('تم إنشاء PDF بالحجم الحقيقي');}
  else {const popup=window.open('','_blank');if(!popup)return notify('اسمح بفتح نافذة الطباعة');popup.document.write(html);popup.document.close();popup.focus();setTimeout(()=>popup.print(),400);}
}
new ResizeObserver(()=>renderCanvas()).observe(svg);
render();requestAnimationFrame(fit);
// Minimal read-only observability for local acceptance checks.
window.level7Cad={getProject:()=>clone(project),getView:()=>({zoom,pan:clone(pan),selected,selectedPoint,tool}),fit};
// Preserve the earlier automation alias and storage key for compatibility.
window.patternStudio=window.level7Cad;
