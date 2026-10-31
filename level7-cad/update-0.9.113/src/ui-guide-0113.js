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
  label();
  new MutationObserver(records => { if (records.some(r => r.type === 'childList' || r.attributeName === 'title')) label(); })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  document.body.classList.add('ui-0113');
}
