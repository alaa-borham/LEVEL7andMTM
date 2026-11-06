// 0.9.135: parts of a LEVEL7 design (as GRAFIS part organisation) and inheritance of objects
// from an earlier part (linked). Usage: L7_SRC=<app dir> xvfb-run -a node test-0135-parts.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'pt-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.name='thobe';m.measurements.push({id:1,name:'length',value:300});m.steps.push({op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'X1',y:'0'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}});Object.assign(m.names,{1:'P1',2:'P2',3:'L1'});m.nextId=4;a.changed();});
 await page.locator('[data-l7d-command="tab-partlist"]').click();await fr.locator('.pgrid').waitFor();
 assert.equal(await fr.locator('.pgrid tbody tr').count(),1);assert.equal(await fr.locator('.pgrid tbody tr td.pn').first().textContent(),'3');pass('Parts window: part 001 with RS 3 and its preview');
 await fr.locator('.pgrid [data-pa="add"]').click();await f.waitForFunction(()=>window.level7.model.parts.length===2&&window.level7.model.activePart===1&&window.level7.model.steps.length===0);
 await fr.locator('.pgrid input[data-pname="1"]').fill('back');await fr.locator('.pgrid input[data-pname="1"]').press('Enter');
 pass('⊕ new part 002 becomes the active part (empty drawing)');
 await page.locator('[data-l7d-cat="الوراثة"]').click({button:'right'});await page.locator('[data-l7d-tool="inheritObjects"]').click();
 await fr.locator('.inherit-bar [data-ihb="list"]').click(); // 0.9.159: inherit picks by clicking; the list is one button away
 await fr.locator('.inherit-win').waitFor();await fr.locator('.inherit-win input[data-obj="3"]').check();await fr.locator('.inherit-win [data-ih="ok"]').click();
 await f.waitForFunction(()=>window.level7.model.steps.at(-1)?.op==='inherit');
 const inh=await f.evaluate(()=>{const a=window.level7,s=a.model.steps.at(-1);return{name:a.model.names[s.items[0].dst],pts:a.res.objects.get(s.items[0].dst).pts};});
 assert.equal(inh.name,'L1');assert.deepEqual(inh.pts,[[0,0],[300,0]]);pass('Inherit objects: L1 of part 001 copied into part 002 (same name)');
 await fr.locator('.pgrid tr[data-part="0"] td.pno').click();await f.waitForFunction(()=>window.level7.model.activePart===0&&window.level7.model.steps.length===3);
 await f.evaluate(()=>{const a=window.level7;a.model.steps[1].x='450';a.changed();});
 await fr.locator('.pgrid tr[data-part="1"] td.pno').click();await f.waitForFunction(()=>window.level7.model.activePart===1);
 const after=await f.evaluate(()=>{const a=window.level7,s=a.model.steps.at(-1);return a.res.objects.get(s.items[0].dst).pts[1];});
 assert.deepEqual(after,[450,0]);pass('linked: the source part changed (450) and the inherited line followed');
 // 0.9.159: parts are visible unless hidden (as GRAFIS): 👁 hides part 001, a second click shows it again
 await f.waitForFunction(()=>document.querySelectorAll('#canvas polyline.ghost').length>0);
 await fr.locator('.pgrid [data-peye="0"]').click();await f.waitForFunction(()=>document.querySelectorAll('#canvas polyline.ghost').length===0);
 await fr.locator('.pgrid [data-peye="0"]').click();await f.waitForFunction(()=>document.querySelectorAll('#canvas polyline.ghost').length>0);pass('part 001 shows behind part 002 by default; 👁 hides it and shows it again');
 await fr.locator('.pgrid input[name="pkind"][value="prod"]').check();await fr.locator('.pgrid [data-pp="amount"]').fill('2');await fr.locator('.pgrid [data-pp="amount"]').press('Enter');
 assert.deepEqual(await f.evaluate(()=>{const p=window.level7.model.parts[1];return[p.production,p.amount,p.name]}),[true,2,'back']);pass('properties: production part, amount 2, name «back»');
 await page.screenshot({path:'shot-0135-parts.png'});
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
