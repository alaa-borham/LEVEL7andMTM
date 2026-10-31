// 0.9.132: X values as GRAFIS: dense table X | Name | MTM | Standard | sizes, tool bar
// (add, delete selected), search, copy. Usage: L7_SRC=<app dir> xvfb-run -a node test-0132-xgrid.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'xg-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements.push({id:1,name:'front length',value:1500,code:'FL'},{id:2,name:'bottom girth',value:1450},{id:3,name:'hip',value:1140});m.sizes=[{name:'_KO176',step:1,values:{}}];a.changed();});
 await page.locator('[data-l7d-command="tab-x"]').click();await fr.locator('.xgrid').waitFor();
 const heads=await fr.locator('.xg-table th').allTextContents();assert.deepEqual(heads.map(h=>h.trim()).slice(3),['الأساسي','_KO176'],heads.join('|'));
 assert.equal(await fr.locator('.xg-table td.xc input').first().inputValue(),'FL');pass('table: X | Name | MTM | Standard | size column');
 const cell=fr.locator('input[data-sz="0"][data-xid="1"]');await cell.click();await page.keyboard.type('1600');await page.keyboard.press('Enter');
 assert.equal(await f.evaluate(()=>window.level7.model.sizes[0].values[1]),1600);pass('size column: 1600 for _KO176 saved; empty = base value');
 await fr.locator('[data-xa="search"]').fill('hip');assert.equal(await fr.locator('.xg-table tbody tr').count(),1);await fr.locator('[data-xa="clear"]').click();assert.equal(await fr.locator('.xg-table tbody tr').count(),3);pass('search filters the rows (hip)');
 await fr.locator('.xg-table input[data-f="name"][data-i="1"]').click();await fr.locator('[data-xa="del"]').click();
 assert.deepEqual(await f.evaluate(()=>window.level7.model.measurements.map(m=>m.id)),[1,3]);pass('✕ deletes the selected row (X2)');
 await fr.locator('.xg-add').click();await page.keyboard.type('700');await page.keyboard.press('Enter');assert.equal(await f.evaluate(()=>window.level7.model.measurements.at(-1).value),700);pass('⊕ adds a row and its value is typed at once (700)');
 await page.screenshot({path:'shot-0132-x.png'});
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
