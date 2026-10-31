import{hasCompleteOriginalPreview}from'./complete-original-preview.mjs';
import{bindDraggablePalettes}from'./draggable-palettes.js';
import{appendOriginalX}from'./original-x-add.mjs';
import{bindMainMenu}from'./main-menu.js';
import{createOriginalDartShorteningUi}from'./original-dart-shortening-ui.js';
import{coordinateOperandChoices}from'./native-coordinate-operands.mjs';
import{editOriginalScalarValue}from'./original-scalar-edit.mjs';
import{createPartHistoryCalculation}from'./part-history-engine.mjs';
import{originalPatternSeamHelperIds}from'./original-pattern-seam.mjs';
import {createOriginalAssistantUi} from './original-assistant-ui.js';
let originalAssistantUi=null;
import {refreshOriginalPartTextFields} from './native-part-text.mjs';
import {createOriginalTextUi} from './original-text-ui.js';
import {createOriginalCurveMorphUi} from './original-curve-morph-ui.js';
let originalCurveMorphUi=null;
let originalTextUi=null;
import{createOriginalInsertUi}from'./original-insert-ui.js';
import{createOriginalLine10Ui}from'./original-line10-ui.js';
import{createPointConstructionUi}from'./point-construction-ui.js';
import{createOriginalJoinUi}from'./original-join-ui.js';
import{createOriginalCutUi}from'./original-cut-ui.js';
import{createOriginalParallelUi}from'./original-parallel-ui.js';
import{createOriginalGrainUi}from'./original-grain-ui.js';
import{createOriginalNotchUi}from'./original-notch-ui.js';
import{createOriginalCornerUi}from'./original-corner-ui.js';
import{createOriginalStyleUi}from'./original-style-ui.js';
import{createOriginalDeleteUi}from'./original-delete-ui.js';
import{createOriginalShapeUi}from'./original-shape-ui.js';
import{pointMarkPath}from'./native-line-attributes.mjs';
import {createOriginalLengthUi} from './original-length-ui.js';
import {createOriginalPointEditor} from './original-point-editor-ui.js';
import{createOriginalPointToolsUi}from'./original-point-tools-ui.js';
import {createLineTransformUi} from './line-transform-ui.js';
import {createGroupedToolPalette} from './grouped-tool-palette.js';
import {createDimensionInspectionUi} from './dimension-inspection-ui.js';
import {createDirectPathEditor} from './direct-path-editor.js';
import {createRecordedDimensionsUi} from './native-recorded-dimensions-ui.js';
import {createOriginalCurveControlsUi} from './original-curve-controls-ui.js';
import {createOriginalGeometryUi} from './original-geometry-edit-ui.js';
import {createConstructionUi,constructionModes} from './drawing-construction-ui.js';
import {assertPartLinksPreserved} from './part-link-guard.mjs';
import {appendNativePath,rectangleVertices} from './drawing-path.js';
import { parseMdl, serializeMdl, getNativeSummary, decodeSupportedHistory, updateAbsolutePoint, appendAbsolutePoint, appendReferenceLine, getNativeN38TemplateBytes, NATIVE_N38_TEMPLATE_INFO } from './native-mdl.js';
import { readNativeMetadata, parseMasChart } from './native-measurements.js';
import { readCachedPreview } from './native-cache-preview.js';
import { appendDrawingPoint, appendDrawingSegment } from './native-drawing.js';
import { readNativeXValues } from './native-x-values.js';
import { readNativeZValues } from './native-z-values.js';
import { inspectParametricPoint, updateParametricX, updateParametricZ, getParametricPointExampleBytes } from './native-parametric-point.js';
import { createN38Ui } from './native-n38-ui.js';
import { createOwnedPartsUi } from './owned-parts-ui.js';
import { createPartPropertiesUi } from './native-part-properties-ui.js';
import { createZInspectorUi } from './native-z-inspector-ui.js';
import { inspectNativeObservedZValues } from './native-z-observed-snapshot.js';
import { createAlaaAppendUi } from './native-alaa-append-ui.js';
import { createXZTableEditing } from './xz-table-editing.js';
import { createXZWorkspace } from './xz-workspace-ui.js';
import { createXValuesScopeUi } from './x-values-scope-ui.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const canvas = $('#native-canvas');
const namespace = 'http://www.w3.org/2000/svg';
const MAX_FILE = 20 * 1024 * 1024;
let fileSaveToken=null;
let style = null, savedStyle = null, filename = '', metadata = null, summary = null, activePart = 1;
let cursor = 0, selected = null, dirty = false, busy = false, mode = 'select';
let undoStack = [], redoStack = [], view = { x: -20, y: -100, w: 240, h: 160 }, drag = null;
let noticeTimer = null, chart = null;
let pointOperation = 'edit';
let previewStyle = null, previews = new Map();
// Capability results belong to an immutable authenticated document, never a filename.
let drawingStart = null, drawingPointer = null, suppressCanvasClick = false;
let valuesEncoding = 'windows-1256';
let partFilter = '';
let overview = false, hiddenParts = new Set();
const parameterChecks = new WeakMap();
let parameterContext = null, parameterAnnouncement = null;
let localUpdateState = null, localUpdateBusy = false;
let construction = null;
let ownedParts = null;
let n38 = null;
let partProperties = null;
let zInspector = null;
let alaaAppend = null;
let xzWorkspace = null;
let xzTables = null;
let xValuesScope = null;
const TOOLBOX_LAYOUT_KEY = 'level7-cad-toolbox-layout-v1';
let toolboxLayout = {version:1,mode:'floating',x:null,y:null}, toolboxDrag = null;

function saveToolboxLayout() { try { localStorage.setItem(TOOLBOX_LAYOUT_KEY,JSON.stringify(toolboxLayout)); } catch {} }
function positionToolbox(persist = false) {
  const toolbox = $('#cad-toolbox'), docked = toolboxLayout.mode === 'docked';
  toolbox.dataset.placement = toolboxLayout.mode; $('#toolbox-dock').classList.toggle('is-docked',docked);
  const toggle = $('#toolbox-placement-toggle');
  toggle.setAttribute('aria-label',docked?'Float toolbox':'Dock toolbox to top');
  toggle.title = docked?'Float toolbox / تعويم صندوق الأدوات':'Dock toolbox to top / تثبيت صندوق الأدوات بالأعلى';
  toggle.querySelector('span').textContent = docked?'Float':'Dock';
  if (!docked) {
    const box = toolbox.getBoundingClientRect(), area = $('#canvas-frame').getBoundingClientRect();
    const minimumY = $('.commandbar').getBoundingClientRect().bottom + 5;
    toolboxLayout.x = Math.round(Math.max(6,Math.min(Number.isFinite(toolboxLayout.x)?toolboxLayout.x:area.x+(area.width-box.width)/2,Math.max(6,innerWidth-box.width-6))));
    toolboxLayout.y = Math.round(Math.max(minimumY,Math.min(Number.isFinite(toolboxLayout.y)?toolboxLayout.y:area.y+12,Math.max(minimumY,innerHeight-box.height-31))));
    // Viewport-relative bounds apply during layout, before a queued resize event.
    toolbox.style.left = `clamp(6px, ${toolboxLayout.x}px, max(6px, calc(100vw - ${box.width+6}px)))`;
    toolbox.style.top = `clamp(${minimumY}px, ${toolboxLayout.y}px, max(${minimumY}px, calc(100dvh - ${box.height+31}px)))`;
  }
  if (persist) saveToolboxLayout();
}
function initializeToolbox() {
  try {
    const saved = JSON.parse(localStorage.getItem(TOOLBOX_LAYOUT_KEY));
    if (saved?.version === 1 && ['floating','docked'].includes(saved.mode) && Number.isFinite(saved.x) && Number.isFinite(saved.y)) toolboxLayout = {version:1,mode:saved.mode,x:saved.x,y:saved.y};
  } catch {}
  positionToolbox();
  const handle = $('#toolbox-drag-handle');
  const finishDrag = cancel => {
    if (!toolboxDrag) return;
    if (cancel) toolboxLayout = {...toolboxDrag.start};
    try { handle.releasePointerCapture(toolboxDrag.pointerId); } catch {}
    toolboxDrag = null; handle.classList.remove('dragging'); positionToolbox(true);
  };
  handle.addEventListener('pointerdown',event=>{
    if (event.button !== 0) return;
    event.preventDefault(); handle.focus();
    const start = {...toolboxLayout}, box = $('#cad-toolbox').getBoundingClientRect();
    toolboxLayout = {...toolboxLayout,mode:'floating',x:box.x,y:box.y}; positionToolbox();
    toolboxDrag = {start,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:toolboxLayout.x,y:toolboxLayout.y};
    handle.classList.add('dragging'); handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove',event=>{
    if (!toolboxDrag || event.pointerId !== toolboxDrag.pointerId) return;
    toolboxLayout.x = toolboxDrag.x+event.clientX-toolboxDrag.clientX; toolboxLayout.y = toolboxDrag.y+event.clientY-toolboxDrag.clientY; positionToolbox();
  });
  handle.addEventListener('pointerup',()=>finishDrag(false));
  handle.addEventListener('pointercancel',()=>finishDrag(true));
  handle.addEventListener('keydown',event=>{
    if (event.key==='Escape' && toolboxDrag) { event.preventDefault(); event.stopPropagation(); finishDrag(true); return; }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key==='Home') { event.preventDefault(); event.stopPropagation(); toolboxLayout.mode='docked'; positionToolbox(true); return; }
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const box = $('#cad-toolbox').getBoundingClientRect(), step = event.shiftKey?1:10;
    toolboxLayout = {...toolboxLayout,mode:'floating',x:box.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:box.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)};
    positionToolbox(true);
  });
  $('#toolbox-placement-toggle').addEventListener('click',()=>{toolboxLayout.mode=toolboxLayout.mode==='docked'?'floating':'docked';positionToolbox(true);});
  window.addEventListener('resize',()=>positionToolbox(true));
}

function hasLocalUpdates() { return typeof window.desktop?.checkLocalUpdates === 'function' && typeof window.desktop?.getLocalUpdateStatus === 'function'; }
function renderLocalUpdates(result) {
  if (!hasLocalUpdates()) return;
  const knownStates = ['disabled','checking','current','ready','error'];
  localUpdateState = knownStates.includes(result?.state) ? result : {state:'error',message:'Local update status is unavailable.'};
  const labels = {disabled:'غير مفعّل',checking:'جارٍ الفحص…',current:'محدّث',ready:`${localUpdateState.version || 'تحديث'} جاهز · يُثبّت عند الإغلاق`,error:'تعذر الفحص'};
  const output = $('#local-update-status'), button = $('#check-local-updates');
  output.hidden = false; output.dataset.state = localUpdateState.state;
  text(output, `التحديثات · ${labels[localUpdateState.state]}`);
  output.title = `التحديث التلقائي${localUpdateState.currentVersion ? ` · الإصدار المثبت ${localUpdateState.currentVersion}` : ''}\n${localUpdateState.message || ''}`;
  button.hidden = false; button.disabled = localUpdateBusy || ['disabled','checking'].includes(localUpdateState.state);
  button.title = localUpdateState.message || 'فحص وجود إصدار جديد الآن. التحديث الموثّق يُثبّت تلقائياً عند الإغلاق.';
}
async function refreshLocalUpdates(check = false) {
  if (!hasLocalUpdates() || localUpdateBusy) return;
  localUpdateBusy = true;
  if (check) renderLocalUpdates({state:'checking',currentVersion:localUpdateState?.currentVersion,message:'Checking locally prepared releases.'});
  try {
    const result = await (check ? window.desktop.checkLocalUpdates() : window.desktop.getLocalUpdateStatus());
    localUpdateBusy = false; renderLocalUpdates(result);
  } catch {
    localUpdateBusy = false;
    renderLocalUpdates({state:'error',currentVersion:localUpdateState?.currentVersion,message:'The local update status could not be read. Your document is unchanged.'});
  }
}
function initializeLocalUpdates() {
  if (!hasLocalUpdates()) return;
  void refreshLocalUpdates();
  window.addEventListener('focus',()=>void refreshLocalUpdates());
  if (typeof window.desktop.onLocalUpdateStatus === 'function') window.desktop.onLocalUpdateStatus(renderLocalUpdates);
  else window.setInterval(()=>void refreshLocalUpdates(),30_000);
}

function parameterCapability(partId = activePart) { return style ? parameterChecks.get(style)?.get(partId)?.result || null : null; }
function canEditParameters() { return !!parameterCapability()?.eligible; }
function inspectParameters(partId) {
  if (!style) return;
  const inspectedStyle = style;
  let checks = parameterChecks.get(inspectedStyle);
  if (!checks) { checks = new Map(); parameterChecks.set(inspectedStyle,checks); }
  if (checks.has(partId)) return;
  const check = {result:null}; checks.set(partId,check);
  Promise.resolve().then(()=>inspectParametricPoint(inspectedStyle,{partId})).then(result=>{
    check.result = result;
    if (style !== inspectedStyle || activePart !== partId) return;
    render();
    if (result.eligible && parameterAnnouncement !== inspectedStyle) {
      parameterAnnouncement = inspectedStyle;
      notice('تعديل X1 وZ1 متاح في هذا المثال المعتمد فقط. افتح X Values أو Z Values بالأعلى.',false,true,'هذا النموذج المعتمد يتيح تعديل X1 المحلي وصيغة Z1 المحدودة، مع إعادة حساب النقطة 2004 فقط. بقية أدوات التحرير العام غير متاحة.');
    }
  }).catch(error=>{ check.result = {eligible:false,reason:error.message}; if (style===inspectedStyle && activePart===partId) render(); });
}

