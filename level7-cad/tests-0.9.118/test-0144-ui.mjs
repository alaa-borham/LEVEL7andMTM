// 0.9.144: no row over the drawing (size / unit in one command-bar button), no status line under
// it (the step shows in the tool card), menus close on a click anywhere (also on the drawing),
// floating windows resize from their edges and fill the screen, Z buttons at the top.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0144-ui.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ui-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 assert(await f.evaluate(()=>getComputedStyle(document.querySelector('.topbar')).display==='none'&&getComputedStyle(document.querySelector('footer.status')).display==='none'&&!document.querySelector('#coords').offsetParent));
 await f.evaluate(()=>{const a=window.level7;a.model.sizes=[{name:'L',step:1,values:{}}];a.changed();});
 await page.locator('[data-l7d-sizebtn]').click();await page.locator('.l7-size-menu [data-size="0"]').click();
 await f.waitForFunction(()=>window.level7.model.activeSize===0);await page.waitForFunction(()=>document.querySelector('.l7-size-name').textContent==='L');
 await page.locator('[data-l7d-sizebtn]').click();await page.locator('.l7-size-menu [data-unit="in"]').click();await f.waitForFunction(()=>window.level7.model.unit==='in');
 assert.equal(await page.locator('.l7-size-unit').textContent(),'inch');
 pass('no row over the drawing, no line or coordinates under it; the command-bar button shows size L / inch and changes them');
 await page.locator('.menubar summary',{hasText:'Extras'}).click();assert.equal(await page.locator('details.menu[open]').count(),1);
 const cb=await page.locator('#l7-design-frame').boundingBox();await page.mouse.click(cb.x+cb.width*0.5,cb.y+cb.height*0.5);
 await page.waitForFunction(()=>!document.querySelector('details.menu[open]'));pass('an open menu closes on a click on the drawing');
 await f.evaluate(()=>{const a=window.level7;a.model.steps=[{op:'point',id:1,x:'0',y:'0'}];a.model.nextId=2;a.changed();});
 await page.locator('.l7-design-cat').nth(1).click();await page.waitForFunction(()=>!document.querySelector('.l7-design-guide').hidden);
 await page.waitForFunction(()=>{const n=document.querySelector('.l7g-now');return n&&!n.hidden&&n.textContent.length>3;});
 pass('the current step shows in the tool card: «'+await page.locator('.l7g-now').textContent()+'»');
 await page.keyboard.press('Escape');
 await page.locator('[data-l7d-command="tab-x"]').click();const win=fr.locator('.panel.open').first();await win.waitFor();
 const b0=await win.boundingBox();const g=await fr.locator('.panel.open .float-grip.g-e').first().boundingBox();
 const d=b0.width<600?150:-150; // grow a narrow window, shrink a wide one
 await page.mouse.move(g.x+g.width/2,g.y+g.height/2);await page.mouse.down();await page.mouse.move(g.x+g.width/2+d,g.y+g.height/2,{steps:5});await page.mouse.up();
 const b1=await win.boundingBox();assert(Math.abs(b1.width-b0.width-d)<4,JSON.stringify([b0,b1]));
 await fr.locator('.panel.open .float-max').first().click();const b2=await win.boundingBox();assert(b2.width>cb.width-30&&b2.height>cb.height-30,JSON.stringify([b2,cb]));
 await fr.locator('.panel.open .float-max').first().click();const b3=await win.boundingBox();assert(Math.abs(b3.width-b1.width)<2,JSON.stringify([b1,b3]));
 pass(`the X window resizes from its edge (150 px) and ▢ fills the screen and restores`);
 await page.locator('[data-l7d-command="tab-z"]').click();const zt=await fr.locator('.zwin .z-actions').boundingBox(),tt=await fr.locator('.zwin .ztable').boundingBox();
 assert(zt.y<tt.y,JSON.stringify([zt,tt]));pass('«إضافة معادلة» and «مساعد المعادلات» are above the Z table');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
