// 0.9.195 (as GRAFIS): the pointer sees a piece's outer (cut) line: the edge under it glows; a double-click
// on it puts that edge's seam allowance into the top bar (0.9.197: no side window; typing, the X / Z lists
// of the bar and the kind buttons apply to it at once); it works with no tool
// and with any tool that does not use the cut line itself; the seam allowance bar also takes an edge by its
// cut line. The double-click is sent as real mouse input (xdotool) when it is installed: the browser then
// counts the clicks itself, as on the user's computer.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0195-cut-edge.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{execFileSync}from'node:child_process';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ct-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
let xdo=false;try{execFileSync('xdotool',['version'],{stdio:'ignore'});xdo=true;}catch{}
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.images=[];
   m.steps=[{op:'point',id:20,x:'0',y:'0'},{op:'point',id:21,x:'200',y:'0'},{op:'point',id:22,x:'200',y:'150'},{op:'point',id:23,x:'0',y:'150'},
   {op:'line',id:24,p1:{obj:20},p2:{obj:21}},{op:'line',id:25,p1:{obj:21},p2:{obj:22}},{op:'line',id:26,p1:{obj:22},p2:{obj:23}},{op:'line',id:27,p1:{obj:23},p2:{obj:20}}];m.nextId=28;
   m.names={24:'L1',25:'L2',26:'L3',27:'L4'};m.measurements=[{id:1,name:'w',value:12}];m.sizes=[];m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[24,25,26,27],seam:['10','10','10','10'],notches:[],grain:'90'}];a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox(),win=await page.evaluate(()=>[window.screenX,window.screenY]);
 const scr=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const move=async(x,y)=>{const[a,b]=await scr(x,y);if(xdo)execFileSync('xdotool',['mousemove',String(Math.round(win[0]+a)),String(Math.round(win[1]+b))]);else await page.mouse.move(a,b);await page.waitForTimeout(200);};
 const dbl=async(x,y)=>{await move(x,y);if(xdo)execFileSync('xdotool',['click','--repeat','2','--delay','90','1']);else{const[a,b]=await scr(x,y);await page.mouse.dblclick(a,b);}await page.waitForTimeout(400);};
 // L2 is the right edge (x = 200): its cut line is at x = 210
 await move(210,75);await f.waitForFunction(()=>!!document.querySelector('#canvas .cut-hover'));
 const glow=await f.evaluate(()=>{const p=document.querySelector('#canvas .cut-hover').getAttribute('points').split(' ').map(q=>q.split(',').map(Number));return p.map(q=>window.level7.toWorld(q[0],q[1]).map(v=>Math.round(v)));});
 assert(glow.every(q=>q[0]===210),JSON.stringify(glow));pass(`the pointer on the outer line lights up that edge's cut line (L2, x = 210)${xdo?' — real mouse (xdotool)':''}`);
 await move(100,75);await f.waitForFunction(()=>!document.querySelector('#canvas .cut-hover'));pass('away from it the glow goes');
 // double-click on L2's cut line (0.9.197): no window; L2's value goes into the top bar, ready to type
 const hint=()=>f.evaluate(()=>document.querySelector('.seam-bar .seam-hint')?.textContent||'');
 await dbl(210,75);await f.waitForFunction(()=>/L2/.test(document.querySelector('.seam-bar .seam-hint')?.textContent||''));
 const t=await f.evaluate(()=>({form:!!window.level7.form,focus:document.activeElement?.dataset?.sv,v:document.activeElement?.value,mode:window.level7.seamTool?.mode}));
 assert(!t.form&&t.focus==='std'&&t.v==='10'&&t.mode==='std',JSON.stringify(t));pass(`a double-click on it puts L2's value (10) into the top bar, the field ready to type; no side window («${(await hint()).trim()}»)`);
 // typing applies at once (no OK)
 await fr.locator('.seam-bar input[data-sv="std"]').fill('15');
 await f.waitForFunction(()=>window.level7.model.pieces[0].seam.join()==='10,15,10,10');pass('typed 15 in the bar: L2 has 15 at once (no OK), the other edges stay 10');
 // X / Z lists in the bar: X1 → L2 = X1 (12 mm)
 await fr.locator('.seam-bar .ref-x').selectOption('X1');
 await f.waitForFunction(()=>window.level7.model.pieces[0].seam[1]==='X1');
 const cx=await f.evaluate(()=>Math.max(...window.level7.res.pieces.get(1).cut.map(q=>q[0])));assert(Math.abs(cx-212)<0.01,String(cx));
 pass('the X list in the bar: X1 chosen → L2 = X1 (12 mm) at once, the cut line moved to x = 212');
 // one undo step brings back 10 (the run of changes to the edge is one step)
 await f.evaluate(()=>window.level7.undo());await f.waitForFunction(()=>window.level7.model.pieces[0].seam[1]==='10');pass('Ctrl+Z: one step back to 10');
 await f.evaluate(()=>window.level7.redo());await f.waitForFunction(()=>window.level7.model.pieces[0].seam[1]==='X1');
 // a small zoom: the allowance is 12 mm → about 19 px on screen, inside the 30 px pick distance of the sewing line;
 // the pointer on the cut line (x = 212) still takes the cut line (it is nearer), not the sewing line beside it
 await f.evaluate(()=>{const a=window.level7;a.endSeamTool();a.zoomBy(1.6/a.scale);});await page.waitForTimeout(200);
 await move(212,75);await f.waitForFunction(()=>!!document.querySelector('#canvas .cut-hover'));
 assert.equal(await f.evaluate(()=>window.level7.near),null);
 await dbl(212,75);await f.waitForFunction(()=>/L2/.test(document.querySelector('.seam-bar .seam-hint')?.textContent||''));
 assert.equal(await f.evaluate(()=>document.activeElement?.value),'X1');
 await f.evaluate(()=>{const a=window.level7;a.endSeamTool();a.fit();});await page.waitForTimeout(200);
 pass('small zoom (allowance about 19 px, the sewing line within the pick distance): the cut line still glows and the double-click puts L2 (X1) into the bar');
 // with a tool that does not use the cut line (delete lines): the double-click still chooses the edge (L3, bottom, y = 160)
 await page.evaluate(()=>document.querySelector('#l7-design-frame').contentWindow.postMessage({type:'l7:tool',key:'delLines'},'*'));await f.waitForFunction(()=>window.level7.tool?.key==='delLines');
 const n0=await f.evaluate(()=>window.level7.model.steps.length);
 await dbl(100,160);await f.waitForFunction(()=>/L3/.test(document.querySelector('.seam-bar .seam-hint')?.textContent||''));
 assert.equal(await f.evaluate(()=>window.level7.model.steps.length),n0);pass('with the «delete lines» tool on, a double-click on the bottom cut line chooses L3 in the bar (nothing deleted)');
 // a kind button applies to the chosen edge at once: «none» → L3 = 0
 await fr.locator('.seam-bar [data-sm="none"]').click();
 await f.waitForFunction(()=>window.level7.model.pieces[0].seam[2]==='0');pass('the «بدون» button in the bar: L3 has no allowance at once');
 // the bar takes an edge by its cut line too: a click on the top cut line (L1, y = -10) applies «none» to L1
 await (async()=>{const[a,b]=await scr(100,-10);await page.mouse.click(a,b);})();
 await f.waitForFunction(()=>window.level7.model.pieces[0].seam[0]==='0');pass('the seam allowance bar: a click on the top cut line sets L1 (no allowance)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
