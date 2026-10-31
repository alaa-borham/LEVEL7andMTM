/** Movable tool palettes; positions survive reopen and remain recoverable on resize. */
export function bindDraggablePalettes(){
 const ids=['original-line10-editor','linked-point-position','original-point-editor','original-length-editor','curve-construction-palette','curve-reference-panel','curve-construction-values','original-insert-editor'];
 const installed=new WeakSet();
 function bind(panel){if(!panel||installed.has(panel))return;const header=panel.querySelector(':scope > header');if(!header)return;installed.add(panel);header.style.cursor='grab';header.style.touchAction='none';header.style.userSelect='none';let drag=null;const key='level7.palette-position.'+panel.id;
  const place=(x,y)=>{const r=panel.getBoundingClientRect();panel.style.position='fixed';panel.style.right='auto';panel.style.bottom='auto';panel.style.left=Math.max(0,Math.min(innerWidth-Math.min(r.width,innerWidth),x))+'px';panel.style.top=Math.max(0,Math.min(innerHeight-26,y))+'px';panel.style.maxHeight=Math.max(80,innerHeight-parseFloat(panel.style.top)-8)+'px';};
  const restore=()=>{try{const p=JSON.parse(localStorage.getItem(key));if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&!panel.hidden)place(p.x,p.y);}catch{}};
  header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,input,select,a'))return;const r=panel.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};header.setPointerCapture(e.pointerId);header.style.cursor='grabbing';e.preventDefault();e.stopPropagation();});
  header.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;place(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});
  const stop=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;header.style.cursor='grab';try{localStorage.setItem(key,JSON.stringify({x:parseFloat(panel.style.left),y:parseFloat(panel.style.top)}));}catch{}};for(const event of['pointerup','pointercancel','lostpointercapture'])header.addEventListener(event,stop);
  new MutationObserver(restore).observe(panel,{attributes:true,attributeFilter:['hidden']});window.addEventListener('resize',restore);restore();
 }
 const scan=()=>ids.forEach(id=>bind(document.getElementById(id)));scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
}
