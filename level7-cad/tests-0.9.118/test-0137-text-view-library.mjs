// 0.9.137: text (with {X}), delete text / symbols / stitches / notches, view options (F4, F7,
// Alt+O), product info to PDF, basic blocks library, convert notch.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0137-text-view-library.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'tv-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{const a=window.level7;a.__newDone=false;if(!a.__newWrapped){const o=a.newDesign.bind(a);a.newDesign=()=>{try{o();}finally{a.__newDone=true;}};a.__newWrapped=true;}});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>window.level7.__newDone);} /* «new design» reaches the drawing by a message: wait for it before filling the model */await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{window.confirm=()=>true;const a=window.level7,m=a.model;m.measurements.push({id:1,name:'length',value:1500});
  m.steps.push({op:'point',id:1,x:'200',y:'0'},{op:'point',id:2,x:'0',y:'0'},{op:'point',id:3,x:'0',y:'200'},{op:'point',id:4,x:'200',y:'200'},{op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}},{op:'line',id:9,p1:{obj:4},p2:{obj:1}});
  Object.assign(m.names,{1:'P1',2:'P2',3:'P3',4:'P4',5:'L1',6:'L2',7:'L3',8:'L4',9:'L5'});m.nextId=10;
  m.pieces=[{id:1,name:'front',quantity:1,fabric:'',edges:[5,6,7,8],seam:['10','10','10','10'],notches:[{obj:1}],grain:'90'}];a.changed();a.fit();});
 const box=await fr.locator('#canvas').boundingBox();const at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const tool=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();await page.waitForFunction(k=>document.querySelector(`[data-l7d-tool="${k}"]`).getAttribute('aria-pressed')==='true',key);};
 // 1 text with {X1}
 await tool('textCreate');await page.mouse.click(...await at(100,100));await fr.locator('#tool-box input[data-key="text"]').fill('الطول {X1}');await fr.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>[...document.querySelectorAll('#canvas text.pat-text')].some(t=>t.textContent==='الطول 1500'));pass('text on the drawing shows {X1} as 1500');
 await page.keyboard.press('Escape');await tool('delText');const th=await f.evaluate(()=>window.level7.textHits[0].s);await page.mouse.click(box.x+th[0],box.y+th[1]);
 await f.waitForFunction(()=>!window.level7.model.steps.some(s=>s.op==='text'));pass('delete text by clicking it');
 // 2 symbols / stitches / notches in a frame
 await f.evaluate(()=>{const a=window.level7;a.model.steps.push({op:'mark',kind:'button',a:{obj:2},size:'10'},{op:'mark',kind:'lock',obj:5,side:1,size:'3'});a.changed();});
 await page.keyboard.press('Escape');await tool('delSymbolsFrame');await page.mouse.click(...await at(-7,-7));await page.mouse.click(...await at(30,30));
 await f.waitForFunction(()=>!window.level7.model.steps.some(s=>s.op==='mark'&&s.kind==='button'));
 await page.keyboard.press('Escape');await tool('delStitchesFrame');await page.mouse.click(...await at(-7,-7));await page.mouse.click(...await at(207,30));
 await f.waitForFunction(()=>!window.level7.model.steps.some(s=>s.op==='mark'));pass('symbols and stitches deleted inside frames');
 // 6 convert notch (before deleting it)
 await page.keyboard.press('Escape');await tool('convertNotch');const nat=await f.evaluate(()=>window.level7.res.pieces.get(1).notches[0].at);await page.mouse.click(...await at(nat[0],nat[1]));
 await fr.locator('#tool-box select[data-key="type"]').selectOption('v');await fr.locator('#tool-box [data-ok]').click();
 await f.waitForFunction(()=>window.level7.res.pieces.get(1).notches[0].type==='v'&&window.level7.res.pieces.get(1).notches[0].shape[0].length===3);pass('convert notch: slit → V (drawn and cut as V)');
 await page.keyboard.press('Escape');await tool('delNotchesFrame');await page.mouse.click(...await at(190,-6));await page.mouse.click(...await at(206,10));
 await f.waitForFunction(()=>window.level7.model.pieces[0].notches.length===0&&(window.level7.model.pieces[0].notchTypes||[]).length===0);pass('notches deleted inside a frame (shape list kept in step)');
 // 3 view options
 await page.keyboard.press('Escape');await page.locator('[data-l7d-command="dup"]').click();await f.waitForFunction(()=>document.querySelectorAll('#canvas [stroke="#ff00d4"]').length>=2);pass('F4: duplicate lines L4 / L5 highlighted');
 await f.evaluate(()=>{const a=window.level7;a.model.steps.push({op:'dim',kind:'h',a:{obj:2},b:{obj:1},offset:'-20'});a.changed();});await f.waitForFunction(()=>document.querySelectorAll('#canvas g.dim').length===1);
 await page.locator('[data-l7d-command="dims"]').click();await f.waitForFunction(()=>document.querySelectorAll('#canvas g.dim').length===0);
 await page.locator('[data-l7d-command="visibility"]').click();await fr.locator('.vis-win').waitFor();await fr.locator('.vis-win [data-vk="points"]').uncheck();
 await f.waitForFunction(()=>![...document.querySelectorAll('#canvas circle')].some(c=>c.getAttribute('r')==='2.6'));await fr.locator('.vis-win [data-vk="points"]').check();await fr.locator('.vis-win [data-vk="dims"]').check();
 pass('F7 hides dimensions; Alt+O window hides / shows points and dimensions');
 // 4 product info to PDF
 const pdf=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'pd-')),'p.pdf');await fs.chmod(path.dirname(pdf),0o777);
 await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},pdf);
 await page.locator('[data-l7d-command="product"]').click();await fr.locator('.product-win [data-pi="name"]').fill('ثوب');await fr.locator('.product-win [data-pi-act="print"]').click();
 for(let k=0;k<80&&!(await fs.stat(pdf).catch(()=>null));k++)await page.waitForTimeout(150);
 assert.equal((await fs.readFile(pdf)).subarray(0,4).toString(),'%PDF');await fr.locator('.product-win [data-pi-act="close"]').first().click();pass('product info printed to a PDF file');
 await f.evaluate(()=>window.level7.storeLibrary([]));
 // 5 library: save the part as a block, insert it as a new part
 await page.locator('[data-l7d-cat="الوراثة"]').click({button:'right'});await page.locator('[data-l7d-tool="saveBlock"]').click();
 await fr.locator('.lib-save [data-ls="name"]').fill('أمام أساسي');await fr.locator('.lib-save [data-ls="ok"]').click();
 await page.locator('[data-l7d-cat="الوراثة"]').click({button:'right'});await page.locator('[data-l7d-tool="inheritBlock"]').click();await fr.locator('.lib-win').waitFor();
 await fr.locator('.lib-win [data-lb="ok"]').click();await f.waitForFunction(()=>window.level7.model.parts?.length===2&&window.level7.model.activePart===1);
 const blk=await f.evaluate(()=>({name:window.level7.model.parts[1].name,objs:window.level7.res.objects.size}));assert.equal(blk.name,'أمام أساسي');assert(blk.objs>=9);
 pass('library: part saved as a block and inherited as part 002 ('+blk.objs+' objects)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
