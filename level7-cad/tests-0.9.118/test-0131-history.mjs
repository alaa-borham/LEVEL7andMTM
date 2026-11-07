// 0.9.131: back arrow on the drawing with a list to go back several steps; the forward
// arrow appears after going back (as Excel). Usage: L7_SRC=<app dir> xvfb-run -a node test-0131-history.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'h-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{const a=window.level7;a.__newDone=false;if(!a.__newWrapped){const o=a.newDesign.bind(a);a.newDesign=()=>{try{o();}finally{a.__newDone=true;}};a.__newWrapped=true;}});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>window.level7.__newDone);} /* «new design» reaches the drawing by a message: wait for it before filling the model */await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 const n=()=>f.evaluate(()=>window.level7.model.steps.length);
 assert(await fr.locator('.hist-bar [data-h="redo"]').isHidden());
 // five steps, each its own undo entry
 await page.locator('[data-l7d-cat="النقاط"]').click();const box=await fr.locator('#canvas').boundingBox();
 for(let k=0;k<5;k++){await page.mouse.click(box.x+200+k*60,box.y+200);await fr.locator('#tool-box [data-ok]').click();}
 assert.equal(await n(),5);await page.keyboard.press('Escape');
 assert.equal(await fr.locator('.hist-bar [data-h="undo"] b').textContent(),'6');assert(await fr.locator('.hist-bar [data-h="redo"]').isHidden());
 await fr.locator('.hist-bar [data-h="undo"]').click();assert.equal(await n(),4);
 assert(await fr.locator('.hist-bar [data-h="redo"]').isVisible());pass('↶ goes back one step; ↷ appears only after going back');
 await fr.locator('.hist-bar [data-h="undo-list"]').click();await fr.locator('.hist-menu [data-hk="3"]').click();assert.equal(await n(),1);
 assert.equal(await fr.locator('.hist-bar [data-h="redo"] b').textContent(),'4');pass('▾ list: back 3 steps at once (5 → 1)');
 await fr.locator('.hist-bar [data-h="redo-list"]').click();await fr.locator('.hist-menu [data-hk="2"]').click();assert.equal(await n(),3);
 await fr.locator('.hist-bar [data-h="redo"]').click();await fr.locator('.hist-bar [data-h="redo"]').click();assert.equal(await n(),5);
 assert(await fr.locator('.hist-bar [data-h="redo"]').isHidden());pass('↷ forward several steps; it disappears when nothing is left to redo');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