function constructionLines(){
 const current=model(true)?.lines||[];if(!alaaAppend?.eligible()||!useCachedPart()||cacheDivisor(cachedPart())!==1)return current;
 const ids=new Set(current.map(l=>l.id));return [...current,...(cachedPart()?.objects||[]).filter(o=>o.kind==='sample-path'&&!o.nativeSeamHelper&&o.points.length===2&&!ids.has(o.objectId)&&o.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=1e6&&Math.abs(p.y)<=1e6)).map(o=>({id:o.objectId,a:{...o.points[0]},b:{...o.points[1]},cachedReference:true}))];
}
function linkedConstructionLines(){const ids=new Set(alaaAppend?.capability()?.linkedPointLineIds||[]);return (model(true)?.lines||[]).filter(l=>ids.has(l.id));}
function canDraw() { if (overview) return false; const current = model(true); return (!!n38?.eligible() || !!alaaAppend?.eligible() || !!appendPartInfo()?.appendEligible) && cursor === current?.totalRecords; }
let pointConstruction=null;let directPathEditor=null;
let originalGeometryUi=null;
let originalCurveControlsUi=null;
let recordedDimensionsUi=null;
let dimensionInspectionUi=null;
let originalDartUi=null;let originalInsertUi=null;let originalLine10Ui=null;let originalJoinUi=null;let originalCutUi=null;let originalParallelUi=null;let originalGrainUi=null;let originalNotchUi=null;let originalCornerUi=null;let originalStyleUi=null;let originalDeleteUi=null;let originalShapeUi=null;let groupedToolsUi=null;let originalPointUi=null;let originalPointEditor=null;let originalLengthUi=null;let lineTransformUi=null;
const drawingModes = ['draw-point','draw-line','draw-polyline','draw-rectangle',...constructionModes];
function drawingActive() { return drawingModes.includes(mode) && canDraw(); }
function clearDrawing() { originalDartUi?.close(); construction?.clear(); drawingStart = null; drawingPointer = null; $('#draft-drawing').replaceChildren(); text($('#drawing-measure'),''); pointConstruction?.refresh(); }
function drawingPosition(event) {
  if(pointConstruction&&['draw-point','draw-line','draw-polyline'].includes(mode)){
   const q=world(event),p=pointConstruction.resolve(event,{x:q.x,y:-q.y});if(!p)return null;
   if(event.shiftKey&&drawingStart&&!p.pointId&&!p.constructionBinding&&!p.pointConstruction){if(Math.abs(p.x-drawingStart.x)>=Math.abs(p.y-drawingStart.y))p.y=drawingStart.y;else p.x=drawingStart.x;}
   return mode!=='draw-point'&&n38?.eligible()?n38.drawingPosition(p,drawingStart?'end':'start'):p;
  }
  const location = world(event);
  let position = { x: location.x, y: -location.y };
  if ($('#drawing-grid').checked) { position.x = Math.round(position.x); position.y = Math.round(position.y); }
  const constrained = ['draw-line','draw-polyline'].includes(mode) && drawingStart && event.shiftKey;
  const horizontal = constrained && Math.abs(position.x-drawingStart.x)>=Math.abs(position.y-drawingStart.y);
  if (constrained) { if (horizontal) position.y = drawingStart.y; else position.x = drawingStart.x; }
  let nearest = null, nearestDistance = 8;
  const snapPoints=alaaAppend?.eligible()?alaaAppend.reusablePoints().map(point=>({...point,id:point.objectId})):model(true)?.points||[];
  for (const point of snapPoints) {
    if (constrained && (horizontal ? point.y !== drawingStart.y : point.x !== drawingStart.x)) continue;
    const screen = new DOMPoint(point.x, -point.y).matrixTransform(canvas.getScreenCTM());
    const distance = Math.hypot(screen.x-event.clientX, screen.y-event.clientY);
    if (distance<=nearestDistance) { nearestDistance = distance; nearest = point; }
  }
  const resolved = nearest ? { x: nearest.x, y: nearest.y, pointId: nearest.id } : position;
  return mode !== 'draw-point' && n38?.eligible() ? n38.drawingPosition(resolved,drawingStart?'end':'start') : resolved;
}
function renderDrawing() {
  pointConstruction?.refresh();const layer = $('#draft-drawing'); layer.replaceChildren();
  canvas.classList.toggle('drawing-mode', drawingActive());
  if (!drawingActive()) return;
  if(construction?.render(layer))return;
  if(!drawingPointer)return;
  const scale = view.w/Math.max(1,canvas.clientWidth), p = drawingPointer;
  if (mode !== 'draw-point' && mode !== 'draw-rectangle' && drawingStart) layer.append(svgElement('line', { x1: drawingStart.x, y1: -drawingStart.y, x2: p.x, y2: -p.y, stroke: '#7bdfef', 'stroke-dasharray': '5 4', 'stroke-width': 1.3, 'vector-effect': 'non-scaling-stroke', 'data-drawing-rubberband': '' }));
  if (drawingStart && mode !== 'draw-point') {
    const a=drawingStart,dx=p.x-a.x,dy=p.y-a.y;
    if(mode==='draw-rectangle') layer.append(svgElement('rect',{x:Math.min(a.x,p.x),y:-Math.max(a.y,p.y),width:Math.abs(dx),height:Math.abs(dy),fill:'none',stroke:'#7bdfef','stroke-dasharray':'5 4','stroke-width':1.3,'vector-effect':'non-scaling-stroke','data-drawing-rectangle':''}));
    const label=mode==='draw-rectangle'?decimal(Math.abs(dx))+' × '+decimal(Math.abs(dy))+' mm':decimal(Math.hypot(dx,dy))+' mm · '+decimal(Math.atan2(dy,dx)*180/Math.PI)+'°';
    text($('#drawing-measure'),label);
  } else text($('#drawing-measure'),'اختر موضع البداية على الرسم');
  layer.append(svgElement('circle', { cx: p.x, cy: -p.y, r: (p.pointId?7:4)*scale, fill: 'none', stroke: p.pointId?'#7cfc84':'#79deef', 'stroke-width': 1.3, 'vector-effect': 'non-scaling-stroke', 'data-drawing-snap': p.pointId || '' }));
  if (p.pointId) layer.append(svgElement('text', { x:p.x+10*scale,y:-p.y-8*scale,fill:'#7cfc84','font-size':11*scale },'Snap'));
}
async function drawAt(event) {
  if (!drawingActive() || busy) return;
  if(construction?.owns(mode))return construction.click(event);
  const position = drawingPosition(event);if(!position){status('اختر موضعًا صالحًا وفق لوحة تحديد النقطة.');return;}drawingPointer = position;
  try {
    if (mode === 'draw-point') {
      if (position.pointId) { selected = {type:'point',id:position.pointId}; paintSelection(); renderSelection(); notice(`النقطة P${position.pointId} موجودة بالفعل؛ لم تُنشأ نقطة مكررة.`); return; }
      const engine = n38?.eligible()?n38:alaaAppend?.eligible()?alaaAppend:null;
      const result = engine ? await engine.drawPoint(position) : appendDrawingPoint(style,{partId:activePart,x:position.x,y:position.y});
      if (!engine) updateDocument(result.document, `Drawn point ${result.pointId}: X ${decimal(position.x)}, Y ${decimal(position.y)} mm`);
      selected = {type:'point',id:result.pointId}; paintSelection(); renderSelection();
    } else if (!drawingStart) {
      drawingStart = position; renderDrawing(); status(mode==='draw-rectangle'?'حدد الزاوية المقابلة للمستطيل. Escape: إلغاء.':'حدد نهاية الخط. Shift: أفقي/رأسي · Enter: إنهاء الخطوط المتصلة.');
    } else {
      const engine = n38?.eligible()?n38:alaaAppend?.eligible()?alaaAppend:null;
      const tool=mode, start=drawingStart;
      const vertices=tool==='draw-rectangle'?rectangleVertices(start,position):null;
      const result = vertices ? (engine ? await engine.drawPath(vertices) : await appendNativePath(style,{partId:activePart,vertices,closed:true},appendDrawingSegment)) : (engine ? await engine.drawSegment(start,position) : appendDrawingSegment(style,{partId:activePart,start,end:position}));
      drawingStart = null;
      if (!engine) updateDocument(result.document, vertices?'Created native rectangle':'Drawn line '+result.lineId);
      if(tool==='draw-polyline') {
        const end=model(true).points.find(p=>(p.id??p.objectId)===result.pointIds[1]);
        drawingStart={x:end?.x??position.x,y:end?.y??position.y,pointId:result.pointIds[1]};
        drawingPointer={...drawingStart};
        status('اختر النقطة التالية · Enter أو Escape لإنهاء المسار · التراجع يحذف آخر خط.');
      } else drawingPointer=null;
      selected = {type:'line',id:result.lineId}; paintSelection(); renderSelection(); renderDrawing();
    }
  } catch (error) { notice(creationError(error),true); renderDrawing(); }
}

