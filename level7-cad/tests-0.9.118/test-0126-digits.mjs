// 0.9.126: numbers always in English digits, also with an Arabic system language.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0126-digits.mjs  (writes shot-0126-digits.png)
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'dg-')),LANG:'ar_EG.UTF-8'};delete env.ELECTRON_RUN_AS_NODE;
let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox','--lang=ar',src],env});const page=await app.firstWindow();await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));
 await f.evaluate(()=>{const a=window.level7;a.model.measurements.push({id:1,name:'',value:480},{id:2,name:'',value:50});a.changed();});
 await page.locator('[data-l7d-command="tab-x"]').click();await f.waitForFunction(()=>document.querySelector('.panel.open'));
 const langs=await f.evaluate(()=>[...document.querySelectorAll('#tab-x input')].map(i=>i.lang));assert(langs.length&&langs.every(l=>l==='en'),langs.join());
 const inp=page.frameLocator('#l7-design-frame').locator('#tab-x input[data-f="name"]').first();await inp.fill('');await inp.type('X ١٢٣');
 assert.equal(await inp.inputValue(),'X 123');
 const host=await page.evaluate(()=>[...document.querySelectorAll('input')].every(i=>i.lang==='en'));assert(host);
 // 0.9.128: a new X row: its value field gets the focus with 0 selected, typing replaces it, Enter saves and moves on
 const fr=page.frameLocator('#l7-design-frame');await fr.locator('#tab-x [data-add]').click();
 await page.keyboard.type('1500');await page.keyboard.press('Enter');
 const v=await f.evaluate(()=>{const m=window.level7.model.measurements;return{last:m.at(-1).value,shown:document.querySelector(`#tab-x input[data-f="value"][data-i="${m.length-1}"]`).value};});
 assert.equal(v.last,1500);assert.equal(v.shown,'1500');
 await fr.locator('#tab-x input[data-f="value"][data-i="0"]').click();await page.keyboard.type('480');await page.keyboard.press('Enter');
 assert.equal(await f.evaluate(()=>window.level7.model.measurements[0].value),480);
 assert.equal(await f.evaluate(()=>document.activeElement?.dataset.i),'1');
 console.log('PASS X table: new value replaces the 0 (1500, not 01500); Enter saves and moves to the next row');
 await page.screenshot({path:'shot-0126-digits.png'});
 console.log('PASS every field is English-digit (lang=en) with an Arabic system language; typed ١٢٣ becomes 123');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
