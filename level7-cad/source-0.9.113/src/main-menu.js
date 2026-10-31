/** Exclusive desktop menu behavior, including keyboard and pointer transitions. */
export function bindMainMenu(bar){
 const menus=[...bar.querySelectorAll('details.menu')],summary=m=>m.querySelector('summary'),close=except=>menus.forEach(m=>{if(m!==except)m.open=false;});
 bar.addEventListener('pointerdown',e=>{const h=e.target.closest('summary'),m=h?.parentElement;if(menus.includes(m))close(m);},true);
 for(const m of menus){m.addEventListener('toggle',()=>{if(m.open)close(m);});summary(m).addEventListener('pointerenter',()=>{if(menus.some(n=>n.open)&&!m.open){close(m);m.open=true;}});}
 document.addEventListener('pointerdown',e=>{if(!bar.contains(e.target))close();},true);
 bar.addEventListener('keydown',e=>{const m=e.target.closest('details.menu');if(!m||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();const next=menus[(menus.indexOf(m)+(e.key==='ArrowRight'?1:menus.length-1))%menus.length];close(next);next.open=true;summary(next).focus();});
 document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const active=menus.find(m=>m.open);if(active){e.preventDefault();e.stopImmediatePropagation();close();summary(active).focus();}},true);
}
