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
  line: 'line', lineAngle: 'angle', parallel: 'parallel', setLength: 'lengthTo', trim: 'cutEnd',
  mirrorCopy: 'mirror', mirrorMove: 'linkedReflection', curve: 'curve10', piece: 'seam',
  notch: 'symbols', measureDist: 'distance', measureLength: 'length'
};
const HINT = {
  point: 'انقر على اللوحة لوضع نقطة، ثم عدّل س/ص في المربع.',
  pointOn: 'اختر خطاً قرب الطرف الذي تقاس منه المسافة.',
  intersect: 'اختر خطين أو منحنيين لإنشاء نقطة تقاطعهما.',
  pointMove: 'اختر نقطة ثم خطاً يحدد اتجاه النقل.',
  line: 'اختر نقطتين أو انقر موضعين على اللوحة.',
  lineAngle: 'اختر نقطة البداية ثم اكتب الزاوية والطول.',
  parallel: 'اختر الخط ثم الجهة؛ اكتب المسافة بالمليمتر.',
  setLength: 'اختر الخط قرب الطرف الذي يتغير.',
  trim: 'اختر الخط المراد قصه أو تمديده ثم الحد.',
  mirrorCopy: 'اختر العناصر ثم محور الانعكاس.',
  mirrorMove: 'اختر العناصر ثم محور الانعكاس.',
  curve: 'اختر نقاط المنحنى بالترتيب ثم Enter.',
  piece: 'اختر حدود القطعة بالترتيب ثم Enter.',
  notch: 'اختر نقطة على حد القطعة.',
  measureDist: 'اختر نقطتين لقياس المسافة بينهما.',
  measureLength: 'اختر خطاً أو منحنى لقياس طوله.'
};
const KIND = name => /\.level7\.json$|\.json$/i.test(name) ? 'design' : /\.plt$/i.test(name) ? 'hpgl' : /\.rul$/i.test(name) ? 'rul' : /\.dxf$/i.test(name) ? 'dxf' : null;
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
  host.innerHTML = '<div class="l7-design-stage"></div><aside class="l7-design-palette" aria-label="أدوات تصميم LEVEL7"><header><strong>تصميم LEVEL7</strong><button type="button" data-l7d="close" title="إغلاق التصميم والعودة لملفات MDL">×</button></header><div class="l7-design-tools" role="toolbar"></div><div class="l7-design-guide" aria-live="polite"><b>اختر أداة</b><span>الأيقونات هنا تشغّل محرك LEVEL7. يُحفظ التصميم بصيغة ‎.level7.json.</span></div><div class="l7-design-commands"></div><output class="l7-design-status" aria-live="polite"></output></aside>';
  workArea.append(host);
  const stage = host.querySelector('.l7-design-stage'), toolsBox = host.querySelector('.l7-design-tools');
  const guide = host.querySelector('.l7-design-guide'), statusOut = host.querySelector('.l7-design-status');
  status = text => { statusOut.textContent = text; };

  const commands = [
    ['save', 'حفظ التصميم', 'folder'], ['aama', 'تصدير AAMA', 'manufacturing'], ['dxf', 'تصدير DXF', 'line20'], ['plt', 'تصدير PLT', 'raster'],
    ['undo', 'تراجع', 'back'], ['redo', 'إعادة', 'back'], ['fit', 'ملء الشاشة', 'origin'], ['open', 'فتح تصميم', 'folder']
  ];
  const cmdBox = host.querySelector('.l7-design-commands');
  for (const [action, title, glyph] of commands) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'l7-design-cmd'; b.dataset.l7dCommand = action; b.title = title;
    b.innerHTML = toolIcon(glyph) + `<span>${title}</span>`; if (action === 'redo') b.classList.add('l7-flip');
    cmdBox.append(b);
  }

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
    ensureFrame(); host.hidden = false; document.body.classList.add('l7-design-on'); requestAnimationFrame(fit);
    for (const d of document.querySelectorAll('.menubar details.menu')) d.open = false;
  };
  const close = () => { send({ type: 'l7:cancel' }); host.hidden = true; document.body.classList.remove('l7-design-on'); };
  const renderTools = () => {
    toolsBox.replaceChildren();
    let group = '';
    for (const t of tools) {
      if (t.group !== group) { group = t.group; const h = document.createElement('h3'); h.textContent = group; toolsBox.append(h); }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'l7-design-tool'; b.dataset.l7dTool = t.key;
      b.title = t.name; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = (toolIcon(GLYPH[t.key] || 'point') || toolIcon('point')) + `<span>${t.name}</span>`;
      toolsBox.append(b);
    }
    decorate(toolsBox); decorate(cmdBox); markActive(); fit();
  };
  // Closed outlines get the fabric/sky fill used by the host icons.
  const decorate = root => { for (const p of root.querySelectorAll('svg :is(path,rect,circle)')) { if (p.tagName === 'path' && !/[Zz]\s*$/.test(p.getAttribute('d') || '')) continue; if (p.classList.contains('ink')) p.classList.add('l7-fill-fabric'); else if (p.classList.contains('blue')) p.classList.add('l7-fill-sky'); } };
  // Cards take the free height of the palette, never more: no scrollbar.
  const fit = () => {
    if (host.hidden || !toolsBox.clientHeight) return;
    const set = h => { host.classList.toggle('l7d-compact', h < 50); host.style.setProperty('--l7d-card', h + 'px'); host.style.setProperty('--l7d-icon', Math.round(h * 0.55) + 'px'); };
    const fits = () => toolsBox.scrollHeight <= toolsBox.clientHeight + 1;
    let lo = 32, hi = 92; set(hi); if (fits()) return;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; set(mid); if (fits()) lo = mid; else hi = mid; }
    set(lo);
  };
  window.addEventListener('resize', () => requestAnimationFrame(fit));
  const markActive = () => {
    for (const b of toolsBox.querySelectorAll('[data-l7d-tool]')) b.setAttribute('aria-pressed', String(b.dataset.l7dTool === active));
    const t = tools.find(x => x.key === active);
    guide.firstElementChild.textContent = t ? t.name : 'اختر أداة';
    guide.lastElementChild.textContent = t ? (HINT[t.key] || 'اتبع التعليمات أسفل اللوحة.') + ' Esc للإلغاء.' : 'الأيقونات هنا تشغّل محرك LEVEL7. يُحفظ التصميم بصيغة ‎.level7.json.';
  };
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
      if (r?.saved) status('تم الحفظ: ' + r.name);
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
  });
  host.addEventListener('click', e => {
    const tool = e.target.closest('[data-l7d-tool]'), cmd = e.target.closest('[data-l7d-command]');
    if (e.target.closest('[data-l7d="close"]')) close();
    else if (tool) { send(tool.dataset.l7dTool === active ? { type: 'l7:cancel' } : { type: 'l7:tool', key: tool.dataset.l7dTool }); frame?.focus(); }
    else if (cmd) { if (cmd.dataset.l7dCommand === 'open') void openDesign(); else send({ type: 'l7:action', action: cmd.dataset.l7dCommand }); }
  });
  document.addEventListener('keydown', e => {
    if (host.hidden) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { send({ type: 'l7:cancel' }); e.preventDefault(); e.stopImmediatePropagation(); }
    else if ((e.ctrlKey || e.metaKey) && ['z', 'y', 's'].includes(k)) { send({ type: 'l7:action', action: { z: 'undo', y: 'redo', s: 'save' }[k] }); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  new MutationObserver(() => send({ type: 'l7:theme', dark: dark() })).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // File menu: new / open LEVEL7 design, next to the MDL commands.
  const popup = fileMenu.querySelector('.menu-popup');
  const anchor = popup.querySelector('[data-action="open-any"]')?.nextElementSibling ?? null;
  const item = (id, text, run) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.addEventListener('click', () => { fileMenu.open = false; run(); }); popup.insertBefore(b, anchor); };
  item('menu-l7-design-new', 'تصميم LEVEL7 جديد · New LEVEL7 design', () => { open(); send({ type: 'l7:new' }); status('تصميم جديد'); });
  item('menu-l7-design-open', 'فتح تصميم LEVEL7… · Open LEVEL7 design', () => void openDesign());
  item('menu-l7-design-show', 'العودة إلى التصميم المفتوح · Show LEVEL7 design', () => open());
  // Empty canvas: a direct entry next to Open MDL.
  const empty = document.querySelector('#canvas-empty .empty-actions');
  if (empty) { const b = document.createElement('button'); b.type = 'button'; b.id = 'empty-l7-design'; b.textContent = 'تصميم LEVEL7 جديد'; b.addEventListener('click', () => { open(); send({ type: 'l7:new' }); }); empty.append(b); }
}
