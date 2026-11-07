// 0.9.138: pictures to trace (add, calibrate with two points, F9), lengths on lines (F8),
// arrange parts, library export / import. Usage: L7_SRC=<app dir> xvfb-run -a node test-0138-view-images.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'vi-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{window.level7.model.__old=1;});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>!window.level7.model.__old);} // «new design» reaches the drawing by a message: wait for it before filling the modelawait page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{window.confirm=()=>true;const a=window.level7,m=a.model;m.steps.push({op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'250',y:'0'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}});Object.assign(m.names,{1:'P1',2:'P2',3:'L1'});m.nextId=4;a.changed();a.fit();});
 await f.evaluate(()=>{window.level7.setVis('lengths',false);window.level7.setVis('images',true);});
 // F8 lengths
 await page.locator('[data-l7d-command="lengths"]').click();await f.waitForFunction(()=>[...document.querySelectorAll('#canvas text.len-label')].some(t=>t.textContent.includes('250')));pass('F8: lengths written on the lines (250)');
 // pictures
 await page.locator('[data-l7d-command="images"]').click();await fr.locator('.img-win').waitFor();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),fr.locator('.img-win [data-ia="add"]').click()]);await chooser.setFiles(path.resolve('pattern-photo.png'));
 await f.waitForFunction(()=>window.level7.model.images?.length===1&&document.querySelector('#canvas image'));
 const im0=await f.evaluate(()=>({w:window.level7.model.images[0].w,x:window.level7.model.images[0].x,y:window.level7.model.images[0].y}));assert.equal(im0.w,400);
 pass('a 400×300 picture is placed behind the drawing (1 px = 1 mm before calibration)');
 // calibrate: the picture's full width (400 px) is really 200 mm
 await fr.locator('.img-win [data-ia="cal"]').click();const box=await fr.locator('#canvas').boundingBox();const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const yy=im0.y+150;await page.mouse.click(...await at(im0.x+150,yy));await page.mouse.click(...await at(im0.x+250,yy));
 await fr.locator('.lib-save [data-cv="real"]').fill('50');await fr.locator('.lib-save [data-cv="ok"]').click();
 await f.waitForFunction(()=>Math.abs(window.level7.model.images[0].w-200)<1.5);pass('calibration: two points 100 mm apart on the picture are really 50 mm: picture width 400 → '+(await f.evaluate(()=>Math.round(window.level7.model.images[0].w)))+' mm');
 await page.keyboard.press('F9');await f.waitForFunction(()=>!document.querySelector('#canvas image'));await page.keyboard.press('F9');await f.waitForFunction(()=>!!document.querySelector('#canvas image'));pass('F9 hides and shows the picture');
 // arrange parts
 await f.evaluate(()=>{window.level7.addPart();window.level7.addPart();});await page.locator('[data-l7d-command="arrange"]').click();await fr.locator('.arrange-win').waitFor();
 assert.equal(await fr.locator('.arrange-win .ar-item').count(),3);await fr.locator('.arrange-win [data-ar-part="0"]').click();
 await f.waitForFunction(()=>window.level7.model.activePart===0&&!document.querySelector('.arrange-win'));pass('arrange parts: 3 large pictures, a click opens part 001');
 // library export / import
 await f.evaluate(()=>window.level7.storeLibrary([{name:'block A',saved:new Date().toISOString(),steps:window.level7.model.steps,names:window.level7.model.names,nextId:4,pieces:[],measurements:[],variables:[]}]));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lb-'));await fs.chmod(dir,0o777);const lf=path.join(dir,'lib.level7lib.json');
 await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},lf);
 await page.locator('[data-l7d-cat="الوراثة"]').click({button:'right'});await page.locator('[data-l7d-tool="inheritBlock"]').click();await fr.locator('.lib-win [data-lb="export"]').click();
 for(let k=0;k<50&&!(await fs.stat(lf).catch(()=>null));k++)await page.waitForTimeout(100);
 await f.evaluate(()=>window.level7.storeLibrary([]));await fr.locator('.lib-win [data-lb="import"]').click();
 await f.waitForFunction(()=>window.level7.library().length===1&&window.level7.library()[0].name==='block A');pass('library exported to a file and imported back (block A)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
