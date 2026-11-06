// 0.9.181: seam allowance of the other parts shown; grain line inside the piece (and none when one is drawn);
// F5 refreshes; the curve-end number says what it is; notch along an inner line with its own length;
// round / cut off a corner of the cut (outer) line; background picture moved / resized by hand, or fixed
// as the background of the whole screen.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0181-batch.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 const box=await page.locator('#l7-design-frame').boundingBox(),at=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const open=async key=>{const b=page.locator(`[data-l7d-tool="${key}"]`);if(!await b.isVisible()){const cat=await b.evaluate(e=>e.closest('[data-l7d-cat-panel]').dataset.l7dCatPanel);await page.locator(`[data-l7d-cat="${cat}"]`).click({button:"right"});}await b.click();};
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');localStorage.removeItem('level7.formMini');localStorage.removeItem('level7.allParts');const a=window.level7,m=a.model;a.snapshot();a.allParts=false;delete m.lineStyles;m.images=[];
   const sq=(w,h)=>[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:String(w),y:'0'},{op:'point',id:3,x:String(w),y:String(h)},{op:'point',id:4,x:'0',y:String(h)},
     {op:'line',id:5,p1:{obj:1},p2:{obj:2}},{op:'line',id:6,p1:{obj:2},p2:{obj:3}},{op:'line',id:7,p1:{obj:3},p2:{obj:4}},{op:'line',id:8,p1:{obj:4},p2:{obj:1}}];
   const pc=()=>[{id:1,name:'p',quantity:1,fabric:'',edges:[5,6,7,8],seam:['10','10','10','10'],notches:[],grain:'90'}];
   const a1=[...sq(200,300),{op:'point',id:9,x:'60',y:'100'},{op:'point',id:10,x:'200',y:'200'},{op:'line',id:11,p1:{obj:9},p2:{obj:10}}];
   m.parts=[{no:1,name:'a',steps:a1,names:{},nextId:12,pieces:pc(),amount:1},{no:2,name:'b',steps:sq(150,150),names:{},nextId:9,pieces:pc(),amount:1}];
   m.activePart=0;const p=m.parts[0];m.steps=p.steps;m.names=p.names;m.nextId=p.nextId;m.pieces=p.pieces;a.selectedStep=-1;a.changed();a.fit();});
 // 1) show all parts: the other part's piece (cut line + sewing line) is drawn too
 await fr.locator('.part-strip [data-sall="1"]').click();
 await f.waitForFunction(()=>document.querySelectorAll('#canvas polygon.ghost-piece').length===2);pass('all parts shown: the other part shows its seam allowance (cut line and sewing line)');
  await f.evaluate(()=>{window.level7.setAllParts(false);window.level7.fit();});
 // 2) the automatic grain line stays inside the piece; a drawn grain line replaces it
 const gl=await f.evaluate(()=>{const g=window.level7.res.pieces.get(1).grain;return Math.hypot(g[1][0]-g[0][0],g[1][1]-g[0][1]);});
 assert(Math.abs(gl-0.7*300)<1,String(gl));
 const pieceLines=()=>f.evaluate(()=>[...document.querySelectorAll('#canvas > line')].filter(l=>l.getAttribute('stroke')==='var(--piece)').length);
 assert.equal(await pieceLines(),1);
 await f.evaluate(()=>{const a=window.level7;a.snapshot();a.model.steps.push({op:'point',id:12,x:'100',y:'250'},{op:'mark',kind:'grain',a:{obj:12},angle:'-90',size:'150'});a.model.nextId=13;a.changed();});
 assert.equal(await pieceLines(),0);pass(`grain line ${Math.round(gl)} mm (70% of the piece height, inside it); hidden when a grain line is drawn in the piece`);
 // 3) F5 refreshes the screen
 await f.evaluate(()=>{window.__rf=0;const a=window.level7,o=a.refreshView.bind(a);a.refreshView=()=>{window.__rf++;o();};});
 await page.keyboard.press('F5');await f.waitForFunction(()=>window.__rf===1);pass('F5 refreshes the screen');
 // 4) notch on the end of the inner line: runs on along it, length 8
 await open('notch');await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="notch"]').getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await at(200,200),{modifiers:['Shift']});
 const tb=fr.locator('#tool-box');await tb.locator('input[data-key="len"]').waitFor();await tb.locator('input[data-key="len"]').fill('8');await tb.locator('[data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.pieces[0].notches.length===1);
 const n=await f.evaluate(()=>({pc:window.level7.model.pieces[0],g:window.level7.res.pieces.get(1).notches[0]}));
 const v=[n.g.at[0]-n.g.to[0],n.g.at[1]-n.g.to[1]],L=Math.hypot(...v),u=[140/Math.hypot(140,100),100/Math.hypot(140,100)];
 assert(n.pc.notchLen[0]==='8'&&Math.abs(L-8)<1e-6&&Math.abs(v[0]/L-u[0])<1e-6&&Math.abs(v[1]/L-u[1])<1e-6&&Math.abs(n.g.at[0]-210)<1e-6,JSON.stringify(n));
 pass('notch at the end of an inner line: on its extension out to the cut line, 8 mm long as typed');
 // 5) round corner of the cut (outer) line: click near its corner in the seam allowance
 await page.keyboard.press('Escape');await open('cornerRound');await page.waitForFunction(()=>document.querySelector('[data-l7d-tool="cornerRound"]').getAttribute('aria-pressed')==='true');
 await page.mouse.click(...await at(208,-8));
 await tb.locator('input[data-key="size"]').waitFor();await tb.locator('input[data-key="size"]').fill('6');await tb.locator('[data-ok]').click();
 await f.waitForFunction(()=>window.level7.model.pieces[0].cutCorners?.['5,6']?.kind==='round');
 const cut=await f.evaluate(()=>window.level7.res.pieces.get(1).cut);
 assert(!cut.some(p=>Math.hypot(p[0]-210,p[1]+10)<1e-6)&&cut.some(p=>Math.hypot(p[0]-204,p[1]+10)<1e-6),JSON.stringify(cut.slice(0,8)));
 assert.equal(await f.evaluate(()=>window.level7.model.steps.filter(s=>s.op==='corner').length),0);
 pass('round corner on the cut line (outer line): radius 6 at the corner of edges 5 / 6, the drawing lines untouched');
 await page.keyboard.press('Escape');
 // 6) background picture: move and resize by hand, then fixed as the whole-screen background
 await f.evaluate(()=>{const a=window.level7;a.snapshot();const c=document.createElement('canvas');c.width=40;c.height=20;c.getContext('2d').fillRect(0,0,40,20);
   a.model.images=[{id:1,name:'p.png',data:c.toDataURL('image/png'),x:300,y:0,w:100,h:50,opacity:0.5,visible:true}];a.vis.images=true;a.changed();a.fit();a.scale*=0.5;a.cx=250;a.cy=50;a.render();a.openImages();});
 await fr.locator('.img-win [data-ia="hand"]').click();await f.waitForFunction(()=>!!document.querySelector('#canvas .img-frame'));
 // move: drag the middle by +50 / +20
 let s=await at(350,25),e=await at(400,45);await page.mouse.move(...s);await page.mouse.down();await page.mouse.move(...e,{steps:5});await page.mouse.up();
 let im=await f.evaluate(()=>window.level7.model.images[0]);assert(Math.abs(im.x-350)<1.5&&Math.abs(im.y-20)<1.5&&im.w===100,JSON.stringify({...im,data:''}));
 // resize: drag the right-bottom corner (450,20) to (550,20): twice as wide, proportions kept, the left-top corner stays
 s=await at(450,20);e=await at(550,20);await page.mouse.move(...s);await page.mouse.down();await page.mouse.move(...e,{steps:5});await page.mouse.up();
 im=await f.evaluate(()=>window.level7.model.images[0]);assert(Math.abs(im.w-200)<2&&Math.abs(im.h-100)<1&&Math.abs(im.x-350)<1.5&&Math.abs(im.y+im.h-70)<1.5,JSON.stringify({...im,data:''}));
 pass(`picture moved and resized by hand (now ${Math.round(im.w)} × ${Math.round(im.h)} mm at ${Math.round(im.x)}, ${Math.round(im.y)})`);
 await page.mouse.click(...await at(-200,-200));assert(await f.evaluate(()=>!document.querySelector('#canvas .img-frame')));
 await f.evaluate(()=>window.level7.openImages());await fr.locator('.img-win [data-ik="screen"]').check();
 const scr=await f.evaluate(()=>{const i=document.querySelector('#canvas image');return[i.getAttribute('x'),i.getAttribute('width'),i.getAttribute('height')];});
 assert.deepEqual(scr,['0','100%','100%']);
 await f.evaluate(()=>window.level7.switchPart(1));assert.deepEqual(await f.evaluate(()=>document.querySelector('#canvas image')?.getAttribute('width')),'100%');
 pass('📌 fixed: the picture is the background of the whole screen, also in the other part');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