function svgElement(tag, attributes = {}, text = null) {
  const element = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== null) element.textContent = text;
  return element;
}
function text(element, value) { element.textContent = String(value); }
function decimal(value) { return Number(value.toFixed(5)).toString(); }
function counter(value) { return String(value).padStart(3, '0'); }
function model(full = false) { const decoded = style ? decodeSupportedHistory(style, activePart, full ? {} : { throughRecord: cursor }) : null; const projected=n38?.projectedModel(decoded,full,cursor)??decoded; return n38?.eligible()?projected:(alaaAppend?.projectedModel(projected)??projected); }
// 0.9.139: read-only bridge for the LEVEL7 design mode (convert MDL parts to a design).
window.l7MdlBridge = Object.freeze({
  available: () => !!style,
  filename: () => filename,
  parts: () => (metadata?.parts ?? []).map(part => ({ id: part.id, name: part.name || '' })),
  geometry: partId => { const p = cachedPart(partId); return p ? { available: !!p.available, objects: (p.objects || []).filter(o => !o.nativeSeamHelper).map(o => ({ kind: o.kind, points: (o.points || []).map(q => [q.x, q.y]) })) } : null; }
});
function cachedPart(partId = activePart) {
  if (!style) return null;
  if (previewStyle !== style) { previewStyle = style; previews = new Map(); }
  if (!previews.has(partId)) {
    const sizeId = metadata?.referenceSize?.index || 1;
    const caches = style.blocks.filter(block => block.id[0]===3 && block.id[1]===partId && block.id[2]===7 && block.id[3]===sizeId);
    if (!caches.length) previews.set(partId, { partId, available: false, unavailable: false, noStoredGeometry: true, readOnly: true, historyExecuted: false, totalObjects: 0, objects: [], unsupported: [], warnings: ['This part has no stored geometry cache.'] });
    else try { previews.set(partId, { ...readCachedPreview(style, { partId, sizeId }), available: true, unavailable: false, noStoredGeometry: false }); }
    catch (error) { previews.set(partId, { partId, available: false, unavailable: true, noStoredGeometry: false, readOnly: true, historyExecuted: false, totalObjects: 0, objects: [], unsupported: [], warnings: [error.message] }); }
  }
  const result=previews.get(partId);if(!result.seamHelpersResolved){const hidden=originalPatternSeamHelperIds(style,{partId,sizeKey:metadata?.referenceSize?.name,objects:result.objects});for(const o of result.objects)o.nativeSeamHelper=hidden.has(o.objectId);result.seamHelpersResolved=true;}
  return previews.get(partId);
}
function useCachedPart(partId = activePart) {
  if (!style) return false;
  if (n38?.capability(partId)?.eligible) return false;
  const part = summary?.parts.find(item => item.partId === partId);
  return !!part && !part.eligible && !part.bootstrapEligible;
}
function cacheBounds(preview) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const object of (preview?.objects || []).filter(o=>!o.nativeSeamHelper)) for (const point of object.points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, -point.y); maxY = Math.max(maxY, -point.y);
  }
  const divisor = cacheDivisor(preview);
  return Number.isFinite(minX) ? { x: minX/divisor, y: minY/divisor, w: (maxX-minX)/divisor, h: (maxY-minY)/divisor } : { x: -20, y: -120, w: 200, h: 150 };
}
function cacheDivisor(preview) {
  let largest = 0; for (const object of preview?.objects || []) for (const point of object.points) largest = Math.max(largest, Math.abs(point.x), Math.abs(point.y));
  return Math.max(1, largest/1_000_000);
}
function cachedPath(object, divisor = 1) { return object.points.map((point, index) => `${index ? 'L' : 'M'}${point.x/divisor},${-point.y/divisor}`).join(' '); }
function drawCached(parent, preview, scale, thumbnails = false) {
  const divisor = cacheDivisor(preview);
  const appendedIds=new Set(!thumbnails&&alaaAppend?.eligible()&&preview?.partId===activePart?alaaAppend.objects().map(object=>object.objectId):[]);
  for (const object of preview?.objects || []) {
    if(object.nativeSeamHelper||appendedIds.has(object.objectId))continue;
    const common = { stroke: object.lineRoleColor??'#d7d02a', fill: 'none',...(object.lineStyle>1?{'stroke-dasharray':({2:'1 2',3:'1 5',4:'12 6',5:'12 4 2 4',6:'6 3 1 3'})[object.lineStyle]}:{}), 'stroke-width': thumbnails ? .8 : 1.3, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' };
    const attributes = thumbnails ? {} : { 'data-cache-object-id': object.objectId, 'data-cache-kind': object.kind, 'aria-label': `Read-only cached object ${object.objectId}` };
    if(object.kind==='literal-text'){
      const a=object.annotation;parent.append(svgElement('text',{...attributes,x:a.anchor[0]/divisor,y:-a.anchor[1]/divisor,fill:'#d7d02a','font-family':'monospace','font-size':a.height/divisor,textLength:a.width*a.text.length/divisor,lengthAdjust:'spacingAndGlyphs','pointer-events':thumbnails?'none':'visiblePainted','data-native-text-id':object.objectId},a.text));continue;
    }
    if(object.kind==='dimension'){
      const group=svgElement('g',{...attributes,'pointer-events':'none'});
      for(const command of object.dimension.commands.filter(c=>[2,3,4].includes(c.role))){let path='';for(let i=0;i<command.points.length;i+=2){const a=command.points[i],b=command.points[i+1];path+=`M${a[0]/divisor},${-a[1]/divisor}L${b[0]/divisor},${-b[1]/divisor}`;}group.append(svgElement('path',{...common,d:path,'data-dimension-role':command.role}));}
      const a=object.dimension.labelAnchor;group.append(svgElement('text',{x:a[0]/divisor,y:-a[1]/divisor,fill:'#d7d02a','font-family':'Arial, sans-serif','font-size':object.dimension.textSize/100/divisor,'text-anchor':'middle','dominant-baseline':'central','data-dimension-label':object.objectId},object.dimension.label));parent.append(group);continue;
    }
    if(object.kind==='point'||object.kind==='point-sequence'){for(const point of object.points){const x=point.x/divisor,y=-point.y/divisor,r=Math.max(.05,(object.pointMark===12?4:object.pointMark===13?1.8:4)*scale),d=pointMarkPath(object.pointMark,x,y,r);parent.append(d?svgElement('path',{...common,...attributes,d,stroke:'#e6e6e6','data-point-mark':object.pointMark}):svgElement('circle',{...common,...attributes,cx:x,cy:y,r,fill:'#e6e6e6',stroke:'none','data-point-mark':object.pointMark??13}));}}
    else if(object.kind==='segment-pairs'){const d=object.points.map((p,i)=>`${i%2?'L':'M'}${p.x/divisor},${-p.y/divisor}`).join(' ');parent.append(svgElement('path',{...common,...attributes,d}));if(!thumbnails)parent.append(svgElement('path',{...attributes,d,fill:'none',stroke:'transparent','stroke-width':12,'vector-effect':'non-scaling-stroke','pointer-events':'stroke','data-direct-hit':'true'}));}
    else if (object.kind === 'sample-path') {
      const d=cachedPath(object,divisor);parent.append(svgElement('path',{...common,...attributes,d}));
      if(!thumbnails)parent.append(svgElement('path',{...attributes,d,fill:'none',stroke:'transparent','stroke-width':12,'vector-effect':'non-scaling-stroke','pointer-events':'stroke','data-direct-hit':'true'}));
    }
  }
}
function renderPropertiesPreview(svg,partId){
  svg.replaceChildren();
  const decoded=partId===activePart?model(true):decodeSupportedHistory(style,partId);
  if(useCachedPart(partId)){
    const preview=cachedPart(partId),b=cacheBounds(preview),pad=Math.max(4,Math.max(b.w,b.h)*.08);
    svg.setAttribute('viewBox',`${b.x-pad} ${b.y-pad} ${Math.max(10,b.w+pad*2)} ${Math.max(10,b.h+pad*2)}`);
    drawCached(svg,preview,Math.max(b.w/(svg.clientWidth||360),b.h/(svg.clientHeight||260),.01),true);
    return{caption:preview.available?`Stored geometry preview · ${preview.objects.length}/${preview.totalObjects} objects shown · ${preview.unsupported.length} omitted · unknown history not executed`:preview.noStoredGeometry?'No stored geometry for this part.':'Stored preview unavailable; unsupported native geometry is not guessed.'};
  }
  if(decoded?.points.length){
    const b=bounds(decoded),pad=Math.max(4,Math.max(b.w,b.h)*.08);svg.setAttribute('viewBox',`${b.x-pad} ${b.y-pad} ${Math.max(10,b.w+pad*2)} ${Math.max(10,b.h+pad*2)}`);
    for(const line of decoded.lines)svg.append(svgElement('line',{x1:line.a.x,y1:-line.a.y,x2:line.b.x,y2:-line.b.y,stroke:'#dfd04e','stroke-width':1,'vector-effect':'non-scaling-stroke'}));
    const pointRadius=2.5*Math.max(b.w/(svg.clientWidth||360),b.h/(svg.clientHeight||260),.01);
    for(const point of decoded.points)svg.append(svgElement('circle',{cx:point.x,cy:-point.y,r:pointRadius,fill:'#eee'}));
    return{caption:`${n38?.capability(partId)?.eligible?'Calculated New-N38':'Verified point/line'} preview · ${decoded.points.length} points / ${decoded.lines.length} lines`};
  }
  svg.setAttribute('viewBox','-10 -110 160 120');return{caption:'No point/line geometry is available for this part.'};
}
function renderCacheCaption() {
  const caption = $('#cache-preview-caption'), cached = useCachedPart();
  if(overview){caption.hidden=false;text($('#cache-render-summary'),'عرض جميع البارتات · '+overviewParts().length+'/'+(summary?.parts.length||0)+' ظاهر · ترتيب للعرض فقط');text($('#cache-file-summary'),'معاينات البارتات المتاحة؛ العناصر غير المدعومة لا تزال غير ظاهرة. المقاييس مختلفة بين الخانات.');return;}
  caption.hidden = !cached||hasCompleteOriginalPreview(style,{partId:activePart,sizeKey:metadata?.referenceSize?.name});
  if (!cached) return;
  const preview = cachedPart(), total = [...previews.values()].reduce((counts, part) => ({ objects: counts.objects+part.totalObjects, shown: counts.shown+part.objects.length, skipped: counts.skipped+part.unsupported.length, reserved: counts.reserved+(part.reserved?.length??0), parsed: counts.parsed+(part.available?1:0), absent: counts.absent+(part.noStoredGeometry?1:0), unavailable: counts.unavailable+(part.unavailable?1:0) }), { objects: 0, shown: 0, skipped: 0, reserved: 0, parsed: 0, absent: 0, unavailable: 0 });
  const emptyLabel = preview.noStoredGeometry ? 'no stored geometry' : preview.unavailable ? 'لا تتوفر معاينة معتمدة لهذه القطعة' : 'stored geometry cache is empty';
  const scope = alaaAppend?.eligible() ? `literal additions available · ${alaaAppend.objects().length} new objects · original offsets via تحرير الأصل` : canEditParameters() ? 'limited X1 / Z1 editing' : 'READ ONLY';
  text($('#cache-render-summary'), preview.available && preview.totalObjects ? `Partial cached preview · ${scope} · Part ${activePart}: ${preview.objects.length}/${preview.totalObjects} shown · ${preview.unsupported.length} skipped${cacheDivisor(preview)>1 ? ' · display coordinates scaled' : ''}` : `${alaaAppend?.eligible()?'Drawing available':'READ ONLY'} · Part ${activePart}: ${emptyLabel}`);
  text($('#cache-file-summary'), `File: ${total.shown}/${total.objects} shown · ${total.skipped} omitted${total.reserved ? ` · ${total.reserved} inactive point slots` : ""} · ${total.parsed} caches · ${total.absent} no stored geometry · ${total.unavailable} unavailable`);
}
function appendPartInfo() { return summary?.parts.find(part => part.partId === activePart) || null; }
function creationError(error) {
  if (error.code === 'STALE_NATIVE_CACHE') return 'الرسم المحفوظ يحتاج إلى إعادة الحساب. نفّذ Test Run أولًا، ثم أعد إنشاء العنصر.';
  if (error.code === 'UNSUPPORTED_APPEND' || error.code === 'READ_ONLY_NATIVE') return 'إضافة عناصر إلى هذا الملف غير مدعومة حاليًا. راجع MDL information لمعرفة سبب عدم الأهلية.';
  return error.message;
}
bindMainMenu(document.querySelector('.menubar'));
function closeMenus() { $$('details.menu[open]').forEach(menu => { menu.open = false; }); }
function status(message) { text($('#status-text'), message); $('#status-text').title = message; }
function notice(message, error = false, persistent = false, details = message) {
  clearTimeout(noticeTimer);
  text($('#native-notice'), message);
  $('#native-notice').title = details;
  $('#native-notice').classList.toggle('error', error);
  $('#native-notice').hidden = false;
  if (!persistent) noticeTimer = setTimeout(() => { $('#native-notice').hidden = true; }, 6500);
  status(message);
}
function dialog(id) { closeMenus(); const element = $('#' + id); if (!element.open) element.showModal(); }
function canReplace() { return !(dirty || xzWorkspace?.hasUnsaved() || xzTables?.hasUnsaved()) || confirm('توجد تعديلات أو تجربة X/Z غير محفوظة. هل تريد فتح ملف آخر وترك هذه التعديلات؟'); }
function templateConstraint() { return `نموذج ثابت لنظام ${NATIVE_N38_TEMPLATE_INFO.measurementSystem} ومقاس ${NATIVE_N38_TEMPLATE_INFO.referenceSize}. يحتفظ بهوية القطعة الأصلية؛ لا يُنشئ هوية جديدة.`; }
function newFromTemplate() {
  if (busy || !canReplace()) return;
  try { readFile(getNativeN38TemplateBytes(), 'Untitled-N38_0.mdl'); }
  catch (error) { notice(error.message, true); }
}
function openParametricExample() {
  if (busy || !canReplace()) return;
  try { readFile(getParametricPointExampleBytes(),'native-xz-parametric-point.mdl'); $$('#x-values-dialog[open],#z-values-dialog[open]').forEach(element=>element.close()); }
  catch(error) { notice(error.message,true); }
}
function updateDocument(next, label, nextPart = activePart) {
  if (!style) return;
  if(xzTables?.hasPending())throw Error('احفظ تعديلات X/Z وأعد فتح النسخة قبل تعديل الرسم أو تنظيم البارتات.');
  next=refreshOriginalPartTextFields(next).document;
  assertPartLinksPreserved(style,next);
  undoStack.push({ style, dirty, selected, cursor, activePart });
  if (undoStack.length > 50) undoStack.shift();
  redoStack = []; // a new edit ends the redo chain
  if (parameterAnnouncement === style) parameterAnnouncement = next;
  style = next;
  activePart = nextPart;
  summary = getNativeSummary(style);
  metadata = readNativeMetadata(style);
  cursor = decodeSupportedHistory(style, activePart).totalRecords;
  dirty = true;
  clearTimeout(noticeTimer); $('#native-notice').hidden = true;
  render(); status(label);
}
function readFile(bytes, name,saveToken=null) {
  if (bytes.byteLength > MAX_FILE) throw new Error('اختر ملف MDL لا يزيد حجمه عن 20 MB.');
  // Complete parsing before replacing the working style. Invalid imports are atomic.
  const next = parseMdl(bytes);
  const nextSummary = getNativeSummary(next);
  const nextMetadata = readNativeMetadata(next);
  let nextPart = nextSummary.parts[0]?.partId ?? nextMetadata.parts[0]?.id ?? 1;
  let decoded = decodeSupportedHistory(next, nextPart);
  const nextPreviews = new Map();
  if (nextSummary.readOnly) for (const part of nextSummary.parts) {
    try {
      const preview = readCachedPreview(next, { partId: part.partId, sizeId: nextMetadata.referenceSize?.index || 1 }); nextPreviews.set(part.partId, { ...preview, available: true, unavailable: false, noStoredGeometry: false });
      if (preview.objects.length) { nextPart = part.partId; decoded = decodeSupportedHistory(next, nextPart); break; }
    } catch { /* A missing or rejected cache cannot supply a visible first part. */ }
  }
  style = next; savedStyle = next; filename = name;fileSaveToken=saveToken; summary = nextSummary; metadata = nextMetadata;
  parameterAnnouncement = null; parameterContext = null; $('#native-parameter-dialog').close();
  previewStyle = next; previews = nextPreviews;
  activePart = nextPart; cursor = decoded.totalRecords; selected = null;
  n38?.reset();
  alaaAppend?.reset();
  xzTables?.reset(); xzWorkspace?.reset();
  dirty = false; undoStack = []; redoStack = []; chart = null; mode = 'select'; pointConstruction?.reset();clearDrawing();
  overview = false; hiddenParts = new Set();
  partFilter = ''; $('#part-search').value = ''; $('#part-list').scrollTop = 0;
  clearTimeout(noticeTimer); $('#native-notice').hidden = true;
  render(); fit();
  if (nextSummary.parts.find(part => part.partId === activePart)?.bootstrapEligible) notice('قالب N38_0 لنظام 50-Werte-OPTIMASS بهوية ثابتة. جاهز لرسم النقاط والخطوط.', false, true,templateConstraint());
  else if (!decoded.eligible) notice(cachedPart().available && cachedPart().totalObjects ? 'معاينة جزئية من الرسم المحفوظ، وقد يكون قديمًا. التصميم للقراءة فقط؛ التفاصيل في MDL information.' : cachedPart().noStoredGeometry ? 'لا يوجد رسم محفوظ لهذه القطعة. اختر قطعة أخرى؛ يمكن حفظ نسخة مطابقة.' : 'المعاينة غير متاحة لهذه القطعة. يمكن حفظ نسخة مطابقة دون تحرير.', false, true,cachedPart().available && cachedPart().totalObjects ? 'معاينة جزئية للقراءة فقط من عينات الرسم المحفوظ؛ قد يكون قديمًا. لا يُنفذ سجل الإنشاء، ولا تُفسر جميع أنماط العرض والإظهار. تُحذف العناصر غير المدعومة؛ تحرير التصميم غير متاح.' : cachedPart().noStoredGeometry ? 'هذه القطعة لا تحتوي رسمًا محفوظًا؛ اختر قطعة أخرى. تحرير التصميم غير متاح، ويظل حفظ نسخة مطابقة ممكنًا.' : 'لا تتوفر معاينة معتمدة لهذه القطعة. تحرير التصميم غير متاح، ويظل حفظ نسخة مطابقة ممكنًا.');
  else if (decoded.cacheStale) notice('الرسم المحفوظ يختلف عن سجل الإنشاء. العرض الحالي يعيد الحساب من السجل.');
  else status('تم فتح ملف MDL الأصلي. انقر مرتين على نقطة لتعديل إحداثياتها.');
}
function closeDocument(){if(busy||!style||!canReplace())return;xzTables?.reset();xzWorkspace?.reset();dirty=false;style=null;savedStyle=null;fileSaveToken=null;location.reload();}
async function open() {
  if (busy || !canReplace()) return;
  if (window.desktop?.openMdl) {
    busy = true;
    try { const file = await window.desktop.openMdl(); if (file) readFile(new Uint8Array(file.bytes), file.name,file.saveToken); }
    catch (error) { notice(error.message, true); }
    finally { busy = false; render(); }
  } else $('#mdl-file').click();
}
async function save(forceAs=false) {
  if (!style || busy) return false;
  if (xzTables?.hasPending()) {
    try { const out=await xzTables.savePending(); if(out?.saved)notice(`حُفظت تعديلات X/Z في ${out.name}. هندسة التصميم الكاملة تحتاج إعادة الحساب في Grafis.`);return !!out?.saved; }
    catch(error){notice(error.message,true);return false;}
  }
  if (cursor !== model(true).totalRecords) {
    notice('أعد السجل إلى نهايته بواسطة Test Run قبل حفظ الملف.', true); return false;
  }
  busy = true;
  try {
    const bytes = serializeMdl(style);
    const suggested = filename.replace(/\.mdl$/i, '') + (dirty ? '-edited' : '-copy') + '.mdl';
    if (window.desktop?.saveMdl) {
      const result = await window.desktop.saveMdl({ bytes, filename: suggested,saveToken:forceAs?null:fileSaveToken });
      if (!result) return false;
      filename = result.name;fileSaveToken=result.saveToken??null;
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const link = document.createElement('a'); link.href = url; link.download = suggested;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); filename = suggested;
    }
    savedStyle = style; dirty = false; render(); notice('تم حفظ نسخة MDL أصلية.');return true;
  } catch (error) { notice(error.message, true);return false; }
  finally { busy = false; render(); }
}
function partName(partId) { return metadata?.parts.find(part => part.id === partId)?.name || 'NN'; }
function render() {
  directPathEditor?.refresh();
  originalGeometryUi?.refresh();
  originalCurveControlsUi?.refresh();
  recordedDimensionsUi?.refresh();
  dimensionInspectionUi?.refresh();
  const current = model(), complete = model(true);
  const appendInfo = appendPartInfo();
  text($('#document-name'), style ? filename + (dirty ? ' *' : '') : 'No style open');
  document.title = style ? `LEVEL7 and MTM — [${filename}]${dirty ? ' *' : ''}` : 'LEVEL7 and MTM';
  text($('#mode-badge'), !style ? 'MDL' : n38?.eligible() ? `${n38.capability().workOnly?'WORK · ':''}New-N38 X/Z` : alaaAppend?.eligible() ? 'Selected part drawing' : appendInfo?.bootstrapEligible ? 'N38 template' : complete.eligible ? 'Editable MDL' : canEditParameters() ? 'Limited X1/Z1 · cached' : cachedPart().available && cachedPart().totalObjects ? 'Read-only MDL · cached' : 'Read-only MDL');
  $('#mode-badge').dataset.state = !style ? 'idle' : n38?.eligible() || alaaAppend?.eligible() || complete.eligible || canEditParameters() || appendInfo?.bootstrapEligible ? 'editable' : 'read-only';
  text($('#active-part-name'), style ? `${counter(activePart)} — ${partName(activePart)}` : 'No active part');
  text($('#active-size'), metadata?.referenceSize?.name || '—');
  text($('#part-count'), summary?.partCount ?? 0);
  text($('#record-count'), current ? counter(cursor) : '000');
  text($('#status-record'), current ? `${counter(cursor)} / ${counter(current.totalRecords)}` : '000 / 000');
  $('#canvas-empty').hidden = !!style;
  $('#reset-count').max = current?.totalRecords || 1;
  const capabilities = {
    'save-as': !!style && cursor === complete.totalRecords,
    'save-current':!!style&&cursor===complete.totalRecords,
    'close-document':!!style,
    replay: !!complete?.eligible || !!n38?.eligible()||hasCompleteOriginalPreview(style,{partId:activePart,sizeKey:metadata?.referenceSize?.name}),
    undo: undoStack.length > 0,
    redo: redoStack.length > 0,
    reset: (!!complete?.eligible || !!n38?.eligible()) && cursor > 0,
    restore: (!!complete?.eligible || !!n38?.eligible()) && cursor < complete.totalRecords,
    'tool-point': (!!complete?.eligible || !!n38?.eligible() || !!alaaAppend?.canEditPoints()) && cursor === complete.totalRecords && complete.points.length > 0,
    'tool-line': (!!complete?.eligible || !!n38?.eligible() || !!alaaAppend?.eligible()) && complete.lines.length > 0,
    'create-point': (!!appendInfo?.appendEligible || !!n38?.eligible() || !!alaaAppend?.eligible()) && cursor === complete.totalRecords,
    'create-line': (!!appendInfo?.appendEligible || !!n38?.eligible() || !!alaaAppend?.eligible()) && cursor === complete.totalRecords && complete.points.length >= 2,
    'draw-point': canDraw(),
    'draw-line': canDraw(),
    'draw-polyline': canDraw(),
    'draw-rectangle': canDraw(),
    ...Object.fromEntries(constructionModes.map(action=>[action,canDraw()&& (['draw-polar','draw-horizontal','draw-vertical'].includes(action)||(['draw-fraction','draw-distance','draw-resize'].includes(action)?linkedConstructionLines().length>0:constructionLines().length>0))])),
    'x-values': !!style,
    'z-values': !!style,
    'part-properties': !!style,
    'show-all-parts': !!style,
    'active-part-only': !!style,
    'open-parametric-example': true
  };
  if (overview) for (const action of ['tool-point','tool-line','create-point','create-line',...drawingModes]) capabilities[action] = false;
  for (const action of ['show-all-parts','active-part-only']) $$(`[data-action="${action}"]`).forEach(button => button.setAttribute('aria-pressed', String(action==='show-all-parts'?overview:!overview)));
  for (const [action, enabled] of Object.entries(capabilities)) $$(`[data-action="${action}"]`).forEach(button => { button.disabled = busy || !enabled; });
  $$('[data-action="open"],[data-action="new-template"]').forEach(button => { button.disabled = busy; });
  $$('#native-parameter-dialog input,#native-parameter-dialog select,#native-parameter-dialog button').forEach(input => { input.disabled = busy; });
  $$('#new-line-dialog input,#new-line-dialog select,#new-line-dialog button').forEach(input => { input.disabled = busy; });
  for (const action of ['create-point', 'create-line']) $$(`[data-action="${action}"]`).forEach(button => {
    button.title = alaaAppend?.eligible() ? 'Draw on the selected part; literal points and lines. Unknown original geometry stays read-only.' : n38?.eligible() ? 'Restricted own New-N38 native point/line creation' : appendInfo?.appendReason || (cursor !== complete?.totalRecords ? 'Restore the complete native record before creating an object.' : action === 'create-point' ? 'Create an absolute-coordinate point' : 'Create a line referencing existing points');
  });
  for(const action of drawingModes)$$(`[data-action="${action}"]`).forEach(button=>{
    // 0.9.112: every drawing option keeps its own title (previously point, line and
    // polyline shared one generic English text, as did horizontal and vertical).
    button.title=['draw-fraction','draw-distance'].includes(action)?'نقطة مرتبطة بخط جديد قابل للتحرير؛ غير متاحة للخطوط الأصلية والمنحنيات بعد.':({'draw-horizontal':'Horizontal · خط أفقي؛ انقر البداية والنهاية','draw-vertical':'Vertical · خط رأسي؛ انقر البداية والنهاية'}[action]??null)|| (alaaAppend?.eligible()||n38?.eligible()||appendInfo?.appendEligible?({'draw-point':'Point · رسم نقطة','draw-line':'Line · رسم خط بنقرتين','draw-polyline':'Polyline · خطوط متصلة، Enter للإنهاء','draw-rectangle':'Rectangle · مستطيل بزاويتين متقابلتين','draw-polar':'خط بطول وزاوية','draw-parallel':'نسخة موازية بإحداثيات عددية','draw-perpendicular':'عمود إلى خط أو امتداده، بإحداثيات عددية','draw-midpoint':'نقطة منتصف عددية'}[action]):alaaAppend?.reason()||'Native drawing unavailable for this document and active part.');
  });
  $('#drawing-grid').disabled = busy || !canDraw();
  $('#part-search').disabled = busy || !style;
  $$('[data-action^="tool-"],[data-action^="draw-"]').forEach(button => {
    const active = button.dataset.action === 'tool-' + mode || button.dataset.action === mode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  originalLine10Ui?.refresh();groupedToolsUi?.refresh();lineTransformUi?.refresh();lineTransformUi?.paint();originalJoinUi?.refresh();originalCutUi?.refresh();originalParallelUi?.refresh();originalGrainUi?.refresh();originalJoinUi?.paint();originalCutUi?.paint();originalParallelUi?.paint();originalGrainUi?.paint();originalNotchUi?.refresh();originalNotchUi?.paint();originalCornerUi?.refresh();originalCornerUi?.paint();originalStyleUi?.refresh();originalStyleUi?.paint();originalDeleteUi?.refresh();originalDeleteUi?.paint();originalShapeUi?.refresh();originalShapeUi?.paint();originalLine10Ui?.paint();originalPointUi?.refresh();originalPointUi?.paint();originalPointEditor?.refresh();originalInsertUi?.refresh();originalPointEditor?.paint();originalInsertUi?.paint();originalDartUi?.refresh();originalDartUi?.paint();originalLengthUi?.refresh();originalCurveMorphUi?.refresh();originalTextUi?.refresh();originalAssistantUi?.refresh();originalLengthUi?.paint();originalCurveMorphUi?.paint();originalTextUi?.paint();originalAssistantUi?.paint();
  const partsScrollTop = $('#part-list').scrollTop;
  $('#part-list').replaceChildren();
  for (const part of summary?.parts ?? []) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'part-item' + (part.partId === activePart ? ' selected' : '');
    button.dataset.partId = part.partId; button.disabled = busy;
    button.title = `Part ${counter(part.partId)} — ${partName(part.partId)}`;
    button.setAttribute('aria-pressed',String(part.partId===activePart));
    const label = document.createElement('span'); label.className = 'part-label';
    const number = document.createElement('span'); number.className = 'part-number'; number.textContent = counter(part.partId);
    const name = document.createElement('span'); name.className = 'part-name'; name.textContent = partName(part.partId);
    label.append(number,name);
    const thumb = svgElement('svg', { viewBox: '-10 -110 160 120', 'aria-hidden': 'true' });
    const partModel = part.partId===activePart ? model(true) : decodeSupportedHistory(style, part.partId);
    if (useCachedPart(part.partId)) {
      const preview = cachedPart(part.partId), b = cacheBounds(preview), pad = Math.max(4, Math.max(b.w,b.h)*.08);
      thumb.setAttribute('viewBox', `${b.x-pad} ${b.y-pad} ${Math.max(10,b.w+pad*2)} ${Math.max(10,b.h+pad*2)}`);
      drawCached(thumb, preview, Math.max(b.w,b.h,20)/70, true);
    } else if (partModel.points.length) {
      const b = bounds(partModel); const pad = Math.max(4, Math.max(b.w, b.h) * .1);
      thumb.setAttribute('viewBox', `${b.x-pad} ${b.y-pad} ${Math.max(10,b.w+pad*2)} ${Math.max(10,b.h+pad*2)}`);
      for (const line of partModel.lines) thumb.append(svgElement('line', { x1: line.a.x, y1: -line.a.y, x2: line.b.x, y2: -line.b.y, stroke: '#dfd04e', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
      for (const point of partModel.points) thumb.append(svgElement('circle', { cx: point.x, cy: -point.y, r: Math.max(b.w,b.h,20)*.018, fill: '#eee' }));
    }
    button.append(thumb,label);
    const row=document.createElement('div');row.className='part-row';
    const eye=document.createElement('button');eye.type='button';eye.className='part-visibility';eye.dataset.visibilityPart=part.partId;
    const visible=overview?!hiddenParts.has(part.partId):part.partId===activePart;
    eye.disabled=busy;eye.setAttribute('aria-pressed',String(visible));eye.setAttribute('aria-label',(visible?'Hide':'Show')+' part '+counter(part.partId));
    eye.title=(visible?'إخفاء':'إظهار')+' البارت '+counter(part.partId);eye.append(svgElement('svg',{viewBox:'0 0 24 24','aria-hidden':'true'}));eye.firstChild.append(svgElement('use',{href:visible?'#icon-eye':'#icon-eye-off'}));
    row.append(button,eye);$('#part-list').append(row);
  }
  if (!summary?.parts.length) {
    const empty = document.createElement('div'); empty.className = 'parts-empty';
    empty.append(svgElement('svg',{viewBox:'0 0 24 24','aria-hidden':'true'}));
    empty.firstChild.append(svgElement('use',{href:'#icon-new'}));
    const title = document.createElement('strong'); title.textContent='No parts yet';
    const detail = document.createElement('span'); detail.textContent='Open a file or start a new pattern.';
    empty.append(title,detail); $('#part-list').append(empty);
  }
  applyPartFilter(); $('#part-list').scrollTop = partsScrollTop;
  n38?.renderControls();
  alaaAppend?.renderControls();
  construction?.controls();
  renderCacheCaption(); draw(); renderSelection();
  inspectParameters(activePart);
  n38?.inspect();
  alaaAppend?.inspect();
  if ($('#history-dialog').open) renderHistory();
  if ($('#x-values-dialog').open) renderXValues();
  if ($('#z-values-dialog').open) renderZValues();
  if ($('#x-values-dialog').open||$('#z-values-dialog').open) void xzTables?.prepare();
  partProperties?.refresh();
  ownedParts?.render();
}
function applyPartFilter() {
  const query = partFilter.trim().toLocaleLowerCase().replace(/^#/,''),parts = $$('#part-list [data-part-id]');
  let shown = 0;
  for (const button of parts) {
    const id = Number(button.dataset.partId), matches = !query || counter(id).includes(query) || String(id).includes(query) || partName(id).toLocaleLowerCase().includes(query);
    button.hidden = !matches; button.closest('.part-row').hidden = !matches; if (matches) shown++;
  }
  text($('#parts-filter-feedback'), !parts.length ? 'No parts loaded' : query ? `${shown} of ${parts.length} parts` : `${parts.length} ${parts.length===1?'part':'parts'} in this file`);
  $('#clear-part-search').disabled = busy || !query;
  $('#part-list .parts-no-matches')?.remove();
  if (parts.length && !shown) { const empty=document.createElement('div'); empty.className='parts-empty parts-no-matches'; empty.textContent='No matching parts. Try a name or number.'; $('#part-list').append(empty); }
}
$('#part-search').addEventListener('input',event=>{partFilter=event.target.value;applyPartFilter();$('#part-list').scrollTop=0;});
$('#clear-part-search').addEventListener('click',()=>{partFilter='';$('#part-search').value='';applyPartFilter();$('#part-search').focus();});
$('#part-search').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();partFilter='';event.target.value='';applyPartFilter();}});
function bounds(decoded) {
  const points = decoded.points;
  if (!points.length) return { x: -20, y: -120, w: 200, h: 150 };
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => -point.y)), maxY = Math.max(...points.map(point => -point.y));
  return { x: minX, y: minY, w: maxX-minX, h: maxY-minY };
}
function fit() {
  const current = model(); if (!current) return;
  const b = overview ? overviewBounds() : useCachedPart() ? cacheBounds(cachedPart()) : bounds(current), ratio = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
  let w = Math.max(40, b.w * 1.3), h = Math.max(40, b.h * 1.3);
  if (w/h < ratio) w = h*ratio; else h = w/ratio;
  view = { x: b.x+b.w/2-w/2, y: b.y+b.h/2-h/2, w, h };
  draw();
}
function draw() {
  canvas.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const scale = view.w / Math.max(1, canvas.clientWidth);
  text($('#status-scale'), overview ? 'Part overview · fitted cells' : useCachedPart() && cacheDivisor(cachedPart())>1 ? 'Scaled view' : decimal(1/scale) + ' px/mm');
  const geometry = $('#draft-geometry'), labels = $('#draft-labels'), axes = $('#draft-axes');
  geometry.replaceChildren(); labels.replaceChildren(); axes.replaceChildren();
  if(overview){renderDrawing();drawOverview(geometry);return;}
  const axis = 7*scale;
  axes.append(svgElement('line',{x1:-axis,y1:0,x2:axis,y2:0}),svgElement('line',{x1:0,y1:-axis,x2:0,y2:axis}));
  const current = model(); renderDrawing(); if (!current) return;
  if (useCachedPart()) { drawCached(geometry, cachedPart(), scale); if(!alaaAppend?.eligible()){directPathEditor?.paint();dimensionInspectionUi?.paint();originalJoinUi?.paint();originalCutUi?.paint();originalParallelUi?.paint();originalGrainUi?.paint();originalNotchUi?.paint();originalCornerUi?.paint();originalStyleUi?.paint();originalDeleteUi?.paint();originalShapeUi?.paint();originalLine10Ui?.paint();originalPointUi?.paint();originalPointEditor?.paint();originalInsertUi?.paint();originalLengthUi?.paint();originalCurveMorphUi?.paint();originalTextUi?.paint();originalAssistantUi?.paint();return;} if(construction?.owns(mode))for(const line of constructionLines().filter(l=>l.cachedReference))geometry.append(svgElement('line',{x1:line.a.x,y1:-line.a.y,x2:line.b.x,y2:-line.b.y,stroke:'transparent','stroke-width':12,'vector-effect':'non-scaling-stroke','pointer-events':'stroke','data-reference-line-id':line.id})); }
  for (const line of current.lines) {
    geometry.append(svgElement('line', { x1: line.a.x, y1: -line.a.y, x2: line.b.x, y2: -line.b.y,
      'data-line-id': line.id, stroke: selected?.type === 'line' && selected.id === line.id ? '#00e5f2' : '#d7d02a',
      'stroke-width': 1.3, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'stroke', tabindex: 0,
      role: 'button', 'aria-label': `Line ${line.id}, length ${decimal(line.length)} millimetres` }));
  }
  for (const point of current.points) {
    const color = selected?.type === 'point' && selected.id === point.id ? '#00e5f2' : '#eee';
    const radius = 4*scale;
    geometry.append(svgElement('path', { d: `M${point.x-radius},${-point.y}h${2*radius} M${point.x},${-point.y-radius}v${2*radius}`, 'data-point-mark': point.id, stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    geometry.append(svgElement('circle', { cx: point.x, cy: -point.y, r: 9*scale, fill: 'transparent', stroke: 'none',
      'data-point-id': point.id, 'data-x': point.x, 'data-y': point.y, role: 'button', tabindex: 0,
      'aria-label': `Point ${point.id}, X ${point.x}, Y ${point.y}`, 'pointer-events': 'all' }));
  }
  paintSelection();
  directPathEditor?.paint();
  dimensionInspectionUi?.paint();originalJoinUi?.paint();originalCutUi?.paint();originalParallelUi?.paint();originalGrainUi?.paint();originalNotchUi?.paint();originalCornerUi?.paint();originalStyleUi?.paint();originalDeleteUi?.paint();originalShapeUi?.paint();originalLine10Ui?.paint();originalPointUi?.paint();originalPointEditor?.paint();originalInsertUi?.paint();originalLengthUi?.paint();originalCurveMorphUi?.paint();originalTextUi?.paint();originalAssistantUi?.paint();
}
function paintSelection() {
  // Keep hit targets stable between click and dblclick.
  $$('[data-point-mark]').forEach(mark => mark.setAttribute('stroke', selected?.type === 'point' && selected.id === Number(mark.dataset.pointMark) ? '#00e5f2' : '#eee'));
  $$('[data-line-id]').forEach(line => line.setAttribute('stroke', selected?.type === 'line' && selected.id === Number(line.dataset.lineId) ? '#00e5f2' : '#d7d02a'));
  $$('[data-selected-length]').forEach(label => label.remove());
  if (selected?.type === 'line') {
    const current = model(), scale = view.w / Math.max(1, canvas.clientWidth);
    const line = current.lines.find(item => item.id === selected.id);
    if (line) $('#draft-labels').append(svgElement('text',{x:(line.a.x+line.b.x)/2,y:-(line.a.y+line.b.y)/2-9*scale,'font-size':12*scale,fill:'#00dbe8','data-selected-length':line.id},decimal(line.length)+' mm'));
  }
}
function renderSelection() {
  if(overview){text($('#selection-info'),'عرض البارتات · '+overviewParts().length+' ظاهر\nاختر بارتًا ثم «النشط» للعودة للرسم.\nالبحث يرشّح القائمة فقط.');return;}
  if (useCachedPart() && !(alaaAppend?.eligible() && (selected?.type==='point'||selected?.type==='line'))) {
    if(alaaAppend?.eligible()){text($('#selection-info'),`Part ${activePart} drawing available\n${alaaAppend.points().length} new points / ${alaaAppend.objects().filter(object=>object.kind==='line').length} new lines\nتحرير الأصل: إزاحة العناصر المدعومة\nChoose Line ·2clicks to draw`);return;}
    const preview = cachedPart(); text($('#selection-info'), preview.available ? `Cached preview · ${canEditParameters()?'limited X1/Z1':'read only'}\n${preview.objects.length} shown / ${preview.totalObjects} objects\n${preview.unsupported.length} unsupported omitted` : preview.noStoredGeometry ? 'No stored geometry\nلا يوجد رسم محفوظ لهذه القطعة' : 'Preview unavailable\nلا تتوفر معاينة معتمدة لهذه القطعة'); return;
  }
  const current = model(); let description = 'No object selected';
  if (selected?.type === 'point') {
    const point = current?.points.find(value => value.id === selected.id);
    if (point) description = `${alaaAppend?.eligible()?'Literal point':'Point'} ${point.id}\nX ${decimal(point.x)} mm\nY ${decimal(point.y)} mm${alaaAppend?.eligible()?'\n'+(alaaAppend.canEditPoints()?'Double-click to edit new point':'Point editing awaits native proof'):''}`;
  } else if (selected?.type === 'line') {
    const line = current?.lines.find(value => value.id === selected.id);
    if (line) description = `Line ${line.id}\nP${line.startPointId} → P${line.endPointId}\nLength ${decimal(line.length)} mm`;
  }
  text($('#selection-info'), description);
}
function editPoint(id) {
  if (busy) return;
  if (n38?.pointEditor(Number(id))) return;
  if (alaaAppend?.pointEditor(Number(id))) return;
  const complete = model(true);
  if (!complete?.eligible || cursor !== complete.totalRecords) { notice('أعد السجل إلى نهايته قبل تعديل نقطة.', true); return; }
  const point = complete.points.find(item => item.id === Number(id)); if (!point) return;
  clearDrawing();
  pointOperation = 'edit';
  text($('#point-title'), 'Point — Absolute X / Y');
  text($('#point-apply'), 'Apply');
  selected = { type: 'point', id: point.id };
  $('#point-index').value = point.id; $('#point-x').value = point.x; $('#point-y').value = point.y;
  text($('#point-record-label'), `Point ${point.id} — native X/Y inputs`);
  text($('#point-error'), ''); $('#point-error').hidden = true; renderSelection(); dialog('point-dialog'); $('#point-x').select();
}
function editableModel() {
  const complete = model(true);
  if (!complete?.eligible) throw Object.assign(new Error('هذا الملف مفتوح للقراءة فقط.'), { code: 'READ_ONLY_NATIVE' });
  if (cursor !== complete.totalRecords) throw new Error('أعد سجل الإنشاء إلى نهايته قبل تعديل عنصر أو إنشائه.');
  return complete;
}
function creationModel() {
  const complete = model(true), appendInfo = appendPartInfo();
  if (!complete || cursor !== complete.totalRecords) throw new Error('أعد سجل الإنشاء إلى نهايته قبل إنشاء عنصر.');
  if (!appendInfo?.appendEligible && !n38?.eligible() && !alaaAppend?.eligible()) throw Object.assign(new Error(appendInfo?.appendReason || 'Native append is unsupported.'), { code: complete.cacheStale ? 'STALE_NATIVE_CACHE' : 'UNSUPPORTED_APPEND' });
  return complete;
}
function createPoint() {
  if (n38?.pointEditor(null)) return;
  if (alaaAppend?.pointEditor(null)) return;
  try { creationModel(); }
  catch (error) { notice(creationError(error), true); return; }
  clearDrawing();
  pointOperation = 'create';
  text($('#point-title'), 'Create absolute point');
  text($('#point-record-label'), 'New point — absolute X / Y');
  text($('#point-apply'), 'Create');
  $('#point-index').value = ''; $('#point-x').value = '0'; $('#point-y').value = '0';
  text($('#point-error'), ''); $('#point-error').hidden = true;
  dialog('point-dialog'); $('#point-x').select();
}
function createLine() {
  let complete;
  try { complete = creationModel(); if (complete.points.length < 2) throw new Error('يلزم وجود نقطتين لإنشاء خط مرتبط.'); }
  catch (error) { notice(creationError(error), true); return; }
  clearDrawing();
  const start = $('#new-line-start'), end = $('#new-line-end');
  start.replaceChildren(); end.replaceChildren();
  for (const point of complete.points) {
    for (const select of [start, end]) {
      const option = document.createElement('option'); option.value = String(point.id);
      option.textContent = `P${point.id}   (${decimal(point.x)}, ${decimal(point.y)}) mm`;
      select.append(option);
    }
  }
  const preferred = selected?.type === 'point' ? complete.points.find(point => point.id === selected.id) : complete.points[0];
  start.value = String(preferred.id);
  end.value = String(complete.points.find(point => point.id !== preferred.id).id);
  text($('#new-line-error'), ''); $('#new-line-error').hidden = true;
  dialog('new-line-dialog'); start.focus();
}
function renderHistory() {
  const complete = model(true), body = $('#history-steps'); body.replaceChildren();
  text($('#history-summary'), complete ? `${complete.totalRecords} native records · ${complete.points.length} point(s) · ${complete.lines.length} line(s)` : 'No style open');
  for (const record of (complete?.records ?? []).slice(0, 2000)) {
    const row = document.createElement('tr'); row.classList.toggle('is-future', record.step > cursor);
    for (const value of [record.step, record.label || record.kind || record.header.join('/'), record.value ?? record.pointId ?? record.objectId ?? '']) {
      const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell);
    }
    const action = document.createElement('td');
    const point = complete.points.find(item => item.recordIndices.x === record.index);
    if (point && complete.eligible) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.editPoint = point.id;
      button.textContent = 'Edit X / Y'; button.disabled = cursor !== complete.totalRecords; action.append(button);
    }
    row.append(action); body.append(row);
  }
}
function showInfo() {
  if(alaaAppend?.eligible()){
    const capability=alaaAppend.capability();
    text($('#file-info-content'),`${filename}\n\nDrawing on selected part ${activePart}\nNative records: ${capability.recordCount}\nEditable literal objects: ${capability.newObjects.length}\n\nPoints, lines, rectangles and numerical constructions are saved in this part's native history. Existing opaque records and geometry are preserved. Only validated literal tail points are editable. General original-curve editing, full history recalculation and persistent X/Z bindings for these additions remain unavailable. Multiple stored size caches are not yet supported by this drawing path.`);
    dialog('file-info-dialog');return;
  }
  if (n38?.eligible()) {
    const capability=n38.capability();
    text($('#file-info-content'),`${filename}\n\nMode: New-N38 · local X1/X2 and Z1/Z2\nAuthenticated part: 1 · single N38 size\nNative records: ${capability.recordCount}\nKnown point/line objects: ${capability.objects.length}\nCreation and point input editing: bounded engine only\nCoordinate bindings: defined approved local X/Z values only\n\nReset/Restore preview complete known point/line record groups without editing native history. Save and authoring require the complete record position; Test Run restores it.\n\nCalculated Z values are an experimental arithmetic preview from the bounded engine. General native arithmetic, CMDIF, other parts and unknown history remain unavailable.\n\nNew retains the fixed template identity. No general GRAFIS equivalence is claimed.`);
    dialog('file-info-dialog');return;
  }
  const current = model(true);
  const details = !style ? 'LEVEL7 and MTM — Native CAD\nOpen a .MDL file to inspect its native construction.\nSupported editing: verified absolute-point and straight-line records.\nOther operations remain read-only.' :
    `${filename}\n\nFormat: ${summary.variant}\nBytes: ${summary.byteLength}\nBlocks: ${summary.blockCount}\nParts: ${summary.partCount}\nNative records: ${current.totalRecords}\nMode: ${appendPartInfo()?.bootstrapEligible ? 'N38 template' : current.eligible ? 'Editable MDL' : 'Read-only MDL'}\nMeasurement system: ${metadata.measurementSystem?.title || 'Unknown'}\nReference size: ${metadata.referenceSize?.name || 'Unknown'}\nCreation: ${appendPartInfo()?.appendEligible ? 'Available' : appendPartInfo()?.appendReason || 'Unsupported'}\n\n${appendPartInfo()?.bootstrapEligible ? 'The fixed N38 template is ready for its first absolute point.' : current.reason || 'Absolute points and their dependent straight lines can be edited. Eligible files also support creating absolute points and referenced lines.'}\n\nNew uses a fixed N38 template and retains its persistent part identity; a fresh native identity is not generated.\nUnknown fields are preserved. Unsupported construction commands are not executed or rewritten. Full GRAFIS compatibility is not established.`;
  const preview = useCachedPart() ? cachedPart() : null;
  text($('#file-info-content'), details + (canEditParameters() ? '\n\nVerified bounded parameter point: local X1 and Z1 formulas X1*2 / X1*3 can be edited. Only point2004 is recalculated; its native Z201 reference and retained historical input float remain intact. General point/line drawing and arbitrary parameter editing stay disabled.' : '') + (preview ? preview.available ? `\n\nPartial cached preview — ${canEditParameters() ? 'limited X1/Z1 point editing' : 'read only'}\nPart ${activePart}: ${preview.objects.length}/${preview.totalObjects} objects shown; ${preview.unsupported.length} omitted.\nNo unknown native history was executed. Curves and unresolved classes are omitted.\n${preview.warnings.join('\n')}` : `\n\n${preview.noStoredGeometry ? 'No stored geometry for this part.' : 'No validated preview is available for this part.'}\n${preview.warnings.join('\n')}` : '')); dialog('file-info-dialog');
}
function showMeasurements() {
  const body = $('#measurement-body'); body.replaceChildren();
  if (chart) {
    text($('#measurement-summary'), `${chart.name || 'MAS'} — ${chart.entries.length} ordered values`);
    for (const item of chart.entries) appendMeasurement([item.index, item.label, item.standardValue ?? item.value ?? '', item.unit || '—']);
  } else {
    text($('#measurement-summary'), metadata ? `${metadata.measurementSystem?.title || 'Unknown system'} — native size table; measurement values require a MAS chart.` : 'Open an MDL style or a MAS measurement chart.');
    for (const size of metadata?.sizes ?? []) if (size.name) appendMeasurement([size.index, size.name, size.index === metadata.referenceSize?.index ? 'Base size' : '', '']);
  }
  dialog('measurements-dialog');
  function appendMeasurement(values) {
    const row = document.createElement('tr');
    for (const value of values) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
    body.append(row);
  }
}
function valuesRow(body, values, attributes = {}) {
  const row = document.createElement('tr');
  for (const [name,value] of Object.entries(attributes)) row.setAttribute(name,String(value));
  for (const value of values) { const cell = document.createElement('td'); cell.textContent = String(value ?? ''); row.append(cell); }
  body.append(row);
  return row;
}
function renderValuesError(kind, error) {
  text($(`#${kind}-values-summary`),'Native parameter table unavailable');
  text($(`#${kind}-values-warnings`),error.message);
  $(`#${kind}-values-body`).replaceChildren();
  $(`#${kind}-values-empty-example`).hidden = true;
}
function renderEmptyValues(kind, columns) {
  const row = document.createElement('tr'), cell = document.createElement('td');
  row.className = 'empty-values-row'; cell.colSpan = columns; cell.dir = 'rtl';
  cell.textContent = 'لا توجد معاملات بعد في هذا القالب. إنشاء معاملات جديدة غير متاح حاليًا؛ افتح المثال المعتمد لتجربة تعديل X1 وZ1.';
  row.append(cell); $(`#${kind}-values-body`).append(row); $(`#${kind}-values-empty-example`).hidden = false;
}
function renderXValues() {
  if (n38?.renderValues('x')) { xValuesScope?.refresh(); return; }
  const body = $('#x-values-body'); body.replaceChildren();
  $('#x-values-empty-example').hidden = true;
  if (!style) { text($('#x-values-summary'),'Open a native MDL document.'); text($('#x-values-warnings'),''); return; }
  text($('#x-values-part'),`Active part ${counter(activePart)} — ${partName(activePart)} · Reference size ${metadata?.referenceSize?.name || 'unknown'}`);
  $('#x-values-edit-note').hidden = !canEditParameters(); $('#x-values-readonly-note').hidden = canEditParameters();
  try {
    const result = readNativeXValues(xzTables?.document()??style,{partId:activePart,encoding:valuesEncoding});
    const globalEntries = result.globalEntries || [], localEntries = result.localEntries || [];
    if (!globalEntries.length && !localEntries.length && result.tables?.global?.status !== 'unavailable' && result.tables?.local?.status !== 'unavailable') renderEmptyValues('x',6);
    const tableStatus = (scope,entries) => { const table = result.tables?.[scope]; return typeof table==='string' ? table : table?.status || (entries.length?'available':'absent'); };
    text($('#x-values-summary'),`Stored native X values · Part ${counter(activePart)} · ${globalEntries.length} global / ${localEntries.length} local rows · global ${tableStatus('global',globalEntries)} · local ${tableStatus('local',localEntries)}${canEditParameters()?' · Limited local X1 editing available':''}`);
    for (const [scope,entries] of [['Global',globalEntries],['Local',localEntries]]) for (const entry of entries) {
      const row = valuesRow(body,[scope,entry.index,entry.isDefault?'Default':entry.sizeKey,entry.value,entry.label,'Read only'],{'data-x-scope':scope.toLowerCase(),'data-x-index':entry.index,'data-x-size-key':entry.sizeKey});
      if (canEditParameters() && scope==='Local' && entry.isDefault && parameterCapability().editableXIndices.includes(entry.index)) {
        const button = document.createElement('button'); button.type='button'; button.dataset.editNativeX=entry.index; button.textContent='Edit X1…'; button.disabled=busy;
        row.lastElementChild.replaceChildren(button);
      }
    }
    $('#x-values-edit-note').hidden = !canEditParameters();
    $('#x-values-readonly-note').hidden = canEditParameters();
    text($('#x-values-warnings'),(result.warnings || []).map(warning=>canEditParameters() && warning.code==='READ_ONLY_X_VALUES'
      ? 'Only verified local X1 editing is available in this example, recalculating point 2004 through Z1. Other native parameters remain read-only.'
      : warning.message || String(warning)).join('\n'));
  } catch (error) { renderValuesError('x',error); }
  xValuesScope?.refresh();
}
function renderZValues() {
  zInspector?.hide();
  if (n38?.renderValues('z')) return;
  const body = $('#z-values-body'); body.replaceChildren();
  $('#z-values-empty-example').hidden = true;
  if (!style) { text($('#z-values-summary'),'Open a native MDL document.'); text($('#z-values-warnings'),''); return; }
  text($('#z-values-part'),`Active part ${counter(activePart)} — ${partName(activePart)}`);
  $('#z-values-edit-note').hidden = !canEditParameters(); $('#z-values-readonly-note').hidden = canEditParameters();
  try {
    const result = readNativeZValues(style,{partId:activePart,encoding:valuesEncoding});
    if (!canEditParameters()) { zInspector?.render(result); return; }
    if (!result.entries.length && result.tableStatus === 'absent') renderEmptyValues('z',7);
    text($('#z-values-summary'),`Stored native Z definitions · Part ${counter(activePart)} · ${result.entries.length} definition(s) · ${result.tableStatus || 'stored definitions'} · ${canEditParameters()?'Verified X1/Z1 point replay only':'Read only · No evaluation'}`);
    for (const entry of result.entries) {
      const refs = entry.geometricReferences || [];
      const georef = refs.length ? refs.map(bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join(' ')).join('\n') : '—';
      const flags = typeof entry.flags==='number' ? '0x'+entry.flags.toString(16) : String(entry.flags ?? '');
      const row = valuesRow(body,[entry.index,entry.recordStep,entry.opaque?'Opaque — not decoded':entry.formula,entry.comment,flags,georef,'Stored; not evaluated'],{'data-z-index':entry.index,'data-z-record-step':entry.recordStep});
      if (canEditParameters() && parameterCapability().editableZIndices.includes(entry.index)) {
        const button = document.createElement('button'); button.type='button'; button.dataset.editNativeZ=entry.index; button.textContent='Edit Z1…'; button.disabled=busy;
        row.lastElementChild.replaceChildren(button);
      }
    }
    $('#z-values-edit-note').hidden = !canEditParameters();
    $('#z-values-readonly-note').hidden = canEditParameters();
    text($('#z-values-warnings'),(result.warnings || []).map(warning=>canEditParameters() && warning==='Stored Z formulas are displayed without evaluation; no native construction history is executed.'
      ? 'Only verified Z1 formulas X1*2 and X1*3 can recalculate point 2004 in this example. General Z evaluation remains unavailable.'
      : warning.message || String(warning)).join('\n'));
  } catch (error) { renderValuesError('z',error); }
}
function showXValues() { if (!style || busy) return; renderXValues(); dialog('x-values-dialog'); void xzTables?.prepare(); }
function showZValues() { if (!style || busy) return; renderZValues(); dialog('z-values-dialog'); void xzTables?.prepare(); }
function editNativeParameter(kind,index) {
  if (busy || !canEditParameters() || cursor!==model(true).totalRecords) return;
  const capability = parameterCapability(), supported = kind==='x' ? capability.editableXIndices : capability.editableZIndices;
  if (!supported.includes(index)) return;
  const entry = (kind==='x' ? capability.xEntries : capability.zEntries).find(entry=>entry.index===index);
  if (!entry) return;
  parameterContext = {style,partId:activePart,kind,index};
  text($('#native-parameter-title'),kind==='x'?'Edit local X1 — verified parameter point':'Edit Z1 — verified native formula');
  $('#native-parameter-x-fields').hidden = kind!=='x'; $('#native-parameter-z-fields').hidden = kind!=='z';
  if (kind==='x') {
    $('#native-parameter-x').value = entry.value;
    $('#native-parameter-x').min = capability.limits.minimum; $('#native-parameter-x').max = capability.limits.maximum;
  } else {
    $('#native-parameter-formula').replaceChildren();
    for (const formula of capability.supportedFormulas) { const option=document.createElement('option'); option.value=formula; option.textContent=formula; $('#native-parameter-formula').append(option); }
    $('#native-parameter-formula').value = entry.formula;
  }
  const point = capability.currentPoint;
  text($('#native-parameter-scope'),`Part ${counter(activePart)} · X1 → Z1 → P${point.objectId} · current point (${decimal(point.x)}, ${decimal(point.y)}) mm`);
  text($('#native-parameter-error'),''); $('#native-parameter-error').hidden=true;
  dialog('native-parameter-dialog');
  if (kind==='x') $('#native-parameter-x').select(); else $('#native-parameter-formula').focus();
}
function changeValuesEncoding(event) {
  valuesEncoding = event.target.value;
  $('#x-values-encoding').value = valuesEncoding; $('#z-values-encoding').value = valuesEncoding;
  if ($('#x-values-dialog').open) renderXValues();
  if ($('#z-values-dialog').open) renderZValues();
}
$('#x-values-encoding').addEventListener('change',changeValuesEncoding);
$('#z-values-encoding').addEventListener('change',changeValuesEncoding);
async function replay() {
  if (busy) return;
  if (n38?.eligible()) { try { await n38.recalculate(); cursor=model(true).totalRecords; render(); } catch(error) { notice(error.message,true); } return; }
  const complete = model(true); if (!complete?.eligible) return;
  clearDrawing();
  if (complete.cacheStale && complete.points.length) {
    const point = complete.points[0];
    updateDocument(updateAbsolutePoint(style, { partId: activePart, objectId: point.id, x: point.x, y: point.y }), 'Native geometry recalculated');
  }
  cursor = complete.totalRecords; selected = null; render();
  status(`Test Run: ${complete.totalRecords} records · ${complete.points.length} points · ${complete.lines.length} lines`);
}
function reset(direction) {
  if (busy) return;
  const complete = model(true); if (!complete?.eligible && !n38?.eligible()) return;
  clearDrawing();
  const count = Math.max(1, Math.min(100000, Math.trunc(Number($('#reset-count').value) || 1)));
  cursor = Math.max(0, Math.min(complete.totalRecords, cursor + direction*count));
  selected = null; render(); status(direction < 0 ? 'تم الرجوع في عرض سجل الإنشاء.' : 'تمت استعادة خطوات سجل الإنشاء.');
}
function undo() {
  if (busy) return;
  if(xzTables?.hasPending()){notice('احفظ تعديلات X/Z وأعد فتح النسخة قبل التراجع عن الرسم.',true);return;}
  const previous = undoStack.at(-1); if (!previous) return;
  try { assertPartLinksPreserved(style,previous.style); }
  catch(error) { notice(error.message,true,true); return; }
  undoStack.pop();
  redoStack.push({ style, dirty, selected, cursor, activePart });
  clearDrawing();
  if (parameterAnnouncement === style) parameterAnnouncement = previous.style;
  const changedPart = activePart !== previous.activePart;
  style = previous.style; dirty = style !== savedStyle; selected = previous.selected; cursor = previous.cursor; activePart = previous.activePart;
  summary = getNativeSummary(style); metadata = readNativeMetadata(style); render(); if (changedPart) fit(); status('تم التراجع عن التعديل.');
}
// Redo re-applies a document state removed by Undo, with the same link guard.
function redo() {
  if (busy) return;
  if(xzTables?.hasPending()){notice('احفظ تعديلات X/Z وأعد فتح النسخة قبل إعادة التنفيذ.',true);return;}
  const next = redoStack.at(-1); if (!next) return;
  try { assertPartLinksPreserved(style,next.style); }
  catch(error) { notice(error.message,true,true); return; }
  redoStack.pop();
  undoStack.push({ style, dirty, selected, cursor, activePart });
  clearDrawing();
  if (parameterAnnouncement === style) parameterAnnouncement = next.style;
  const changedPart = activePart !== next.activePart;
  style = next.style; dirty = style !== savedStyle; selected = next.selected; cursor = next.cursor; activePart = next.activePart;
  summary = getNativeSummary(style); metadata = readNativeMetadata(style); render(); if (changedPart) fit(); status('تمت إعادة التنفيذ.');
}
function zoom(factor, at = null) {
  const cx = at?.x ?? view.x+view.w/2, cy = at?.y ?? view.y+view.h/2;
  const nextW = Math.min(2e7, Math.max(.01, view.w*factor)), nextH = nextW*view.h/view.w;
  view = { x: cx-(cx-view.x)*(nextW/view.w), y: cy-(cy-view.y)*(nextH/view.h), w: nextW, h: nextH }; draw();
}
function world(event) {
  const point = new DOMPoint(event.clientX, event.clientY);
  return point.matrixTransform(canvas.getScreenCTM().inverse());
}

$('#mdl-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (busy) return;
  busy = true; render();
  try { if (!/\.mdl$/i.test(file.name)) throw new Error('اختر ملف MDL أصليًا.'); readFile(new Uint8Array(await file.arrayBuffer()), file.name); }
  catch (error) { notice(error.message, true); }
  finally { busy = false; render(); }
});
$('#native-parameter-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if (busy) return;
  const context = parameterContext;
  if (!context || context.style!==style || context.partId!==activePart || !canEditParameters()) { $('#native-parameter-dialog').close(); return; }
  try {
    let payload;
    if (context.kind==='x') {
      const valueText=$('#native-parameter-x').value.trim(),value=Number(valueText),limits=parameterCapability().limits;
      if (!valueText || !Number.isFinite(value) || value<limits.minimum || value>limits.maximum) throw new Error(`أدخل قيمة X1 عددية بين ${limits.minimum} و${limits.maximum}.`);
      payload={partId:context.partId,index:context.index,value};
    } else {
      const formula=$('#native-parameter-formula').value;
      if (!parameterCapability().supportedFormulas.includes(formula)) throw new Error('صيغة Z1 غير مدعومة في هذا النموذج المحدود.');
      payload={partId:context.partId,index:context.index,formula};
    }
    busy=true; render();
    const next=await (context.kind==='x'?updateParametricX(context.style,payload):updateParametricZ(context.style,payload));
    if (style!==context.style || activePart!==context.partId || !$('#native-parameter-dialog').open) throw new Error('تغير سياق المستند؛ لم يُطبق التعديل.');
    if (next===context.style) { $('#native-parameter-dialog').close(); parameterContext=null; status('لم تتغير قيمة المعامل؛ لم يُنشأ تعديل أو سجل تراجع.'); return; }
    updateDocument(next,context.kind==='x'?`Updated local X1=${payload.value}; verified P2004 recalculated`:`Updated Z1=${payload.formula}; verified P2004 recalculated`);
    fit();
    $('#native-parameter-dialog').close(); parameterContext=null;
  } catch(error) { text($('#native-parameter-error'),error.message); $('#native-parameter-error').hidden=false; }
  finally { busy=false; render(); }
});
$('#native-parameter-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('#native-parameter-dialog').addEventListener('close',()=>{parameterContext=null;});
$('#point-form').addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  try {
    const x = Number($('#point-x').value), y = Number($('#point-y').value), objectId = Number($('#point-index').value);
    if (!$('#point-x').value.trim() || !$('#point-y').value.trim() || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('أدخل إحداثيات عددية صحيحة.');
    const previous = pointOperation === 'create' ? creationModel() : editableModel();
    const next = pointOperation === 'create'
      ? appendAbsolutePoint(style, { partId: activePart, x, y })
      : updateAbsolutePoint(style, { partId: activePart, objectId, x, y });
    const created = pointOperation === 'create' ? decodeSupportedHistory(next, activePart).points.find(point => !previous.points.some(old => old.id === point.id)) : null;
    updateDocument(next, pointOperation === 'create' ? `Created point ${created?.id ?? ''}: X ${decimal(x)}, Y ${decimal(y)} mm` : `Point ${objectId}: X ${decimal(x)}, Y ${decimal(y)} mm`);
    if (created) { selected = { type: 'point', id: created.id }; fit(); renderSelection(); }
    $('#point-dialog').close();
  } catch (error) { text($('#point-error'), pointOperation === 'create' ? creationError(error) : error.message); $('#point-error').hidden = false; }
});
$('#new-line-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  try {
    const previous = creationModel(), startPointId = Number($('#new-line-start').value), endPointId = Number($('#new-line-end').value);
    if (!Number.isInteger(startPointId) || !Number.isInteger(endPointId) || startPointId === endPointId) throw new Error('اختر نقطتي بداية ونهاية مختلفتين.');
    if (n38?.eligible()) { const result=await n38.referenceSegment(startPointId,endPointId); selected={type:'line',id:result.lineId}; $('#new-line-dialog').close(); fit(); renderSelection(); return; }
    if (alaaAppend?.eligible()) { const result=await alaaAppend.referenceSegment(startPointId,endPointId); selected={type:'line',id:result.lineId}; $('#new-line-dialog').close(); fit(); renderSelection(); return; }
    const next = appendReferenceLine(style, { partId: activePart, startPointId, endPointId });
    const created = decodeSupportedHistory(next, activePart).lines.find(line => !previous.lines.some(old => old.id === line.id));
    updateDocument(next, `Created line ${created?.id ?? ''}: P${startPointId} → P${endPointId}`);
    if (created) { selected = { type: 'line', id: created.id }; fit(); renderSelection(); }
    $('#new-line-dialog').close();
  } catch (error) { text($('#new-line-error'), creationError(error)); $('#new-line-error').hidden = false; }
});
$('#new-line-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
document.addEventListener('click', async event => {
  const editX=event.target.closest('[data-edit-native-x]'),editZ=event.target.closest('[data-edit-native-z]');
  if (editX || editZ) { if ((editX||editZ).disabled) return; editNativeParameter(editX?'x':'z',Number(editX?editX.dataset.editNativeX:editZ.dataset.editNativeZ)); return; }
  const edit = event.target.closest('[data-edit-point]');
  if (edit) { $('#history-dialog').close(); editPoint(edit.dataset.editPoint); return; }
  const eye=event.target.closest('[data-visibility-part]');
  if(eye){if(busy)return;const id=Number(eye.dataset.visibilityPart);if(!overview){hiddenParts=new Set(summary.parts.filter(p=>p.partId!==activePart).map(p=>p.partId));overview=true;clearDrawing();mode='select';selected=null;}if(hiddenParts.has(id))hiddenParts.delete(id);else hiddenParts.add(id);render();fit();return;}
  const part = event.target.closest('[data-part-id]');
  if (part) { if (busy) return; clearDrawing(); mode = 'select'; activePart = Number(part.dataset.partId); cursor = model(true).totalRecords; selected = null; render(); fit(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) { if (!event.target.closest('details.menu')) closeMenus(); return; }
  closeMenus();
  const action = button.dataset.action;
  if (action === 'new-template') newFromTemplate();
  else if (action === 'open-parametric-example') openParametricExample();
  else if (action === 'open') await open();
  else if(action==='open-any')await open();
  else if (action === 'save-as') await save(true);
  else if(action==='save-current')await save();
  else if(action==='close-document')closeDocument();
  else if(action==='exit-app')window.desktop?.requestClose?.();
  else if (action === 'close-dialog') button.closest('dialog')?.close();
  else if (action === 'show-all-parts') setOverview(true);
  else if (action === 'active-part-only') setOverview(false);
  else if (action === 'fit') fit();
  else if (action === 'refresh') draw();
  else if (action === 'zoom-in') zoom(.8);
  else if (action === 'zoom-out') zoom(1.25);
  else if (action === 'history') { renderHistory(); dialog('history-dialog'); }
  else if (action === 'file-info') showInfo();
  else if (action === 'measurements') showMeasurements();
  else if (action === 'x-values') showXValues();
  else if (action === 'z-values') showZValues();
  else if (action === 'xz-workspace') { closeMenus();if(busy)return;$$('#x-values-dialog[open],#z-values-dialog[open]').forEach(d=>d.close());void xzWorkspace.show(); }
  else if (action === 'part-properties') partProperties?.open();
  else if (action === 'check-local-updates') await refreshLocalUpdates(true);
  else if (action === 'replay') replay();
  else if (action === 'reset') reset(-1);
  else if (action === 'restore') reset(1);
  else if (action === 'undo') undo();
  else if (action === 'redo') redo();
  else if (action === 'create-point') createPoint();
  else if (action === 'create-line') createLine();
  else if (drawingModes.includes(action)) { if (!canDraw() || busy) return; clearDrawing(); mode = action; selected = null; render(); status(construction?.owns(action)?$('#construction-hint').textContent:action === 'draw-rectangle'?'اختر زاويتي المستطيل. يحفظ كأربعة خطوط بنقاط مشتركة.':action==='draw-polyline'?'اختر نقاط المسار بالتتابع. Enter أو Escape للإنهاء.':action === 'draw-point' ? 'انقر في الرسم لإنشاء نقطة أصلية. الالتقاط للنقاط الموجودة ضمن 8 بكسل.' : 'حدد بداية الخط ثم نهايته. الالتقاط للنقاط الموجودة · Shift: أفقي/رأسي · Escape: إلغاء.'); }
  else if (action.startsWith('tool-')) { clearDrawing(); mode = action.slice(5); render(); status(mode === 'point' ? 'اختر نقطة موجودة لتعديل X / Y.' : mode === 'line' ? 'اختر خطًا لقياس طوله ومراجعه.' : 'Select object'); }
  else if (action === 'import-mas') $('#mas-file').click();
});
canvas.addEventListener('click', event => {
  if (suppressCanvasClick) { suppressCanvasClick = false; return; }
  if(overview){const cell=event.target.closest('[data-overview-part-id]');if(cell&&!busy){activePart=Number(cell.dataset.overviewPartId);cursor=model(true).totalRecords;selected=null;render();}return;}
  if (drawingActive()) { drawAt(event); return; }
  const point = event.target.closest('[data-point-id]'), line = event.target.closest('[data-line-id]');
  if (point) { selected = { type: 'point', id: Number(point.dataset.pointId) }; if (mode === 'point') { editPoint(selected.id); return; } }
  else if (line) selected = { type: 'line', id: Number(line.dataset.lineId) };
  else selected = null;
  paintSelection(); renderSelection();
});
canvas.addEventListener('dblclick', event => { if (overview) return; if (drawingActive()||dimensionInspectionUi?.active()) return; const point = event.target.closest('[data-point-id]'); if (point) editPoint(point.dataset.pointId); });
canvas.addEventListener('keydown', event => { if(overview){const cell=event.target.closest('[data-overview-part-id]');if(cell&&event.key==='Enter'&&!busy){event.preventDefault();activePart=Number(cell.dataset.overviewPartId);cursor=model(true).totalRecords;setOverview(false);}return;} const point = event.target.closest('[data-point-id]'); if (event.key === 'Enter') { if (point) { event.preventDefault(); editPoint(point.dataset.pointId); } } });
canvas.addEventListener('pointerdown', event => {
  canvas.focus(); suppressCanvasClick = false; if (event.button !== 1 && !(event.button === 0 && event.altKey)) return;
  suppressCanvasClick = true;
  event.preventDefault(); drag = { x: event.clientX, y: event.clientY, view: { ...view } }; canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  const position = world(event), divisor = useCachedPart() ? cacheDivisor(cachedPart()) : 1; text($('#status-coordinates'), overview ? 'ترتيب للعرض فقط' : `X ${decimal(position.x*divisor)} · Y ${decimal(-position.y*divisor)} mm`);
  if (drag) { view.x = drag.view.x-(event.clientX-drag.x)*drag.view.w/canvas.clientWidth; view.y = drag.view.y-(event.clientY-drag.y)*drag.view.h/canvas.clientHeight; draw(); }
  else if(drawingActive()&&construction?.owns(mode))construction.move(event);
  else if (drawingActive()) { drawingPointer = drawingPosition(event); renderDrawing(); if(drawingPointer)text($('#status-coordinates'),`X ${decimal(drawingPointer.x)} · Y ${decimal(drawingPointer.y)} mm`); }
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.12 : 1/1.12, world(event)); }, { passive: false });
$('#drawing-grid').addEventListener('change', () => { drawingPointer = null; renderDrawing(); status($('#drawing-grid').checked ? 'شبكة إحداثيات 1 مم مفعّلة؛ الالتقاط للنقاط الموجودة له الأولوية.' : 'الشبكة مغلقة؛ الالتقاط للنقاط الموجودة ضمن 8 بكسل.'); });
document.addEventListener('keydown', event => {
  if (event.altKey || event.metaKey) return;
  const editing = event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); newFromTemplate(); }
  else if (event.ctrlKey && event.key.toLowerCase() === 'o') { event.preventDefault(); open(); }
  else if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); save(event.shiftKey); }
  else if(event.ctrlKey&&event.key==='F4'){event.preventDefault();closeDocument();}
  else if (event.ctrlKey && event.key.toLowerCase() === 't' && style) { event.preventDefault(); partProperties?.open(); }
  else if (!editing && event.ctrlKey && event.key.toLowerCase() === 'x' && style) { event.preventDefault(); showXValues(); }
  else if (event.key === 'F11' && style) { event.preventDefault(); showZValues(); }
  else if (!editing && event.ctrlKey && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); redo(); }
  else if (!editing && event.ctrlKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
  else if (!editing && event.ctrlKey && event.shiftKey && event.code === 'Digit1') { event.preventDefault(); replay(); }
  else if (!editing && (event.key === 'F6' || event.key === 'Home')) { event.preventDefault(); fit(); }
  else if (!editing && event.key === 'F5' && !document.querySelector('dialog[open]')) { event.preventDefault(); setOverview(true); }
  else if (!editing && event.key === 'F4') { event.preventDefault(); draw(); }
  else if (!editing && !busy && !event.target.closest('button,summary,a,select') && event.key === 'Enter' && mode==='draw-polyline' && drawingActive()) { event.preventDefault(); clearDrawing(); status('انتهى المسار. اختر بداية لمسار جديد.'); }
  else if (!editing && event.key === 'Escape') { closeMenus(); if (drawingActive() && (drawingStart||construction?.pending())) { event.preventDefault();clearDrawing(); status('انتهت المعاينة؛ الخطوط التي رسمتها محفوظة في المستند. اختر بداية جديدة.'); } else { clearDrawing(); mode = 'select'; render(); } }
  else if (!editing && event.key === '+') zoom(.8);
  else if (!editing && event.key === '-') zoom(1.25);
});
window.addEventListener('beforeunload', event => { if (dirty || xzWorkspace?.hasUnsaved() || xzTables?.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } });
let savingBeforeClose = false;
window.desktop?.onSaveBeforeClose?.(async token => {
  if (savingBeforeClose) return;
  savingBeforeClose = true;document.body.inert = true;
  let saved = false;
  try { saved = await save(); }
  finally {
    document.body.inert = false;savingBeforeClose = false;
    await window.desktop.finishClose(token, saved);
  }
});
new ResizeObserver(() => draw()).observe($('#canvas-frame'));
n38 = createN38Ui({
  context:()=>({document:style,partId:activePart,busy,cursor,totalRecords:style?decodeSupportedHistory(style,activePart).totalRecords:0}),
  render,fit,status,dialog,clearDrawing,notice,
  busy:value=>{busy=value;render();},
  commit:(next,label)=>{const draft=originalLine10Ui?.snapshotDraft();clearDrawing();updateDocument(next,label);originalLine10Ui?.restoreDraft(draft);},
  select:(type,id)=>{selected={type,id};paintSelection();renderSelection();}
});
partProperties=createPartPropertiesUi({
  commit:(next,label)=>{clearDrawing();updateDocument(next,label);},
  context:()=>({document:style,filename,activePart,busy}),notice,
  showValues:kind=>{if(kind==='x'){xValuesScope?.selectLocal();showXValues();}else showZValues();},
  preview:(svg,partId)=>renderPropertiesPreview(svg,partId),
  activate:partId=>{if(busy||!summary?.parts.some(part=>part.partId===partId))return;clearDrawing();mode='select';activePart=partId;cursor=model(true).totalRecords;selected=null;render();fit();}
});
xValuesScope=createXValuesScopeUi({
  changeTable:async operation=>{if(busy)throw Error("انتظر انتهاء العملية الحالية.");if(n38?.eligible()&&operation.action==="add"&&operation.scope==="local"){const draft=originalLine10Ui?.snapshotDraft();await n38.addX();originalLine10Ui?.restoreDraft(draft);return;}if(operation.action==='add'&&operation.scope==='local'&&!xzTables.hasPending()){let r;try{r=appendOriginalX(style,{partId:activePart,sizeKey:metadata.referenceSize.name});}catch(error){if(readNativeXValues(style,{partId:activePart}).tables.local.status!=='available')throw error;}if(r){const draft=originalLine10Ui?.snapshotDraft();clearDrawing();updateDocument(r.document,'أضيفت X'+r.index+' مباشرة برقم تلقائي.');originalLine10Ui?.restoreDraft(draft);renderXValues();await xzTables.prepare();return;}}if(n38?.eligible())throw Error("قالب الرسم المباشر يستخدم محرر X1/X2 الخاص به؛ عمليات الجدول العامة متاحة للجداول الأصلية الأخرى.");await xzTables.changeTable(operation);renderXValues();await xzTables.prepare();},
  context:()=>({document:style,parameterDocument:xzTables?.document(),activePart,busy,parts:(summary?.parts||[]).map(p=>({id:p.partId,name:partName(p.partId)}))}),
  activate:partId=>{if(busy||!summary?.parts.some(p=>p.partId===partId))return;clearDrawing();mode='select';activePart=partId;cursor=model(true).totalRecords;selected=null;render();fit();}
});
zInspector=createZInspectorUi({
  workspaceState:()=>xzTables?.hasGeneralChanges()?null:xzWorkspace?.state(),parameterValues:()=>xzTables?.calculated(),formula:entry=>xzTables?.formula(entry),onSelection:entry=>xzTables?.selection(entry),
  context:()=>({document:style,partId:activePart,encoding:valuesEncoding,sizeKey:metadata?.referenceSize?.name,cursor,totalRecords:style?decodeSupportedHistory(style,activePart).totalRecords:0}),
  inspectCurrentValues:context=>inspectNativeObservedZValues(context.document,{partId:context.partId,sizeKey:context.sizeKey,throughRecord:context.cursor})
});
alaaAppend=createAlaaAppendUi({
  context:()=>({document:style,partId:activePart,busy,cursor,totalRecords:style?decodeSupportedHistory(style,activePart).totalRecords:0}),
  loadEngine:()=>import('./native-part-drawing-adapter.js'),render,fit,status,dialog,clearDrawing,notice,
  busy:value=>{busy=value;render();},
  commit:(next,label)=>{clearDrawing();updateDocument(next,label);},
  select:(type,id)=>{selected={type,id};paintSelection();renderSelection();}
});
xzWorkspace=createXZWorkspace({externalChanges:()=>xzTables?.hasGeneralChanges(),context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,cursor,filename})});
xzTables=createXZTableEditing({workspace:xzWorkspace,applyVerified:async edit=>{if(busy)throw Error('انتظر انتهاء العملية الحالية.');const sizeKey=metadata?.referenceSize?.name,m=createPartHistoryCalculation(style,{sizeKey}).get(activePart);if(!m.historyFullyExecuted)return false;if(cursor!==model(true)?.totalRecords)throw Error('استعد السجل الكامل قبل تعديل X/Z.');busy=true;try{let r;try{r=editOriginalScalarValue(style,{sizeKey,edit});}catch(error){if(error.message==='لم تتغير الهندسة.')return false;throw error;}const draft=originalLine10Ui?.snapshotDraft();clearDrawing();updateDocument(r.document,'تعديل X/Z وإعادة حساب الهندسة والبارتات التابعة');originalLine10Ui?.restoreDraft(draft);return true;}finally{busy=false;render();}},context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,filename}),refreshZ:()=>zInspector.refresh()});
for(const id of ['x-values-dialog','z-values-dialog']){const button=document.createElement('button');button.type='button';button.dataset.action='xz-workspace';button.className='xz-entry';button.textContent='تجربة X/Z على الرسم…';$('#'+id+' .dialog-actions').prepend(button);}
pointConstruction=createPointConstructionUi({canvas,
 context:()=>({document:style,active:drawingActive()&&['draw-point','draw-line','draw-polyline'].includes(mode)||!!originalLine10Ui?.pickingOrigin(),ending:!!drawingStart||!!originalLine10Ui?.ending(),busy,parameters:(()=>{const c=n38?.capability();if(originalLine10Ui?.pickingOrigin())return originalLine10Ui.acceptsCoordinateOperands()?coordinateOperandChoices(style,{partId:activePart,sizeKey:metadata?.referenceSize?.name}):[];if(!c?.eligible)return[];return ["x","z"].flatMap(kind=>(c.bindingEligibility?.[kind]||[]).filter(e=>e.eligible).map(e=>({name:kind.toUpperCase()+e.index,value:c.calculatedValues[kind.toUpperCase()+e.index]}))).filter(e=>Number.isFinite(e.value));})(),linked:originalLine10Ui?.pickingOrigin()?true:!!n38?.eligible(),allowedModes:originalLine10Ui?.pickingOrigin()?['point','line','fraction','xy']:null,points:originalLine10Ui?.pickingOrigin()?originalLine10Ui.originPoints():(model(true)?.points||[]),lines:originalLine10Ui?.pickingOrigin()?originalLine10Ui.originLines():(model(true)?.lines||[]),scale:Math.abs(canvas.getScreenCTM()?.a)||1,operand:(raw,fallback)=>{const t=String(raw).trim();if(!t)return{value:fallback};if(/^[XZ][1-9]\d?$/i.test(t)){const name=t.toUpperCase();if(originalLine10Ui?.pickingOrigin()&&!originalLine10Ui.acceptsCoordinateOperands())throw Error('مراجع X/Z لهذا الوضع قيد التحقق.');const value=originalLine10Ui?.pickingOrigin()?coordinateOperandChoices(style,{partId:activePart,sizeKey:metadata?.referenceSize?.name}).find(r=>r.name===name)?.value:n38?.capability()?.calculatedValues?.[name];if(!Number.isFinite(value))throw Error('المعامل غير معرّف في البارت الحالي.');return{value,operand:{kind:name[0].toLowerCase(),index:Number(name.slice(1))}};}const value=Number(t);if(!Number.isFinite(value)||Math.abs(value)>1e6)throw Error('أدخل إحداثيًا صحيحًا أو معامل X/Z معرّفًا.');return{value};}}),
 clearPending:()=>{drawingPointer=null;},redraw:renderDrawing,cancel:()=>{if(busy)return;originalLine10Ui?.close();clearDrawing();mode='select';render();}
});
construction=createConstructionUi({
 mode:()=>mode,eligible:canDraw,busy:()=>busy,world,svg:svgElement,decimal,
 lines:constructionLines,linkedLines:linkedConstructionLines,scale:()=>Math.abs($('#native-canvas').getScreenCTM()?.a)||1,linkedPoint:options=>alaaAppend.drawLinkedPoint(options),resizeLine:options=>alaaAppend.resizeLine(options),points:()=>model(true)?.points||[],redraw:renderDrawing,status,notice,
 select:(type,id)=>{selected={type,id};paintSelection();renderSelection();},
 point:async p=>{const engine=n38?.eligible()?n38:alaaAppend?.eligible()?alaaAppend:null;const result=engine?await engine.drawPoint(p):appendDrawingPoint(style,{partId:activePart,...p});if(!engine)updateDocument(result.document,'Created midpoint');return result;},
 segment:async(a,b)=>{const engine=n38?.eligible()?n38:alaaAppend?.eligible()?alaaAppend:null;const result=engine?await engine.drawSegment(a,b):appendDrawingSegment(style,{partId:activePart,start:a,end:b});if(!engine)updateDocument(result.document,'Created numerical construction line');return result;}
});
ownedParts=createOwnedPartsUi({
 context:()=>({document:style,partId:activePart,name:partName(activePart),busy,complete:!!style&&cursor===model(true).totalRecords}),
 error:message=>notice(message,true),
 busy:value=>{busy=value;render();},
 commit:(next,partId,label)=>{clearDrawing();mode='select';selected=null;hiddenParts.clear();partFilter='';$('#part-search').value='';updateDocument(next,label,partId);fit();}
});
render();
initializeLocalUpdates();
initializeToolbox();

