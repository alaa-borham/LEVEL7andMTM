/** 0.9.118 LEVEL7 design mode.
 * The LEVEL7 parametric design engine (l7design/index.html) runs in a child
 * frame over the work area. The host program draws its tool palette with its
 * own icons, and every click selects the matching engine tool. New designs are
 * saved as LEVEL7 design files (.level7.json), never as MDL: GRAFIS files stay
 * read and edited by the existing MDL path. Files go through the host's own
 * dialogs (window.desktop); the frame has no file or Node access. */
import { toolIcon } from './grouped-tool-palette.js';

// Engine tool key -> host icon drawing.
const GLYPH = {
  point: 'point', pointOn: 'pointFraction', intersect: 'pointCluster', pointMove: 'vector',
  line: 'line', lineAngle: 'angle', parallel: 'parallel', parallelMany: 'offsetEnds', setLength: 'lengthTo', trim: 'cutEnd',
  cornerSharp: 'corners', cornerRound: 'circularCorner', cornerChamfer: 'chamfer',
  dimSum: 'sum', dimAligned: 'distance', dimH: 'horizontal', dimV: 'vertical', dimLength: 'length', dimAngle: 'threeAngle',
  stitchLock: 'stitchLock', stitchDouble: 'stitchDouble', stitchZigzag: 'stitchZigzag', stitchDeco: 'stitchDeco', stitchGather: 'stitchGather',
  grainLine: 'grain', symButton: 'symButton', symDrill: 'symDrill', symCross: 'symCross',
  textCreate: 'textCreate', delText: 'delFrame', delTextFrame: 'delFrame', delSymbolsFrame: 'delFrame', delStitchesFrame: 'delFrame', delNotchesFrame: 'delFrame',
  delPoints: 'delPoints', delLines: 'delLines', delPointsFrame: 'delFrame', delLinesFrame: 'delFrame', delAllFrame: 'delFrame',
  convertNotch: 'convertNotch',   inheritBlock: 'library', saveBlock: 'folder', inheritObjects: 'insertLines', inheritPart: 'insertPart', mirrorCopy: 'mirror', mirrorMove: 'linkedReflection', mirrorPts: 'mirrorPts', mirrorDir: 'mirrorDir', scalePts: 'scalePts', scaleDir: 'scaleDir', curve: 'curve10', piece: 'seam',
  notch: 'symbols', measureDist: 'distance', measureLength: 'length'
};
const HINT = {
  convertNotch: 'انقر النوتش في القطعة ثم اختر شكله: شق I أو T أو V أو مربع. يُرسم ويُقص بالبلوتر بهذا الشكل.',
  inheritBlock: 'يفتح مكتبة القوالب: اختر قالباً فيُدرج كبارت جديد، وتُضاف قيم X/Z التي يحتاجها.', saveBlock: 'يحفظ البارت النشط في مكتبة القوالب على هذا الجهاز، لتستخدمه في أي تصميم.',
  textCreate: 'انقر موضع النص ثم اكتبه وحدد ارتفاعه وزاويته. اكتب {X1} أو {Z3} ليظهر الرقم الحالي. دابل كليك على النص لتعديله.',
  delText: 'انقر النص المراد حذفه.', delTextFrame: 'انقر ركني إطار: تُحذف النصوص التي تقع داخله.', delSymbolsFrame: 'انقر ركني إطار: تُحذف الأزرار والثقوب والعلامات وخطوط النسيج داخله.', delStitchesFrame: 'انقر ركني إطار: تُحذف الغرز على الخطوط الواقعة داخله.', delNotchesFrame: 'انقر ركني إطار: تُحذف نوتشات القطع داخله.',
  stitchLock: 'انقر الخط أو المنحنى في الجهة التي تريد الغرزة فيها، ثم اكتب بعدها عن الحافة.', stitchDouble: 'انقر الخط أو المنحنى في جهة الغرزة المزدوجة، ثم اكتب البعد.', stitchZigzag: 'انقر الخط أو المنحنى في جهة غرزة الزجزاج، ثم اكتب البعد.', stitchDeco: 'انقر الخط أو المنحنى في جهة الغرز الزخرفية، ثم اكتب البعد.', stitchGather: 'انقر الخط أو المنحنى في جهة الكشكشة، ثم اكتب البعد.',
  grainLine: 'انقر بداية خط النسيج ثم نهايته.', symButton: 'انقر موضع الزر ثم اكتب قطره.', symDrill: 'انقر موضع الثقب ثم اكتب قطره.', symCross: 'انقر موضع العلامة.',
  delPoints: 'انقر النقاط واحدة واحدة ثم Enter أو كليك يمين؛ ما يعتمد عليها يُسأل عنه قبل الحذف.', delLines: 'انقر الخطوط والمنحنيات ثم Enter أو كليك يمين.',
  delPointsFrame: 'انقر ركني إطار: تُحذف النقاط الواقعة داخله بالكامل.', delLinesFrame: 'انقر ركني إطار: تُحذف الخطوط والمنحنيات الواقعة داخله بالكامل.', delAllFrame: 'انقر ركني إطار: يُحذف كل ما داخله.',
  inheritObjects: 'يفتح نافذة: اختر بارتاً سابقاً ثم العناصر؛ تُنسخ إلى البارت النشط وتبقى مرتبطة بالأصل.',
  inheritPart: 'يفتح نافذة: اختر بارتاً سابقاً فتُنسخ كل عناصره إلى البارت النشط مرتبطة بالأصل.',
  mirrorPts: 'انقر نقطتي محور الانعكاس، ثم العناصر، ثم Enter أو كليك يمين؛ اختر نسخة أو نقل.',
  mirrorDir: 'انقر نقطة على المحور، ثم العناصر، ثم Enter؛ اكتب اتجاه المحور (رقماً أو X/Z).',
  scalePts: 'انقر مركز التكبير، ثم العناصر، ثم Enter؛ اكتب النسبة % (100 = نفس الحجم) رقماً أو X/Z.',
  scaleDir: 'انقر نقطة الأساس، ثم العناصر، ثم Enter؛ اكتب الاتجاه والنسبة %: يُمط في ذلك الاتجاه فقط.',
  parallelMany: 'انقر الخطوط والمنحنيات واحداً واحداً، كلاً في الجهة التي تريد الموازي فيها، ثم Enter أو كليك يمين. اكتب المسافة رقماً أو X/Z أو حرّك الماوس، ثم انقر للاعتماد. تبقى مرتبطة: غيّر X فتتحرك كلها.',
  cornerSharp: 'انقر الخطين قرب الزاوية؛ النتيجة تظهر قبل النقرة الثانية، ويمتدان أو يُقصّان حتى يلتقيا.',
  dimAligned: 'انقر نقطتين، ثم حرّك الماوس لوضع خط البعد وانقر. القيمة تتحدث مع الباترون.',
  dimH: 'انقر نقطتين، ثم حرّك الماوس لأعلى أو أسفل لوضع البعد الأفقي وانقر.',
  dimV: 'انقر نقطتين، ثم حرّك الماوس يميناً أو يساراً لوضع البعد الرأسي وانقر.',
  dimLength: 'انقر الخط أو المنحنى، ثم حرّك الماوس لوضع بعد الطول وانقر.',
  dimAngle: 'انقر نقطة على الضلع الأول، ثم رأس الزاوية، ثم نقطة على الضلع الثاني.',
  dimSum: 'انقر الخطوط والمنحنيات واحداً واحداً، ثم Enter أو كليك يمين؛ يظهر مجموع أطوالها Σ. اسحب أي بُعد لتقريبه أو إبعاده، ودابل كليك عليه لإضافة نص أو قلب اتجاه القيمة.',
  cornerRound: 'انقر الخطين قرب الزاوية (النتيجة تظهر قبل النقرة الثانية)، ثم حرّك الماوس: نصف القطر يتبعه. انقر لتثبيته أو اكتب القيمة.',
  cornerChamfer: 'انقر الخطين قرب الزاوية، ثم حرّك الماوس: مسافة القطع تتبعه. انقر لتثبيتها أو اكتب القيمة.',
  point: 'انقر على اللوحة لوضع نقطة، ثم عدّل س/ص في المربع.',
  pointOn: 'انقر الخط قرب الطرف الذي تُقاس منه، ثم حرّك الماوس على الخط: النقطة تتبعه والمسافة تظهر. انقر لتثبيتها أو اكتب القيمة.',
  intersect: 'انقر خطين أو منحنيين؛ نقطة التقاطع تظهر قبل النقرة الثانية.',
  pointMove: 'انقر النقطة ثم الخط الذي يحدد الاتجاه، ثم حرّك الماوس: النقطة تتحرك والمسافة تظهر. انقر لتثبيتها.',
  line: 'انقر نقطة البداية ثم النهاية، أو موضعين فارغين؛ الخط يتبع الماوس بطوله وزاويته.',
  lineAngle: 'انقر نقطة البداية (أو مكاناً فارغاً)، ثم حرّك الماوس: الخط يتبعه والزاوية والطول يظهران. انقر لتثبيته، أو اكتب القيمة في المربع.',
  parallel: 'انقر الخط، ثم حرّك الماوس إلى الجهة المطلوبة: الخط الموازي يتبعه والمسافة تظهر. انقر لتثبيته أو اكتب المسافة.',
  setLength: 'انقر الخط قرب الطرف الذي يتغير، ثم حرّك الماوس: الخط يطول أو يقصر معه. انقر لتثبيته أو اكتب الطول.',
  trim: 'انقر الخط المراد قصه أو تمديده، ثم مرّر الماوس على الحد: النتيجة تظهر قبل النقر.',
  mirrorCopy: 'انقر محور الانعكاس، ثم العناصر، ثم Enter أو كليك يمين.',
  mirrorMove: 'اختر العناصر ثم محور الانعكاس.',
  curve: 'انقر نقاط المنحنى بالترتيب (موجودة أو فارغة)، ثم Enter أو كليك يمين. بعدها اسحب الدائرة الحمراء عند كل طرف لضبط اتجاهه؛ دابل كليك عليها يعيده حراً.',
  piece: 'اختر حدود القطعة بالترتيب ثم Enter.',
  notch: 'اختر نقطة على حد القطعة.',
  measureDist: 'اختر نقطتين لقياس المسافة بينهما.',
  measureLength: 'اختر خطاً أو منحنى لقياس طوله.'
};
const KIND = name => /\.xlsx$/i.test(name) ? 'xlsx' : /\.csv$/i.test(name) ? 'csv' : /\.level7\.json$|\.json$/i.test(name) ? 'design' : /\.plt$/i.test(name) ? 'hpgl' : /\.rul$/i.test(name) ? 'rul' : /\.dxf$/i.test(name) ? 'dxf' : /\.iso$/i.test(name) ? 'iso' : null;
/** Same shortcuts as the program's toolbox (and the engine frame, which forwards them). */
function shortcut(e, typing) {
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.shiftKey && !e.altKey) return { s: 'save', n: 'new', o: 'open', e: 'aama', g: 'tab-sizes', t: 'tab-partlist' }[k] || (!typing && { z: 'undo', y: 'redo', x: 'tab-x' }[k]) || null;
  if (e.key === 'F4') return 'dup';
  if (e.key === 'F7') return 'dims';
  if (e.key === 'F8') return 'lengths';
  if (e.key === 'F9') return 'imgtoggle';
  if (e.altKey && !ctrl && k === 'o') return 'visibility';
  if (e.key === 'F6') return 'fit';
  if (e.key === 'F5') return 'tab-steps';
  if (e.key === 'F11') return 'tab-z';
  if (!typing && !ctrl && !e.altKey && (e.key === '+' || e.key === '=')) return 'zoomIn';
  if (!typing && !ctrl && !e.altKey && e.key === '-') return 'zoomOut';
  return null;
}
const FRAME_SRC = 'assets/l7design/index.html?embedded=1';

