// 0.9.190: Ctrl+S writes the design back to its own file without asking; «حفظ باسم» (Ctrl+Shift+S) asks
// where and remembers the new place; a new design asks on its first save.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0190-save.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sv-'));const a=path.join(dir,'a.level7'),b=path.join(dir,'b.level7'),c=path.join(dir,'c.level7');
 await fs.writeFile(a,JSON.stringify({version:1,name:'a',measurements:[],variables:[],steps:[{op:'point',id:1,x:'0',y:'0'}],names:{1:'P1'},nextId:2}));
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 // the save dialog is counted; it answers with whatever path the test sets
 await app.evaluate(({dialog},[a])=>{globalThis.__saves=0;globalThis.__next=null;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[a]});dialog.showSaveDialog=async()=>{globalThis.__saves++;return{canceled:false,filePath:globalThis.__next};};},[a]);
 const saves=()=>app.evaluate(()=>globalThis.__saves);
 await page.locator('[data-l7d-command="open"]').click();await f.waitForFunction(()=>window.level7.model.steps.length===1);
 // change and Ctrl+S: written to a.level7, no dialog
 await f.evaluate(()=>{const m=window.level7.model;window.level7.snapshot();m.steps.push({op:'point',id:2,x:'50',y:'0'});m.nextId=3;window.level7.changed();});
 await f.evaluate(()=>document.querySelector('#canvas').focus());await page.keyboard.press('Control+s');
 for(let k=0;k<50&&JSON.parse(await fs.readFile(a,'utf8')).steps.length!==2;k++)await page.waitForTimeout(100);
 assert.equal(JSON.parse(await fs.readFile(a,'utf8')).steps.length,2);assert.equal(await saves(),0);
 await page.waitForFunction(()=>/تم الحفظ: a\.level7/.test(document.querySelector('.l7-design-status')?.textContent||''));
 pass('Ctrl+S on an opened design writes it back to a.level7, no save window');
 // Ctrl+Shift+S: asks (→ b.level7); then Ctrl+S writes b.level7 without asking
 await app.evaluate(({},[b])=>{globalThis.__next=b;},[b]);
 await page.keyboard.press('Control+Shift+s');for(let k=0;k<50&&!(await fs.stat(b).catch(()=>null));k++)await page.waitForTimeout(100);
 assert.equal(await saves(),1);
 await f.evaluate(()=>{const m=window.level7.model;window.level7.snapshot();m.steps.push({op:'point',id:3,x:'90',y:'0'});m.nextId=4;window.level7.changed();});
 await page.keyboard.press('Control+s');for(let k=0;k<50&&JSON.parse(await fs.readFile(b,'utf8')).steps.length!==3;k++)await page.waitForTimeout(100);
 assert.equal(JSON.parse(await fs.readFile(b,'utf8')).steps.length,3);assert.equal(await saves(),1);assert.equal(JSON.parse(await fs.readFile(a,'utf8')).steps.length,2);
 pass('«حفظ باسم» (Ctrl+Shift+S) asks once (b.level7); the next Ctrl+S writes b.level7 without asking, a.level7 untouched');
 // a new design: its first Ctrl+S asks
 await app.evaluate(({},[c])=>{globalThis.__next=c;},[c]);
 await page.locator('[data-l7d-command="new"]').click();await f.waitForFunction(()=>window.level7.model.steps.length===0);
 await f.evaluate(()=>{const m=window.level7.model;window.level7.snapshot();m.steps.push({op:'point',id:1,x:'1',y:'1'});m.nextId=2;window.level7.changed();});
 await page.keyboard.press('Control+s');for(let k=0;k<50&&!(await fs.stat(c).catch(()=>null));k++)await page.waitForTimeout(100);
 assert.equal(await saves(),2);assert.equal(JSON.parse(await fs.readFile(b,'utf8')).steps.length,3);
 pass('a new design asks where on its first Ctrl+S (c.level7), b.level7 untouched');
 // the File menu has «حفظ التصميم باسم…»
 assert(await page.locator('#menu-l7-design-save-as').count()===1);pass('File menu: «حفظ التصميم باسم…»');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
