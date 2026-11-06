// 0.9.162: «👁 show all parts» (as GRAFIS): every part drawn side by side in solid lines, not on top of
// each other; the part under the pointer lights up and a click switches to it in place; 🚫 shows the
// active part alone again.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0162-show-all-parts.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 // three parts drawn at the same place: a square 300, a square 200, a line
 await f.evaluate(()=>{const a=window.level7,m=a.model;a.snapshot();localStorage.removeItem('level7.allParts');a.allParts=false;delete m.lineStyles;m.pieces=[];
   const sq=(n)=>[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:String(n),y:'0'},{op:'point',id:3,x:String(n),y:String(n)},{op:'point',id:4,x:'0',y:String(n)},
     {op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}}];
   m.parts=[{no:1,name:'a',steps:sq(300),names:{},nextId:9,pieces:[],amount:1},{no:2,name:'b',steps:sq(200),names:{},nextId:9,pieces:[],amount:1},
     {no:3,name:'c',steps:[{op:'point',id:1,x:'0',y:'0'},{op:'lineAngle',id:2,start:{obj:1},angle:'0',length:'250'}],names:{},nextId:3,pieces:[],amount:1}];
   m.activePart=0;const p=m.parts[0];m.steps=p.steps;m.names=p.names;m.nextId=p.nextId;a.selectedStep=-1;a.changed();a.fit();});
 assert.equal(await f.evaluate(()=>window.level7.ghosts.length),0);
 await fr.locator('.part-strip [data-sall="1"]').click();
 let r=await f.evaluate(()=>{const a=window.level7;return{n:a.ghostInfo.length,all:a.ghostInfo.every(g=>g.all),offs:a.ghostInfo.map(g=>g.off.map(Math.round)),cls:document.querySelectorAll('#canvas polyline.allpart').length,dashed:document.querySelectorAll('#canvas polyline.ghost').length};});
 // part b (200) and c laid out to the right of part a (300 wide) without overlapping
 assert(r.n===2&&r.all&&r.offs[0][0]>=300&&r.offs[1][0]>r.offs[0][0]+200&&r.cls===5&&r.dashed===0,JSON.stringify(r));
 pass(`👁 show all: parts 002 and 003 drawn beside part 001 in solid lines (offsets ${JSON.stringify(r.offs)}), not on top of it`);
 // hover part 002 then click it: it becomes active and stays where it was on the screen
 const box=await page.locator('#l7-design-frame').boundingBox();
 const s2=await f.evaluate(()=>{const a=window.level7,o=a.ghostInfo[0].off;return a.toScreen([100+o[0],0+o[1]]);});
 await page.mouse.move(box.x+s2[0],box.y+s2[1]);await page.waitForTimeout(150);
 assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas polyline.allpart.hover').length),4);
 await page.mouse.click(box.x+s2[0],box.y+s2[1]);
 r=await f.evaluate(()=>{const a=window.level7;return{act:a.model.activePart,at:a.toScreen([100,0]).map(Math.round),n:a.ghostInfo.length};});
 assert(r.act===1&&Math.abs(r.at[0]-Math.round(s2[0]))<=1&&Math.abs(r.at[1]-Math.round(s2[1]))<=1&&r.n===2,JSON.stringify({r,s2}));
 pass('the part under the pointer lights up; a click makes part 002 active and it stays in its place on the screen');
 await fr.locator('.part-strip [data-sall="0"]').click();
 assert.equal(await f.evaluate(()=>window.level7.ghosts.length),0);pass('🚫 shows the active part alone again');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