// A separate MAS import preserves its native ordering and does not alter MDL data.
const masInput = document.createElement('input'); masInput.type = 'file'; masInput.accept = '.mas'; masInput.id = 'mas-file'; masInput.hidden = true; document.body.append(masInput);
const masButton = document.createElement('button'); masButton.type = 'button'; masButton.dataset.action = 'import-mas'; masButton.textContent = 'Open MAS chart…';
$('#measurements-dialog .dialog-actions').prepend(masButton);
masInput.addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try { if (file.size > 2*1024*1024) throw new Error('MAS chart is too large.'); chart = parseMasChart(new Uint8Array(await file.arrayBuffer()), { name: file.name }); showMeasurements(); }
  catch (error) { notice(error.message, true); }
});

// Overview coordinates are presentation-only; no document or geometry is mutated.
function overviewParts(){return (summary?.parts||[]).filter(part=>!hiddenParts.has(part.partId));}
function overviewBounds(){const count=overviewParts().length,columns=Math.max(1,Math.ceil(Math.sqrt(count*1.45)));return{x:0,y:0,w:columns*240,h:Math.max(1,Math.ceil(count/columns))*220};}
function setOverview(value){if(!style||busy)return;overview=value;if(value)hiddenParts.clear();clearDrawing();mode='select';selected=null;render();fit();status(value?'جميع البارتات ظاهرة؛ استخدم العين لإخفاء بارت أو النشط للعودة إلى الرسم.':'عرض البارت النشط.');}
function drawOverview(parent){
  const parts=overviewParts(),columns=overviewBounds().w/240;
  if(!parts.length){parent.append(svgElement('text',{x:12,y:35,fill:'#c6d5df','font-size':14},'لا توجد بارتات ظاهرة — اضغط إظهار الكل'));return;}
  parts.forEach((part,index)=>{
    const x=(index%columns)*240,y=Math.floor(index/columns)*220;
    const cell=svgElement('g',{'data-overview-part-id':part.partId,role:'button',tabindex:0,'aria-label':'Part '+counter(part.partId)+' — '+partName(part.partId),'aria-pressed':String(part.partId===activePart)});
    cell.append(svgElement('rect',{x:x+3,y:y+3,width:234,height:214,rx:5,fill:part.partId===activePart?'#122735':'#0c171e',stroke:part.partId===activePart?'#55c9ff':'#304654','stroke-width':1.2,'vector-effect':'non-scaling-stroke'}));
    const drawing=svgElement('svg',{x:x+12,y:y+28,width:216,height:163,'pointer-events':'none','aria-hidden':'true'});
    renderPropertiesPreview(drawing,part.partId);cell.append(drawing);
    const title=svgElement('svg',{x:x+12,y:y+6,width:216,height:21,'pointer-events':'none'});title.append(svgElement('text',{x:0,y:16,fill:part.partId===activePart?'#7ed8ff':'#dce5ed','font-size':13},counter(part.partId)+' — '+partName(part.partId)));cell.append(title);
    const preview=useCachedPart(part.partId)?cachedPart(part.partId):null;
    const description=preview?(preview.noStoredGeometry?'No stored geometry':preview.unavailable?'Preview unavailable':preview.objects.length+'/'+preview.totalObjects+' objects · '+preview.unsupported.length+' omitted'):'Point / line geometry';
    cell.append(svgElement('text',{x:x+12,y:y+207,fill:'#9eb2bf','font-size':10,'pointer-events':'none'},description));parent.append(cell);
  });
}


