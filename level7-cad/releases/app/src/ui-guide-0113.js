/** 0.9.113 interface guidance. Purely presentational: adds a short Arabic caption
 * under icon-only tool buttons and a help card that explains the tool under the
 * pointer or keyboard focus. Commands, IDs, titles and capability guards are
 * untouched; a disabled tool is described as unavailable, never enabled. */
const arabic = /[؀-ۿ]/;
const pendingNote = 'غير متاح بعد';
function parts(title) {
  const pieces = String(title || '').split(/\s+[·/]\s+/).map(s => s.trim()).filter(Boolean);
  const ar = pieces.filter(p => arabic.test(p) && p !== pendingNote);
  const en = pieces.filter(p => !arabic.test(p));
  return { ar: ar.join(' · '), en: en.join(' · '), pending: pieces.includes(pendingNote) };
}
function caption(button) {
  const { ar, en } = parts(button.getAttribute('title') || button.getAttribute('aria-label'));
  const text = (ar || en).replace(/\s*\(.*?\)\s*/g, ' ').split(/[،؛:;—]/)[0].replace(/\s+[A-Za-z][\w+-]*$/,'').trim();
  return text.length > 34 ? text.slice(0, 33).trim() + '…' : text;
}
function iconOnly(button) { return [...button.children].every(c => c.tagName.toLowerCase() === 'svg' || c.classList.contains('grafis-sr-only')); }
function label(root = document) {
  for (const b of root.querySelectorAll('.grafis-icon-option')) {
    if (!iconOnly(b)) { delete b.dataset.caption; continue; }
    const c = caption(b); if (b.dataset.caption !== c) b.dataset.caption = c;
  }
}
function describe(button) {
  const { ar, en, pending } = parts(button.getAttribute('title') || button.getAttribute('aria-label') || button.textContent);
  const state = pending || button.dataset.toolPending !== undefined ? 'غير متاح بعد في هذا الإصدار'
    : button.disabled ? 'غير متاح الآن: افتح ملفاً أو اختر بارتاً أو عنصراً يدعم هذه الأداة'
    : button.getAttribute('aria-expanded') !== null ? 'اضغط لعرض أدوات هذه المجموعة'
    : 'اضغط لاستخدام الأداة';
  return { title: ar || en || 'أداة', sub: ar && en ? en : '', state, available: !button.disabled && !pending };
}
// 0.9.115: tool cards grow to use the free height of the right panel (never
// beyond it, so no scrollbar), and closed outline shapes get a fabric/sky fill
// with a soft shadow so pieces read as real pattern parts.
function decorate(root = document) {
  for (const p of root.querySelectorAll('.grafis-icon-option svg :is(path,rect,circle):not([data-l7-fill])')) {
    p.dataset.l7Fill = '';
    const closed = p.tagName !== 'path' || /[Zz]\s*$/.test(p.getAttribute('d') || '');
    if (!closed) continue;
    if (p.classList.contains('ink')) p.classList.add('l7-fill-fabric');
    else if (p.classList.contains('blue')) p.classList.add('l7-fill-sky');
  }
}
function installDefs() {
  if (document.querySelector('#l7-icon-defs')) return;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.id = 'l7-icon-defs'; svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = '<defs><linearGradient id="l7-fabric" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ead7a8"/></linearGradient><linearGradient id="l7-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef8ff"/><stop offset="1" stop-color="#b8def5"/></linearGradient></defs>';
  document.body.prepend(svg);
}
function fitPanel() {
  const panel = document.querySelector('aside.command-panel');
  if (!panel || !panel.clientHeight) return;
  const root = document.documentElement.style, set = h => { document.body.classList.toggle('l7-big-cards', h >= 70); root.setProperty('--l7-card-h', h + 'px'); root.setProperty('--l7-icon', Math.round(h * 0.56) + 'px'); root.setProperty('--l7-cap', Math.max(9, Math.min(12, h * 0.17)).toFixed(1) + 'px'); };
  const fits = () => panel.scrollHeight <= panel.clientHeight + 1;
  let lo = 40, hi = 104; set(hi); if (fits()) return;
  while (hi - lo > 2) { const mid = Math.floor((lo + hi) / 2); set(mid); if (fits()) lo = mid; else hi = mid; }
  set(lo);
}
let fitQueued = false;
const queueFit = () => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitPanel(); }); };
export function installInterfaceGuide() {
  const panel = document.querySelector('.command-panel');
  if (!panel || document.querySelector('#tool-guide')) return;
  const card = document.createElement('aside');
  card.id = 'tool-guide'; card.className = 'tool-guide'; card.dir = 'rtl'; card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<strong class="tool-guide-title">مرّر المؤشر على أي أداة</strong><span class="tool-guide-sub"></span><span class="tool-guide-state">يظهر هنا اسمها وطريقة استخدامها.</span>';
  const anchor = panel.querySelector('.selection-panel');
  panel.insertBefore(card, anchor || null);
  const [t, s, st] = card.children;
  const show = target => {
    const b = target?.closest?.('.grafis-icon-option, .construction-tool, #cad-toolbox button, .command-footer button');
    if (!b) return;
    const d = describe(b); t.textContent = d.title; s.textContent = d.sub; st.textContent = d.state; card.dataset.available = String(d.available);
  };
  document.addEventListener('pointerover', e => show(e.target), { passive: true });
  document.addEventListener('focusin', e => show(e.target));
  installDefs(); label(); decorate();
  new MutationObserver(records => { if (records.some(r => r.type === 'childList' || r.attributeName === 'title')) { label(); decorate(); } })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  // Refit only when the tool panel itself changes shape: a group opens or closes,
  // or tools are added. The help card and status texts never trigger a refit, so
  // a card never moves under the pointer.
  let lastShape = '';
  const shape = () => [...panel.querySelectorAll('.grafis-icon-option, .grafis-points-menu-value, .tool-section')].filter(e => e.offsetParent).length + ':' + panel.clientHeight;
  new MutationObserver(records => {
    if (records.every(r => card.contains(r.target))) return;
    const now = shape(); if (now !== lastShape) { lastShape = now; queueFit(); }
  }).observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', queueFit);
  document.body.classList.add('ui-0113', 'l7-fit');
  queueFit();
}
