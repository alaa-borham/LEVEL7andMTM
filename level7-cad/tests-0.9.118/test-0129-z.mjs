// 0.9.129: Z values with the formula first; Enter saves; a formula typed in the text field
// is moved to the formula; Z value assistant (IF / THEN / ELSE as CMDIF, X/Z lists, operators).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0129-z.mjs  (writes shot-0129-z.png)
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'z-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements.push({id:1,name:'front length',value:1500},{id:2,name:'',value:480});m.variables.push({id:1,name:'X2/2',expr:'0'});a.changed();});
 await page.locator('[data-l7d-command="tab-z"]').click();await fr.locator('.ztable').waitFor();
 await f.waitForFunction(()=>window.level7.res.z.get(1)===240);assert.equal(await f.evaluate(()=>window.level7.model.variables[0].expr),'X2/2');
 pass('Z1: "X2/2" typed in the text field is moved to the formula, Z1 = 240');
 await fr.locator('.ztable').locator('xpath=..').locator('[data-add]').click();await page.keyboard.type('X1-Z1');await page.keyboard.press('Enter');
 await f.waitForFunction(()=>window.level7.res.z.get(2)===1260);pass('new Z: the cursor is in the formula; "X1-Z1" + Enter = 1260');
 await fr.locator('.ztable').locator('xpath=..').locator('[data-add]').click();await fr.locator('[data-zas="2"]').click();await fr.locator('.z-assistant').waitFor();
 await fr.locator('.z-assistant input[value="c"]').check();await fr.locator('.z-assistant [data-zf="if1"]').click();
 await fr.locator('.z-assistant [data-ins="X1"]').click();await fr.locator('.z-assistant [data-op=">"]').click();await page.keyboard.type('1000');
 await fr.locator('.z-assistant [data-zf="then1"]').fill('Z1+10');await fr.locator('.z-assistant [data-zf="else"]').fill('0');
 await page.screenshot({path:'shot-0129-z.png'});
 await fr.locator('.z-assistant [data-za="ok"]').click();await f.waitForFunction(()=>window.level7.res.z.get(3)===250);
 assert.equal(await f.evaluate(()=>window.level7.model.variables[2].expr),'CMDIF[X1>1000]{Z1+10}{0}');
 pass('assistant: IF X1>1000 THEN Z1+10 ELSE 0 (built from the X list and the > operator) = 250');
 await fr.locator('.ztable input[data-f="expr"][data-i="1"]').click();await fr.locator('[data-zas-bar]').click();
 await fr.locator('.z-assistant').waitFor();assert.equal(await fr.locator('.z-assistant [data-zf="formula"]').inputValue(),'X1-Z1');
 pass('Z window: one «ƒx» button opens the assistant for the current row (Z2) only when pressed');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