originalLine10Ui=createOriginalLine10Ui({fitCreated:()=>fit(),openCreatedCurve:id=>{fit();directPathEditor?.open(id);},resetOrigin:()=>pointConstruction?.reset(),originChanged:()=>{pointConstruction?.refresh();originalPointEditor?.refresh();originalInsertUi?.refresh();originalPointEditor?.paint();originalInsertUi?.paint();directPathEditor?.paint();},resolveOrigin:event=>{const p=world(event);return pointConstruction.resolve(event,{x:p.x,y:-p.y});},notice:message=>notice(message,true),context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()}),busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
directPathEditor=createDirectPathEditor({openGrain:id=>originalGrainUi?.open(id)??false,openNotch:id=>originalNotchUi?.open(id)??false,openCorner:id=>originalCornerUi?.open(id)??false,openShape:id=>originalLine10Ui?.open(id)||originalShapeUi?.open(id)||false,openStoredLength:id=>originalLengthUi?.openStored(id)??false,context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),notice,busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalGeometryUi=createOriginalGeometryUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords}),dialog,notice,busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalGeometryUi.refresh();

originalCurveControlsUi=createOriginalCurveControlsUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords}),dialog,notice,busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalCurveControlsUi.refresh();

recordedDimensionsUi=createRecordedDimensionsUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords}),dialog,notice});
recordedDimensionsUi.refresh();

