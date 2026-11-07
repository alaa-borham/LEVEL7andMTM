// 0.9.132: X values as GRAFIS: dense table X | Name | MTM | Standard | sizes, tool bar
// (add, delete selected), search, copy. Usage: L7_SRC=<app dir> xvfb-run -a node test-0132-xgrid.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'xg-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{const a=window.level7;a.__newDone=false;if(!a.__newWrapped){const o=a.newDesign.bind(a);a.newDesign=()=>{try{o();}finally{a.__newDone=true;}};a.__newWrapped=true;}});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>window.level7.__newDone);} /* «new design» reaches the drawing by a message: wait for it before filling the model */await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements.push({id:1,name:'front length',value:1500,code:'FL'},{id:2,name:'bottom girth',value:1450},{id:3,name:'hip',value:1140});m.sizes=[{name:'_KO176',step:1,values:{}}];a.changed();});
 await page.locator('[data-l7d-command="tab-x"]').click();await fr.locator('.xgrid').waitFor();
 const heads=await fr.locator('#tab-x .xg-table th').allTextContents();assert.deepEqual(heads.map(h=>h.trim()).slice(3),['الأساسي','_KO176'],heads.join('|'));
 assert.equal(await fr.locator('#tab-x .xg-table td.xc input').first().inputValue(),'FL');pass('table: X | Name | MTM | Standard | size column');
 const cell=fr.locator('input[data-sz="0"][data-xid="1"]');await cell.click();await page.keyboard.type('1600');await page.keyboard.press('Enter');
 assert.equal(await f.evaluate(()=>window.level7.model.sizes[0].values[1]),1600);pass('size column: 1600 for _KO176 saved; empty = base value');
 await fr.locator('#tab-x [data-xa="search"]').fill('hip');assert.equal(await fr.locator('#tab-x .xg-table tbody tr').count(),1);await fr.locator('#tab-x [data-xa="clear"]').click();assert.equal(await fr.locator('#tab-x .xg-table tbody tr').count(),3);pass('search filters the rows (hip)');
 await fr.locator('#tab-x .xg-table input[data-f="name"][data-i="1"]').click();await fr.locator('#tab-x [data-xa="del"]').click();
 assert.deepEqual(await f.evaluate(()=>window.level7.model.measurements.map(m=>m.id)),[1,3]);pass('✕ deletes the selected row (X2)');
 await fr.locator('#tab-x .xg-add').click();await f.waitForFunction(()=>document.activeElement?.dataset?.f==='value'&&document.activeElement.selectionEnd>0);await page.keyboard.type('700');await page.keyboard.press('Enter');assert.equal(await f.evaluate(()=>window.level7.model.measurements.at(-1).value),700);pass('⊕ adds a row and its value is typed at once (700)');
 await page.screenshot({path:'shot-0132-x.png'});
 // 0.9.133: export to Excel (.xlsx) through the program's dialog, then import it back
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xl-'));await fs.chmod(dir,0o777);const xfile=path.join(dir,'measures.xlsx');
 await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},xfile);
 const before=await f.evaluate(()=>JSON.stringify({m:window.level7.model.measurements,s:window.level7.model.sizes}));
 await fr.locator('#tab-x [data-xa="export"]').click();for(let k=0;k<50&&!(await fs.stat(xfile).catch(()=>null));k++)await page.waitForTimeout(100);
 const head=(await fs.readFile(xfile)).subarray(0,2).toString();assert.equal(head,'PK');
 await f.evaluate(()=>{const a=window.level7;a.model.measurements.forEach(m=>{m.value=0;m.name=''});a.model.sizes[0].values={};a.changed();});
 await fr.locator('#tab-x [data-xa="import"]').click();await f.waitForFunction(()=>window.level7.model.measurements[0].value===1500);
 assert.equal(await f.evaluate(()=>JSON.stringify({m:window.level7.model.measurements,s:window.level7.model.sizes})),before);
 pass('Excel: export to .xlsx and import it back gives the same X values, names, MTM codes and size column');
 const cfile=path.join(dir,'from-excel.csv');await fs.writeFile(cfile,'\uFEFFX;الاسم;Standard;_KO176\r\nX3;الورك;1200;1250\r\nX9;طول الكم;600;\r\n');
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},cfile);
 await fr.locator('#tab-x [data-xa="import"]').click();await f.waitForFunction(()=>window.level7.model.measurements.some(m=>m.id===9));
 const got=await f.evaluate(()=>({x3:window.level7.model.measurements.find(m=>m.id===3),x9:window.level7.model.measurements.find(m=>m.id===9),s3:window.level7.model.sizes[0].values[3]}));
 assert.equal(got.x3.value,1200);assert.equal(got.x3.name,'الورك');assert.equal(got.x9.name,'طول الكم');assert.equal(got.s3,1250);
 pass('CSV saved from Excel (Arabic names, ; separator): X3 updated to 1200 (KO176 1250), X9 added');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
