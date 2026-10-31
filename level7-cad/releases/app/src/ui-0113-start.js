import {installInterfaceGuide} from './ui-guide-0113.js';
import {installDesignMode} from './l7-design-mode.js';
installInterfaceGuide();
installDesignMode();
// 0.9.126: numbers always in English digits (fields marked English; Arabic-Indic digits typed become 0-9).
{
  const mark = root => root.querySelectorAll?.('input, select, textarea').forEach(el => el.setAttribute('lang', 'en'));
  mark(document);
  new MutationObserver(recs => recs.forEach(r => r.addedNodes.forEach(n => n instanceof Element && (n.matches('input, select, textarea') ? n.setAttribute('lang', 'en') : mark(n))))).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('input', e => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.type === 'number' || !/[٠-٩۰-۹]/.test(el.value)) return;
    const at = el.selectionStart;
    el.value = el.value.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
    if (at !== null) el.setSelectionRange(at, at);
  }, true);
}