dimensionInspectionUi=createDimensionInspectionUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,scale:()=>view.w/Math.max(1,canvas.clientWidth),notice,prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();clearDrawing();mode='select';selected=null;render();}});
dimensionInspectionUi.refresh();


groupedToolsUi=createGroupedToolPalette({context:()=>({busy}),measure:value=>dimensionInspectionUi.selectMode(value),cancel:()=>{originalLine10Ui?.close();originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;render();}});
lineTransformUi=createLineTransformUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,divisor:useCachedPart()?cacheDivisor(cachedPart()):1,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active(),busy,full:!!style&&cursor===model(true)?.totalRecords,overview}),prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalPointUi=createOriginalPointToolsUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,scale:()=>view.w/Math.max(1,canvas.clientWidth),prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
render();


originalPointEditor=createOriginalPointEditor({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),scale:()=>view.w/Math.max(1,canvas.clientWidth),prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('points',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});

originalLengthUi=createOriginalLengthUi({reveal:()=>groupedToolsUi?.show('length',{preserve:true}),editOffset:id=>{groupedToolsUi?.show('curves',{preserve:true});directPathEditor?.open(id);},context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,scale:()=>view.w/Math.max(1,canvas.clientWidth),prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});

originalShapeUi=createOriginalShapeUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('shapes',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});

