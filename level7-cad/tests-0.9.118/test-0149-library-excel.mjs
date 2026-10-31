// 0.9.149: X table keeps X / name / MTM / base in place while the sizes scroll sideways; a library
// product takes its X values and sizes from Excel; small windows move by their title bar.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0149-library-excel.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'le-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>/استرجاع|حفظ التصميم/.test(d.message())?d.dismiss():d.accept());
 await page.waitForSelector('.l7-design-cat');const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{localStorage.removeItem('level7.mlib');const a=window.level7,m=a.model;m.measurements=Array.from({length:20},(_,i)=>({id:i+1,name:'m'+(i+1),value:100+i}));m.sizes=Array.from({length:14},(_,k)=>({name:'S'+k,step:k+1,values:{}}));a.changed();});
 await page.locator('[data-l7d-command="tab-x"]').click();await fr.locator('.xgrid td.xn').first().waitFor();
 const fz=await f.evaluate(()=>{const t=document.querySelector('.xgrid .xg-table');const before=document.querySelector('.xgrid td.xn').getBoundingClientRect().left;const sz0=document.querySelector('.xgrid td.xv.sz').getBoundingClientRect().left;t.scrollLeft=-600;return{d:document.querySelector('.xgrid td.xn').getBoundingClientRect().left-before,s:document.querySelector('.xgrid td.xv.sz').getBoundingClientRect().left-sz0};});
 assert(Math.abs(fz.d)<1&&Math.abs(fz.s)>100,JSON.stringify(fz));pass(`scrolling the sizes sideways (${Math.round(fz.s)} px) leaves the name column in place`);
 // Excel into a new library product
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lx-'));await fs.chmod(dir,0o777);const csv=path.join(dir,'thobe.csv');
 await fs.writeFile(csv,'X,Name,MTM,Standard,52,54\nX1,length,,1500,1450,1520\nX2,chest,,600,580,620\nX3,collar,,400,,410\n');await fs.chmod(csv,0o666);
 await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},csv);
 await fr.locator('.panel.open [data-xa="mlib"]').first().click();const ml=fr.locator('.mlib-win');await ml.waitFor();await ml.locator('[data-ml="new"]').click();
 const me=fr.locator('.mlib-edit');await me.waitFor();await me.locator('[data-me="name"]').fill('ثوب سعودي');await me.locator('[data-me="xlsx"]').click();
 await me.locator('[data-mv="2"]').waitFor();
 const h0=await me.locator('.za-head').boundingBox();await page.mouse.move(h0.x+80,h0.y+h0.height/2);await page.mouse.down();await page.mouse.move(h0.x+20,h0.y+h0.height/2+120,{steps:5});await page.mouse.up();
 const h1=await me.locator('.za-head').boundingBox();assert(Math.abs(h1.y-h0.y-120)<4,JSON.stringify([h0,h1]));
 await me.locator('[data-me="save"]').click();
 const lib=await f.evaluate(()=>JSON.parse(localStorage.getItem('level7.mlib')));
 assert(lib[0].measurements.length===3&&lib[0].measurements[1].name==='chest'&&lib[0].sizes.map(s=>s.name).join()==='52,54'&&lib[0].sizes[1].values[3]===410&&lib[0].sizes[0].values[3]===undefined,JSON.stringify(lib[0]));
 await f.evaluate(()=>localStorage.removeItem('level7.mlib'));
 pass('library product: «⤓ استيراد Excel» fills 3 X and sizes 52 / 54 (empty cell = base); the window moves by its title bar (+120 px)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
