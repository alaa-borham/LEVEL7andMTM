// 0.9.198: every tool that uses a piece's outer (cut) line takes it when the pointer is nearer to it than to
// the sewing line, also at a small zoom where the sewing line lies within the 30 px pick distance (mirror:
// glow + whole piece; seam allowance bar: the edge); the drawn line of an edge with a seam allowance is dotted
// (an edge with none stays solid). Real mouse input (xdotool) when installed.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0198-cut-tools.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{execFileSync}from'node:child_process';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'cu-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
let xdo=false;try{execFileSync('xdotool',['version'],{stdio:'ignore'});xdo=true;}catch{}
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 // a rectangle 0..200 × 0..150, seam 10 on L1 (top), L2 (right), L3 (bottom); none on L4 (left)
 await f.evaluate(()=>{localStorage.removeItem('level7.barPos');const a=window.level7,m=a.model;a.snapshot();delete m.parts;delete m.activePart;m.images=[];
   m.steps=[{op:'point',id:20,x:'0',y:'0'},{op:'point',id:21,x:'200',y:'0'},{op:'point',id:22,x:'200',y:'150'},{op:'point',id:23,x:'0',y:'150'},
   {op:'line',id:24,p1:{obj:20},p2:{obj:21}},{op:'line',id:25,p1:{obj:21},p2:{obj:22}},{op:'line',id:26,p1:{obj:22},p2:{obj:23}},{op:'line',id:27,p1:{obj:23},p2:{obj:20}}];m.nextId=28;
   m.names={24:'L1',25:'L2',26:'L3',27:'L4'};m.pieces=[{id:1,name:'p',quantity:1,fabric:'',edges:[24,25,26,27],seam:['10','10','10','0'],notches:[],grain:'90'}];a.selectedStep=-1;a.changed();a.fit();});
 const box=await page.locator('#l7-design-frame').boundingBox(),win=await page.evaluate(()=>[window.screenX,window.screenY]);
 const scr=async(x,y)=>{const[sx,sy]=await f.evaluate(([x,y])=>window.level7.toScreen([x,y]),[x,y]);return[box.x+sx,box.y+sy];};
 const move=async(x,y)=>{const[a,b]=await scr(x,y);if(xdo)execFileSync('xdotool',['mousemove',String(Math.round(win[0]+a)),String(Math.round(win[1]+b))]);else await page.mouse.move(a,b);await page.waitForTimeout(250);};
 const click=async(x,y)=>{await move(x,y);if(xdo)execFileSync('xdotool',['click','1']);else{const[a,b]=await scr(x,y);await page.mouse.click(a,b);}await page.waitForTimeout(300);};
 // dotted / solid
 const dash=await f.evaluate(()=>{const a=window.level7,out={};for(const pl of document.querySelectorAll('#canvas polyline')){const p=pl.getAttribute('points').split(' ').map(q=>a.toWorld(...q.split(',').map(Number)).map(v=>Math.round(v)));for(const[id,nm]of[[24,'L1'],[27,'L4']]){const o=a.res.objects.get(id).pts.map(q=>q.map(v=>Math.round(v)));if(p.length===o.length&&p.every((q,i)=>q[0]===o[i][0]&&q[1]===o[i][1]))out[nm]=(out[nm]||[]).concat(pl.getAttribute('stroke-dasharray')||'solid');}}return out;});
 assert(dash.L1?.length&&dash.L1.every(d=>d!=='solid')&&dash.L4?.length&&dash.L4.some(d=>d==='solid'),JSON.stringify(dash));
 pass('the drawn line of an edge with a seam allowance (L1) is dotted; the edge with none (L4) stays solid');
 // a small zoom: 10 mm = 20 px, the sewing line within the 30 px pick distance
 await f.evaluate(()=>{const a=window.level7;a.zoomBy(2/a.scale);});await page.waitForTimeout(200);
 // mirror (copy) about L4, then the pointer on the top cut line (y = -10): the piece lights up, a click copies it
 await page.evaluate(()=>document.querySelector('#l7-design-frame').contentWindow.postMessage({type:'l7:tool',key:'mirrorCopy'},'*'));await f.waitForFunction(()=>window.level7.tool?.key==='mirrorCopy');
 await click(0,75);await f.waitForFunction(()=>window.level7.collecting);
 await move(100,-10);await f.waitForFunction(()=>!!document.querySelector('#canvas .piece-hover'));
 await click(100,-10);await f.waitForFunction(()=>window.level7.model.pieces.length===2);
 const mp=await f.evaluate(()=>{const a=window.level7,g=a.res.pieces.get(a.model.pieces[1].id);return{err:g?.error??null,maxX:Math.max(...g.cut.map(q=>q[0])),seam:a.model.pieces[1].seam.join()};});
 assert(mp.err===null&&Math.abs(mp.maxX)<0.5&&mp.seam==='10,10,10,0',JSON.stringify(mp));
 pass(`small zoom (allowance 20 px): with the mirror tool the top cut line lights up the piece and a click copies the whole piece about L4 (seam ${mp.seam})${xdo?' — real mouse':''}`);
 await f.evaluate(()=>{const a=window.level7;a.cancelTool();a.model.pieces.pop();a.changed();});
 // seam allowance bar: «none», a click on the right cut line (x = 210) sets L2 (the cut edge, not the sewing edge it is 20 px from)
 await page.evaluate(()=>document.querySelector('#l7-design-frame').contentWindow.postMessage({type:'l7:tool',key:'seamAllowance'},'*'));await fr.locator('.seam-bar').waitFor();
 await fr.locator('.seam-bar [data-sm="none"]').click();await click(210,75);
 await f.waitForFunction(()=>window.level7.model.pieces[0].seam.join()==='10,0,10,0');pass('small zoom: the seam allowance bar takes the right edge by its cut line (L2 → none)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