originalDeleteUi=createOriginalDeleteUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('delete',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});

originalStyleUi=createOriginalStyleUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('attributes',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});

originalCornerUi=createOriginalCornerUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('corners',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});

originalNotchUi=createOriginalNotchUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,scale:()=>view.w/Math.max(1,canvas.clientWidth),prepare:group=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show(group,{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});

originalGrainUi=createOriginalGrainUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,prepare:group=>{originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show(group,{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalParallelUi=createOriginalParallelUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalCutUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,prepare:()=>{originalJoinUi?.close();originalCutUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('parallel',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalCutUi=createOriginalCutUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,prepare:()=>{originalJoinUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('split',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalCurveMorphUi=createOriginalCurveMorphUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalJoinUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,prepare:()=>{originalJoinUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCutUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('curves',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
originalTextUi=createOriginalTextUi({world,context:()=>({document:style,partId:activePart,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),prepare:()=>{groupedToolsUi?.show('texts');clearDrawing();mode='select';selected=null;render();},commit:(next,label)=>updateDocument(next,label)});originalTextUi.refresh();
originalAssistantUi=createOriginalAssistantUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),prepare:()=>{originalLine10Ui?.close();originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();groupedToolsUi?.show('assistant',{preserve:true});clearDrawing();mode='select';selected=null;render();},commit:(next,label)=>updateDocument(next,label)});originalAssistantUi.refresh();


originalDartUi=createOriginalDartShorteningUi({world,context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),prepare:()=>{originalLine10Ui?.close();originalJoinUi?.close();originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('darts',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});originalDartUi.refresh();
originalJoinUi=createOriginalJoinUi({context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,drawing:drawingActive()||!!originalDartUi?.active()||!!originalLine10Ui?.active()||!!originalCutUi?.active()||!!originalParallelUi?.active()||!!originalGrainUi?.active()||!!originalNotchUi?.active()||!!originalCornerUi?.active()||!!originalStyleUi?.active()||!!originalDeleteUi?.active()||!!originalShapeUi?.active()||!!dimensionInspectionUi?.active()||!!lineTransformUi?.active()||!!originalPointUi?.active()||!!directPathEditor?.active()||!!originalPointEditor?.active()||!!originalLengthUi?.active()||!!originalCurveMorphUi?.active()||!!originalTextUi?.active(),divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),world,prepare:()=>{originalCutUi?.close();originalParallelUi?.close();originalGrainUi?.close();originalNotchUi?.close();originalCornerUi?.close();originalStyleUi?.close();originalDeleteUi?.close();originalShapeUi?.close();originalLengthUi?.close();originalCurveMorphUi?.close();originalTextUi?.close();originalAssistantUi?.close();originalPointEditor?.close();originalInsertUi?.close();originalPointUi?.close();lineTransformUi?.close();directPathEditor?.close();dimensionInspectionUi?.close();clearDrawing();mode='select';selected=null;groupedToolsUi?.show('link',{preserve:true});render();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});






originalInsertUi=createOriginalInsertUi({world,context:()=>({document:style,partId:activePart,sizeKey:metadata?.referenceSize?.name,busy,full:!!style&&cursor===model(true)?.totalRecords,overview,divisor:useCachedPart()?cacheDivisor(cachedPart()):1}),scale:()=>view.w/Math.max(1,canvas.clientWidth),focus:points=>{if(!points.length)return;const divisor=useCachedPart()?cacheDivisor(cachedPart()):1,xs=points.map(p=>p[0]/divisor),ys=points.map(p=>-p[1]/divisor),x=Math.min(...xs),y=Math.min(...ys),bw=Math.max(...xs)-x,bh=Math.max(...ys)-y,ratio=Math.max(1,canvas.clientWidth)/Math.max(1,canvas.clientHeight);let w=Math.max(40,bw*1.3),h=Math.max(40,bh*1.3);if(w/h<ratio)w=h*ratio;else h=w/ratio;view={x:x+bw/2-w/2,y:y+bh/2-h/2,w,h};draw();},busy:value=>{busy=value;render();},commit:(next,label)=>{clearDrawing();updateDocument(next,label);}});
render();


bindDraggablePalettes();
