// 0.9.129: Z values with the formula first; Enter saves; a formula typed in the text field
// is moved to the formula; Z value assistant (IF / THEN / ELSE as CMDIF, X/Z lists, operators).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0129-z.mjs  (writes shot-0129-z.png)
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'z-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 // «new design» reaches the drawing by a message: wait until the new (empty) model is there before filling
 // it, or a late «new» wipes the test data
 await f.evaluate(()=>{const a=window.level7;a.__newDone=false;const o=a.newDesign.bind(a);a.newDesign=()=>{try{o();}finally{a.__newDone=true;}};});
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();
 await f.waitForFunction(()=>window.level7.__newDone);
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements.push({id:1,name:'front length',value:1500},{id:2,name:'',value:480});m.variables.push({id:1,name:'X2/2',expr:'0'});a.changed();});
 await page.locator('[data-l7d-command="tab-z"]').click();await fr.locator('.ztable').waitFor();
 await f.waitForFunction(()=>window.level7.res.z.get(1)===240);assert.equal(await f.evaluate(()=>window.level7.model.variables[0].expr),'X2/2');
 pass('Z1: "X2/2" typed in the text field is moved to the formula, Z1 = 240');
 await fr.locator('.ztable').locator('xpath=..').locator('[data-add]').click();await page.keyboard.type('X1-Z1');await page.keyboard.press('Enter');
 await f.waitForFunction(()=>window.level7.res.z.get(2)===1260);pass('new Z: the cursor is in the formula; "X1-Z1" + Enter = 1260');
 await fr.locator('.ztable').locator('xpath=..').locator('[data-add]').click();await fr.locator('[data-zas="2"]').click();await fr.locator('.z-assistant').waitFor();
 await fr.locator('.z-assistant input[value="c"]').check();await fr.locator('.z-assistant [data-zc="if"]').first().click();
 await fr.locator('.z-assistant [data-ins="X1"]').click();await fr.locator('.z-assistant [data-op=">"]').click();await page.keyboard.type('1000');
 await fr.locator('.z-assistant [data-zc="then"]').first().fill('Z1+10');
 // unlimited conditions: add a second one
 await fr.locator('.z-assistant [data-za="add"]').click();await fr.locator('.z-assistant [data-zc="if"]').nth(1).fill('X1>500');await fr.locator('.z-assistant [data-zc="then"]').nth(1).fill('5');
 await fr.locator('.z-assistant [data-zf="else"]').fill('0');
 await page.screenshot({path:'shot-0129-z.png'});
 await fr.locator('.z-assistant [data-za="ok"]').click();await f.waitForFunction(()=>window.level7.res.z.get(3)===250);
 assert.equal(await f.evaluate(()=>window.level7.model.variables[2].expr),'CMDIF[X1>1000]{Z1+10}[X1>500]{5}{0}');
 pass('assistant: IF X1>1000 THEN Z1+10, ELSE IF X1>500 THEN 5 (added row), ELSE 0 = 250');
 await fr.locator('.ztable input[data-f="expr"][data-i="1"]').click();await fr.locator('[data-zas-bar]').click();
 await fr.locator('.z-assistant').waitFor();assert.equal(await fr.locator('.z-assistant [data-zf="formula"]').inputValue(),'X1-Z1');
 pass('Z window: one «ƒx» button opens the assistant for the current row (Z2) only when pressed');
 // Excel formula with nested IF and functions; a later Z is refused
 await fr.locator('.z-assistant [data-za="close"]').first().click();await fr.locator('[data-zas="0"]').click();await fr.locator('.z-assistant').waitFor();
 const zl=await fr.locator('.z-assistant [data-zf="cat"]');await zl.selectOption('Z');assert.equal(await fr.locator('.z-assistant li.none').count(),1);
 await fr.locator('.z-assistant input[value="e"]').check();await fr.locator('.z-assistant [data-zf="excel"]').fill('IF(AND(X1>1000; X2<500); ROUND(X2/7; 1); IF(X1>500; MAX(X2; 100); 0))');
 await fr.locator('.z-assistant [data-za="ok"]').click();await f.waitForFunction(()=>window.level7.res.z.get(1)===68.6);
 await fr.locator('[data-zas="0"]').click();await fr.locator('.z-assistant [data-zf="excel"]').fill('Z2+1');await fr.locator('.z-assistant [data-za="ok"]').click();
 assert.match(await fr.locator('.z-assistant .za-msg').textContent(),/Z2 ليست قبل Z1/);await fr.locator('.z-assistant [data-za="close"]').first().click();
 pass('Excel formula: IF(AND(..); ROUND(X2/7;1); IF(..; MAX(..); 0)) = 68.6; a Z after the row is refused');
 // 0.9.131: X and Z windows open together; both buttons lit; each closes on its own
 await page.locator('[data-l7d-command="tab-x"]').click();await f.waitForFunction(()=>document.querySelector('.panel:not(.zwin):not(.pwin)').classList.contains('open')&&document.querySelector('.zwin').classList.contains('open'));
 await page.waitForFunction(()=>['tab-x','tab-z'].every(k=>document.querySelector(`[data-l7d-command="${k}"]`).getAttribute('aria-pressed')==='true'));
 const rx=await fr.locator('.panel:not(.zwin):not(.pwin)').boundingBox(),rz=await fr.locator('.zwin').boundingBox();assert(rx.width>100&&rz.width>100);
 await fr.locator('#tab-x input[data-f="value"]').first().waitFor();await fr.locator('.ztable').waitFor();
 await page.screenshot({path:'shot-0131-xz.png'});
 await page.locator('[data-l7d-command="tab-z"]').click();await f.waitForFunction(()=>!document.querySelector('.zwin').classList.contains('open')&&document.querySelector('.panel:not(.zwin):not(.pwin)').classList.contains('open'));
 pass('X and Z windows are open at the same time (both buttons lit); Z closes on its own');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
