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
 await page.screenshot({path:'shot-0126-digits.png'});
 console.log('PASS every field is English-digit (lang=en) with an Arabic system language; typed ١٢٣ becomes 123');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
