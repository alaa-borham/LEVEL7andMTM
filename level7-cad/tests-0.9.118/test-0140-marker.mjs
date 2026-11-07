// 0.9.140: marker making: one AAMA file with the pieces of every production part, in every
// size and MTM customer, with amounts and mirrored pieces. Usage: L7_SRC=<app dir> xvfb-run -a node test-0140-marker.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'mk-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForSelector('#tool-guide');
 await page.waitForSelector('.l7-design-cat');{const f0=page.frames().find(x=>x.url().includes('l7design'));await f0.waitForFunction(()=>!!window.level7);await f0.evaluate(()=>{window.level7.model.__old=1;});await page.locator('.menubar summary',{hasText:'File'}).click();await page.locator('#menu-l7-design-new').click();await f0.waitForFunction(()=>!window.level7.model.__old);} // «new design» reaches the drawing by a message: wait for it before filling the modelawait page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{const a=window.level7,m=a.model;m.name='thobe';m.measurements.push({id:1,name:'width',value:100});m.sizes=[{name:'L',step:1,values:{1:120}},{name:'Ahmad',kind:'customer',step:0,values:{1:133}}];
  const sq=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'X1',y:'0'},{op:'point',id:3,x:'X1',y:'200'},{op:'point',id:4,x:'0',y:'200'},{op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}}];
  m.steps=sq;m.nextId=9;m.pieces=[{id:1,name:'front',quantity:1,fabric:'',edges:[5,6,7,8],seam:['10','10','10','10'],notches:[],grain:'90'}];a.changed();});
 await page.locator('[data-l7d-command="tab-partlist"]').click();await fr.locator('.pgrid').waitFor();
 await fr.locator('.pgrid input[name="pkind"][value="prod"]').check();await fr.locator('.pgrid [data-pp="amount"]').fill('2');await fr.locator('.pgrid [data-pp="amount"]').press('Enter');
 await fr.locator('.pgrid [data-pp="mirrored"]').fill('1');await fr.locator('.pgrid [data-pp="mirrored"]').press('Enter');
 await fr.locator('.pgrid [data-pa="add"]').click();await f.waitForFunction(()=>window.level7.model.parts.length===2);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mkf-'));await fs.chmod(dir,0o777);const out=path.join(dir,'marker.dxf');
 await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},out);
 await page.locator('[data-l7d-command="marker"]').click();for(let k=0;k<60&&!(await fs.stat(out).catch(()=>null));k++)await page.waitForTimeout(100);
 const dxf=await fs.readFile(out,'utf8');
 const q2=(dxf.match(/Quantity: 2/g)||[]).length,q1=(dxf.match(/Quantity: 1/g)||[]).length,mir=(dxf.match(/\(M\)/g)||[]).length;
 assert(q2===3&&q1===3&&mir>=3,JSON.stringify({q2,q1,mir}));assert(dxf.includes('Ahmad')&&dxf.includes('L'));
 pass('one AAMA file: production part 001 only (the new empty part is a draft), 3 sizes incl. MTM customer «Ahmad», 2 normal + 1 mirrored each');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