export function installDesignMode() {
  const workArea = document.querySelector('.work-area');
  const fileMenu = [...document.querySelectorAll('.menubar details.menu')].find(d => d.querySelector('summary')?.textContent.trim() === 'File');
  if (!workArea || !fileMenu || document.querySelector('#l7-design')) return;
  const desktop = window.desktop;
  let frame = null, ready = false, queue = [], tools = [], active = null, status = null;

  const host = document.createElement('section');
  host.id = 'l7-design'; host.className = 'l7-design'; host.hidden = true; host.dir = 'rtl';
  host.setAttribute('aria-label', 'تصميم LEVEL7');
  host.innerHTML = '<div class="l7-design-stage"><div class="l7-design-bar toolbox-commands" role="toolbar" aria-label="أوامر تصميم LEVEL7"></div><div class="l7-design-guide" aria-live="polite" hidden><b class="l7g-title"></b><div class="l7g-pic" aria-hidden="true"></div><span class="l7g-text"></span><footer><button type="button" class="l7g-ok" data-l7d-step="confirm" title="تأكيد الخطوة · Enter">✓</button><button type="button" class="l7g-back" data-l7d-step="back" title="رجوع خطوة">‹</button></footer></div></div><aside class="l7-design-palette" aria-label="أدوات تصميم LEVEL7"><button type="button" class="l7-design-close" data-l7d="close" title="إغلاق التصميم والعودة لملفات MDL">×</button><div class="l7-design-tools" role="toolbar" aria-orientation="vertical"></div></aside>';
  workArea.append(host);
  const stage = host.querySelector('.l7-design-stage'), toolsBox = host.querySelector('.l7-design-tools');
  const guide = host.querySelector('.l7-design-guide');

  // Command bar in the style of the program's own toolbox, with the same shortcuts.
  const icon = id => `<svg aria-hidden="true"><use href="#icon-${id}"/></svg>`, letter = t => `<span class="palette-letter" aria-hidden="true">${t}</span>`;
  const bar = [
    [['product', icon('info'), 'Info', 'معلومات المنتج · Product info'], ['save', icon('save'), 'Save', 'حفظ التصميم · Ctrl+S']],
    [['fit', icon('fit'), 'F6', 'ملء الشاشة بالرسم · F6'], ['tab-steps', icon('history'), 'Record', 'Record · سجل الإنشاء · F5']],
    [['tab-x', letter('X'), 'Ctrl+X', 'القياسات X · Ctrl+X'], ['tab-z', letter('Z'), 'F11', 'المعادلات Z · F11'], ['tab-sizes', icon('grade'), 'Ctrl+G', 'المقاسات والتدرج · Ctrl+G'], ['tab-pieces', icon('parts'), 'Pieces', 'القطع'], ['tab-partlist', icon('parts'), 'Parts', 'البارتات (تنظيم البارتات) · Ctrl+T']],
    [['zoomOut', letter('−'), '−', 'تصغير · −'], ['zoomIn', letter('+'), '+', 'تكبير · +']],
    [['visibility', icon('eye'), 'View', 'الرؤية: ما يظهر على الرسم · Alt+O'], ['dims', letter('↔'), 'F7', 'إظهار/إخفاء الأبعاد · F7'], ['dup', icon('search'), 'F4', 'إبراز العناصر المكررة · F4'], ['lengths', letter('mm'), 'F8', 'إظهار أطوال الخطوط والمنحنيات · F8'], ['images', letter('🖼'), 'F9', 'صور الخلفية للتتبع (F9 إظهار/إخفاء)'], ['arrange', icon('dock'), 'Arrange', 'ترتيب البارتات: كل البارتات بصور كبيرة']],
    [['undo', icon('undo'), 'Undo', 'تراجع · Ctrl+Z'], ['redo', icon('undo'), 'Redo', 'إعادة · Ctrl+Y']],
    [['new', icon('new'), 'New', 'تصميم جديد · Ctrl+N'], ['open', icon('open'), 'Open', 'فتح تصميم · Ctrl+O']],
    [['marker', letter('✂'), 'Marker', 'التعشيق: كل بارتات الإنتاج بكل المقاسات والكميات (ملف AAMA واحد)'], ['iso', letter('ISO'), 'ISO/PLT', 'ملف القص بعد التعشيق: ISO لماكينة القص (Bullmer / FK / Yin) أو PLT، من ملف تعشيق DXF أو PLT'], ['aama', letter('AAMA'), 'Ctrl+E', 'تصدير القطع DXF-AAMA للتعشيق · Ctrl+E'], ['dxf', letter('DXF'), 'DXF', 'تصدير خطوط البناء DXF'], ['plt', letter('PLT'), 'PLT', 'تصدير القطع PLT للبلوتر']]
  ];
  const barBox = host.querySelector('.l7-design-bar');
  for (const group of bar) {
    const g = document.createElement('div'); g.className = 'palette-group';
    for (const [action, glyph, small, title] of group) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'palette-command l7d-command'; b.dataset.l7dCommand = action;
      b.title = title; b.setAttribute('aria-label', title); b.innerHTML = glyph + `<small>${small}</small>`; if (action === 'redo') b.classList.add('redo-command');
      g.append(b);
    }
    barBox.append(g);
  }
  const cmdBox = barBox;
  const statusOut = document.createElement('output'); statusOut.className = 'l7-design-status'; statusOut.setAttribute('aria-live', 'polite'); barBox.append(statusOut);
  status = text => { statusOut.textContent = text; };

  const send = msg => { if (ready && frame?.contentWindow) frame.contentWindow.postMessage(msg, '*'); else queue.push(msg); };
  const dark = () => document.body.classList.contains('ui-dark');
  const ensureFrame = () => {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.id = 'l7-design-frame'; frame.title = 'محرك تصميم LEVEL7';
    frame.src = FRAME_SRC + (dark() ? '&theme=dark' : '');
    stage.append(frame);
  };
  const open = () => {
    ensureFrame(); host.hidden = false; document.body.classList.add('l7-design-on');
    for (const d of document.querySelectorAll('.menubar details.menu')) d.open = false;
  };
  const close = () => { send({ type: 'l7:cancel' }); host.hidden = true; document.body.classList.remove('l7-design-on'); };
  // 0.9.120: a slim strip of category icons at the right edge; each icon (small corner
  // triangle) opens a flyout listing its tools by icon and name. The strip icon shows the
  // last tool used in that category. Export is a category of its own.
  let openCat = null, last = {}, cats = [];
  try { last = JSON.parse(localStorage.getItem('level7.design.lastTools') || '{}') || {}; } catch {}
  const categories = () => {
    const list = [], byName = new Map();
    for (const t of tools) { if (!byName.has(t.group)) { const c = { name: t.group, items: [] }; byName.set(t.group, c); list.push(c); } byName.get(t.group).items.push({ tool: t.key, name: t.name, glyph: GLYPH[t.key] || 'point' }); }
    list.push({ name: 'التصدير والحفظ', items: [['save', 'حفظ التصميم · Ctrl+S', 'folder'], ['aama', 'تصدير AAMA للتعشيق · Ctrl+E', 'manufacturing'], ['dxf', 'تصدير DXF', 'line20'], ['plt', 'تصدير PLT للبلوتر', 'raster']].map(([command, name, glyph]) => ({ command, name, glyph })) });
    return list;
  };
  const stripIcon = c => { const it = c.items.find(x => x.tool && x.tool === last[c.name]) || c.items[0]; return toolIcon(it.glyph) || toolIcon('point'); };
  const renderTools = () => {
    toolsBox.replaceChildren();
    cats = categories();
    for (const c of cats) {
      const wrap = document.createElement('div'); wrap.className = 'l7-cat';
      const head = document.createElement('button'); head.type = 'button'; head.className = 'l7-design-cat'; head.dataset.l7dCat = c.name;
      head.setAttribute('aria-expanded', 'false'); head.setAttribute('aria-haspopup', 'menu'); head.title = c.name + ' · كليك: آخر أداة، كليك يمين: باقي الأدوات'; head.setAttribute('aria-label', c.name);
      head.innerHTML = stripIcon(c);
      const panel = document.createElement('div'); panel.className = 'l7-design-flyout'; panel.hidden = true; panel.dataset.l7dCatPanel = c.name; panel.setAttribute('role', 'menu');
      panel.innerHTML = `<header>${c.name}</header>`;
      for (const it of c.items) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'l7-design-tool'; b.setAttribute('role', 'menuitem');
        if (it.tool) { b.dataset.l7dTool = it.tool; b.setAttribute('aria-pressed', 'false'); } else b.dataset.l7dCommand = it.command;
        b.innerHTML = (toolIcon(it.glyph) || toolIcon('point')) + `<span>${it.name}</span>`;
        panel.append(b);
      }
      wrap.append(head, panel); toolsBox.append(wrap);
    }
    decorate(toolsBox); markActive();
  };
  const showCat = name => {
    openCat = name;
    for (const h of toolsBox.querySelectorAll('[data-l7d-cat]')) h.setAttribute('aria-expanded', String(h.dataset.l7dCat === name));
    for (const p of toolsBox.querySelectorAll('[data-l7d-cat-panel]')) {
      p.hidden = p.dataset.l7dCatPanel !== name; p.style.top = '';
      if (!p.hidden) { const over = p.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom + 6; if (over > 0) p.style.top = -over + 'px'; }
    }
  };
  document.addEventListener('pointerdown', e => { if (openCat !== null && !e.target.closest?.('.l7-cat')) showCat(null); }, true);
  // right click anywhere else closes an open menu
  document.addEventListener('contextmenu', e => {
    if (openCat !== null && !e.target.closest?.('[data-l7d-cat]')) { e.preventDefault(); showCat(null); }
  }, true);
  // right click on a group icon opens its menu to choose another tool
  toolsBox.addEventListener('contextmenu', e => {
    const cat = e.target.closest('[data-l7d-cat]');
    if (!cat) return;
    e.preventDefault();
    showCat(cat.dataset.l7dCat === openCat ? null : cat.dataset.l7dCat);
  });
  // Closed outlines get the fabric/sky fill used by the host icons.
  const decorate = root => { for (const p of root.querySelectorAll('svg :is(path,rect,circle)')) { if (p.hasAttribute('stroke-dasharray')) continue; if (p.tagName === 'path' && !/[Zz]\s*$/.test(p.getAttribute('d') || '')) continue; if (p.classList.contains('ink')) p.classList.add('l7-fill-fabric'); else if (p.classList.contains('blue')) p.classList.add('l7-fill-sky'); } };
  const markActive = () => {
    for (const b of toolsBox.querySelectorAll('[data-l7d-tool]')) b.setAttribute('aria-pressed', String(b.dataset.l7dTool === active));
    const t = tools.find(x => x.key === active);
    for (const h of toolsBox.querySelectorAll('[data-l7d-cat]')) h.classList.toggle('l7-active', !!t && h.dataset.l7dCat === t.group);
    if (t && last[t.group] !== t.key) {
      last[t.group] = t.key; try { localStorage.setItem('level7.design.lastTools', JSON.stringify(last)); } catch {}
      const c = cats.find(x => x.name === t.group), h = c && toolsBox.querySelector(`[data-l7d-cat="${CSS.escape(c.name)}"]`);
      if (h) { h.innerHTML = stripIcon(c); decorate(h); }
    }
    guide.hidden = !t;
    if (t && guide.dataset.tool !== t.key) {
      guide.dataset.tool = t.key;
      guide.querySelector('.l7g-title').textContent = t.name;
      guide.querySelector('.l7g-pic').innerHTML = toolIcon(GLYPH[t.key] || 'point'); decorate(guide);
      guide.querySelector('.l7g-text').textContent = (HINT[t.key] || 'اتبع التعليمات أسفل اللوحة.') + ' كليك يمين أو Enter للاعتماد، Esc للإلغاء. دابل كليك على أي عنصر لتعديل قيمه.';
    } else if (!t) delete guide.dataset.tool;
  };
  // 0.9.139: the parts of the open MDL become parts of a new LEVEL7 design: their stored
  // geometry (base size) as fixed points, lines and curves. The MDL file is not changed.
  const convertMdl = () => {
    const b = window.l7MdlBridge;
    if (!b?.available()) { notice('افتح ملف MDL أولاً، ثم حوّل بارتاته إلى تصميم LEVEL7.'); return; }
    const parts = [];
    let skipped = 0, total = 0;
    for (const p of b.parts()) {
      const g = b.geometry(p.id);
      if (!g?.available || !g.objects.length) { skipped++; continue; }
      const steps = [], names = {};
      let id = 1, np = 0, nl = 0, nc = 0;
      const add = (kind, pts) => {
        if (!pts.length || pts.some(q => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) return;
        names[id] = kind === 'point' ? 'P' + ++np : pts.length > 2 ? 'C' + ++nc : 'L' + ++nl;
        steps.push({ op: 'fixed', id: id++, kind, pts: pts.map(q => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]) });
      };
      for (const o of g.objects) {
        if (o.kind === 'point') add('point', o.points);
        else if (o.kind === 'point-sequence') o.points.forEach(q => add('point', [q]));
        else if (o.kind === 'sample-path' && o.points.length >= 2) add('line', o.points);
        else if (o.kind === 'segment-pairs') for (let k = 0; k + 1 < o.points.length; k += 2) add('line', [o.points[k], o.points[k + 1]]);
      }
      if (!steps.length) { skipped++; continue; }
      total += steps.length;
      parts.push({ no: p.id, name: p.name, steps, names, nextId: id, pieces: [], amount: 1 });
    }
    if (!parts.length) { notice('لا توجد بارتات بهندسة محفوظة في هذا الملف.'); return; }
    parts.sort((x, y) => x.no - y.no);
    const first = parts[0];
    const model = { version: 1, name: (b.filename() || 'GRAFIS').replace(/\.mdl$/i, ''), measurements: [], variables: [], steps: first.steps, names: first.names, nextId: first.nextId, pieces: [], parts, activePart: 0 };
    open();
    send({ type: 'l7:open', text: JSON.stringify(model), name: model.name });
    status(`حُوّل ${parts.length} بارت (${total} عنصر)${skipped ? `، وتُرك ${skipped} بلا هندسة محفوظة` : ''}`);
  };
  const notice = text => { status(text); const n = document.querySelector('#native-notice'); if (n) { n.textContent = text; n.hidden = false; } };
  const openDesign = async () => {
    if (!desktop?.openFile) { status('فتح الملفات متاح في نسخة سطح المكتب فقط.'); return; }
    try {
      const file = await desktop.openFile({ design: true });
      if (!file) return;
      open(); send({ type: 'l7:open', text: file.text, name: file.name }); status('تم فتح ' + file.name);
    } catch (e) { status('تعذر فتح الملف: ' + e.message); }
  };
  const saveFromEngine = async ({ name, text }) => {
    const kind = KIND(String(name || ''));
    if (!kind || typeof text !== 'string') return;
    if (!desktop?.saveFile) { status('الحفظ متاح في نسخة سطح المكتب فقط.'); return; }
    try {
      const r = await desktop.saveFile({ text, filename: name, kind });
      if (r?.saved) { status('تم الحفظ: ' + r.name); if (kind === 'design') send({ type: 'l7:saved', name: r.name }); }
    } catch (e) { status('تعذر الحفظ: ' + e.message); }
  };

  window.addEventListener('message', e => {
    if (!frame || e.source !== frame.contentWindow || typeof e.data?.type !== 'string') return;
    const d = e.data;
    if (d.type === 'l7:ready') {
      ready = true; tools = Array.isArray(d.tools) ? d.tools.filter(t => typeof t?.key === 'string').map(t => ({ key: t.key, name: String(t.name), group: String(t.group) })) : [];
      renderTools(); send({ type: 'l7:theme', dark: dark() });
      for (const m of queue.splice(0)) frame.contentWindow.postMessage(m, '*');
    } else if (d.type === 'l7:tool-state') { active = typeof d.tool === 'string' ? d.tool : null; markActive(); }
    else if (d.type === 'l7:download') void saveFromEngine(d);
    else if (d.type === 'l7:context') showCat(null);
    else if (d.type === 'l7:open-json' && d.purpose === 'library') void (async () => {
      if (!desktop?.openFile) { status('فتح الملفات متاح في نسخة سطح المكتب فقط.'); return; }
      try { const file = await desktop.openFile({ design: true }); if (file) send({ type: 'l7:json', purpose: 'library', text: file.text, name: file.name }); }
      catch (e) { status('تعذر فتح الملف: ' + e.message); }
    })();
    else if (d.type === 'l7:print' && typeof d.html === 'string') void (async () => {
      if (!desktop?.printPdf) { status('الطباعة متاحة في نسخة سطح المكتب فقط.'); return; }
      try { const r = await desktop.printPdf({ html: d.html, filename: String(d.name || 'product.pdf') }); if (r) status('حُفظ PDF: ' + (r.name || '')); }
      catch (e) { status('تعذرت الطباعة: ' + e.message); }
    })();
    else if (d.type === 'l7:open-marker') void (async () => {
      if (!desktop?.openFile) { status('فتح الملفات متاح في نسخة سطح المكتب فقط.'); return; }
      try { const file = await desktop.openFile({ marker: true }); if (file) send({ type: 'l7:marker', name: file.name, text: file.text }); }
      catch (e) { status('تعذر فتح الملف: ' + e.message); }
    })();
    else if (d.type === 'l7:open-table') void (async () => {
      if (!desktop?.openFile) { status('فتح الملفات متاح في نسخة سطح المكتب فقط.'); return; }
      try {
        const file = await desktop.openFile({ table: true });
        if (file) send({ type: 'l7:table', name: file.name, text: file.text, base64: file.base64 });
      } catch (e) { status('تعذر فتح الملف: ' + e.message); }
    })();
    else if (d.type === 'l7:panel') markTab(Array.isArray(d.tabs) ? d.tabs.filter(t => typeof t === 'string').map(t => 'tab-' + t) : typeof d.tab === 'string' ? ['tab-' + d.tab] : []);
    else if (d.type === 'l7:shortcut' && typeof d.action === 'string' && (d.action === 'imgtoggle' || barBox.querySelector(`[data-l7d-command="${CSS.escape(d.action)}"]`))) run(d.action);
  });
  host.addEventListener('click', e => {
    const tool = e.target.closest('[data-l7d-tool]'), cmd = e.target.closest('[data-l7d-command]'), cat = e.target.closest('[data-l7d-cat]');
    const step = e.target.closest('[data-l7d-step]');
    if (step) { send({ type: 'l7:action', action: step.dataset.l7dStep }); frame?.focus(); }
    else if (e.target.closest('[data-l7d="close"]')) close();
    else if (cat) {
      // left click: the last tool used in this group (or its first one) starts at once;
      // the export group has no tool, so it opens its menu
      const c = cats.find(x => x.name === cat.dataset.l7dCat), it = c && (c.items.find(x => x.tool && x.tool === last[c.name]) || c.items.find(x => x.tool));
      if (it) { showCat(null); send(it.tool === active ? { type: 'l7:cancel' } : { type: 'l7:tool', key: it.tool }); frame?.focus(); }
      else showCat(cat.dataset.l7dCat === openCat ? null : cat.dataset.l7dCat);
    }
    else if (tool) { showCat(null); send(tool.dataset.l7dTool === active ? { type: 'l7:cancel' } : { type: 'l7:tool', key: tool.dataset.l7dTool }); frame?.focus(); }
    else if (cmd) { showCat(null); run(cmd.dataset.l7dCommand); }
  });
  const run = action => {
    if (action === 'open') void openDesign();
    else if (action === 'new') { send({ type: 'l7:new' }); status('تصميم جديد'); }
    else if (action === 'product') send({ type: 'l7:action', action: 'product' });
    else send({ type: 'l7:action', action });
  };
  const markTab = actions => { for (const b of barBox.querySelectorAll('[data-l7d-command^="tab-"]')) b.setAttribute('aria-pressed', String(actions.includes(b.dataset.l7dCommand))); };

  document.addEventListener('keydown', e => {
    if (host.hidden) return;
    if (e.key === 'Escape' && openCat !== null) { showCat(null); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Escape') { send({ type: 'l7:cancel' }); e.preventDefault(); e.stopImmediatePropagation(); return; }
    const action = shortcut(e, e.target.matches?.('input, select, textarea'));
    if (action) { run(action); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  new MutationObserver(() => send({ type: 'l7:theme', dark: dark() })).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // File menu: new / open LEVEL7 design, next to the MDL commands.
  const popup = fileMenu.querySelector('.menu-popup');
  const anchor = popup.querySelector('[data-action="open-any"]')?.nextElementSibling ?? null;
  const item = (id, text, run) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.addEventListener('click', () => { fileMenu.open = false; run(); }); popup.insertBefore(b, anchor); };
  item('menu-l7-design-new', 'تصميم LEVEL7 جديد · New LEVEL7 design', () => { open(); send({ type: 'l7:new' }); status('تصميم جديد'); });
  item('menu-l7-design-open', 'فتح تصميم LEVEL7… · Open LEVEL7 design', () => void openDesign());
  item('menu-l7-design-show', 'العودة إلى التصميم المفتوح · Show LEVEL7 design', () => open());
  item('menu-l7-design-from-mdl', 'تحويل بارتات MDL المفتوحة إلى تصميم LEVEL7 · Convert MDL parts', () => convertMdl());
  // Empty canvas: a direct entry next to Open MDL.
  const empty = document.querySelector('#canvas-empty .empty-actions');
  if (empty) { const b = document.createElement('button'); b.type = 'button'; b.id = 'empty-l7-design'; b.textContent = 'تصميم LEVEL7 جديد'; b.addEventListener('click', () => { open(); send({ type: 'l7:new' }); }); empty.append(b); }
}
