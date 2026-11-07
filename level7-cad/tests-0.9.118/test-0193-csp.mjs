// 0.9.193: the main window's security policy (style-src 'self') blocked styles written into the HTML of
// the MTM screens (Link, Insert, Parts dialog, tool menus): they are in the stylesheet now. No CSP message,
// and each of those elements still gets its style.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0193-csp.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'cp-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 const csp=[];page.on('console',m=>{if(/Content Security Policy/.test(m.text())){const l=m.location();csp.push(l.url.split('/').pop()+':'+(l.lineNumber+1));}});
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');await page.waitForTimeout(1500);
 assert.deepEqual(csp,[]);pass('no Content Security Policy message while the program starts');
 const st=await page.evaluate(()=>{const cs=(sel,props)=>{const e=document.querySelector(sel);if(!e)return null;e.closest('[hidden]')?.removeAttribute('hidden');const c=getComputedStyle(e);return props.map(p=>c[p]);};
  return{joinLabel:cs('#original-join-settings label.oj-check',['display','columnGap']),joinBox:cs('#original-join-reverse-first',['width','height']),
   insert:cs('#original-insert-settings [data-insert-objects]',['maxHeight','overflowY']),name:cs('#part-operation-name',['marginTop']),
   up:cs('.points-menu-number .gtp-up',['color']),dot:cs('svg .blue.gtp-dot',['fill'])};});
 assert.deepEqual(st.joinLabel,['flex','6px'],JSON.stringify(st));assert.deepEqual(st.joinBox,['15px','15px'],JSON.stringify(st));
 assert.deepEqual(st.insert,['180px','auto'],JSON.stringify(st));assert.deepEqual(st.name,['8px'],JSON.stringify(st));
 if(st.up)assert.equal(st.up[0],'rgb(23, 164, 223)');if(st.dot)assert.equal(st.dot[0],'rgb(41, 164, 220)');
 pass(`the styles are applied from the stylesheet: Link checkboxes 15 px in a row, Insert list ≤ 180 px scrolling, part name field${st.up?', dart arrow colour':''}${st.dot?', link icon dot':''}`);
 assert.deepEqual(csp,[]);pass('still no CSP message');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
