// 0.9.150: as GRAFIS, the line / curve near the pointer is marked (glow + a dot on its nearest
// point); drawing colours can be changed in View (Alt+O) and are kept.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0150-near-colors.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'nc-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');const f=page.frames().find(x=>x.url().includes('l7design')),fr=page.frameLocator('#l7-design-frame');await f.waitForFunction(()=>!!window.level7);
 await f.evaluate(()=>{localStorage.removeItem('level7.colors');const a=window.level7,m=a.model;a.snapshot();m.steps=[{op:'point',id:1,x:'0',y:'0'},{op:'point',id:2,x:'0',y:'300'},{op:'line',id:3,p1:{obj:1},p2:{obj:2}},{op:'point',id:4,x:'200',y:'250'},{op:'point',id:6,x:'300',y:'100'},{op:'curve',id:5,through:[{obj:2},{obj:4},{obj:6}],startAngle:'',endAngle:''}];m.nextId=7;a.changed();a.fit();a.applyColors();});
 const box=await page.locator('#l7-design-frame').boundingBox();
 const [sx,sy]=await f.evaluate(()=>window.level7.toScreen([0,150]));await page.mouse.move(box.x+sx+5,box.y+sy);await page.waitForTimeout(150);
 const n=await f.evaluate(()=>({glow:document.querySelectorAll('#canvas .near-glow').length,dot:document.querySelector('#canvas .near-dot'),at:window.level7.near}));
 assert(n.glow===1&&n.dot!==null&&Math.abs(n.at.at[0])<0.01&&Math.abs(n.at.at[1]-150)<2,JSON.stringify(n));
 await page.mouse.move(box.x+20,box.y+box.height-20);await page.waitForTimeout(150);assert.equal(await f.evaluate(()=>document.querySelectorAll('#canvas .near-dot').length),0);
 pass('near the vertical line the line glows and a dot sits on its nearest point (0, 150); away from it nothing');
 await page.keyboard.press('Alt+o');const vw=fr.locator('.vis-win');await vw.waitFor();
 await vw.locator('[data-ck="--line"]').evaluate(i=>{i.value='#1e90ff';i.dispatchEvent(new Event('input',{bubbles:true}));});
 await vw.locator('[data-ck="--curve"]').evaluate(i=>{i.value='#ff00aa';i.dispatchEvent(new Event('input',{bubbles:true}));});
 const st=await f.evaluate(()=>{const ls=[...document.querySelectorAll('#canvas polyline[stroke]')].map(p=>getComputedStyle(p).stroke);return{ls,saved:JSON.parse(localStorage.getItem('level7.colors'))};});
 assert(st.ls.includes('rgb(30, 144, 255)')&&st.ls.includes('rgb(255, 0, 170)')&&st.saved['--line']==='#1e90ff',JSON.stringify(st));
 await vw.locator('[data-v="reset-colors"]').click();assert.equal(await f.evaluate(()=>localStorage.getItem('level7.colors')),null);
 pass('View → colours: straight lines blue, curves pink (kept on this computer); «الألوان الأصلية» resets');
 // the size page: the buttons stay above, the table scrolls with header and code / name / base / grading fixed
 await page.keyboard.press('Escape');await f.evaluate(()=>{const a=window.level7,m=a.model;m.measurements=Array.from({length:30},(_,i)=>({id:i+1,name:'m'+i,value:100+i}));m.sizes=Array.from({length:12},(_,k)=>({name:'S'+k,step:k+1,values:{1:1320+k}}));a.changed();});
 await page.locator('[data-l7d-command="tab-sizes"]').click();await fr.locator('#tab-sizes td.mname').first().waitFor();
 const r=await f.evaluate(()=>{const t=document.querySelector('#tab-sizes .size-table'),q=s=>document.querySelector(s).getBoundingClientRect();const a0=q('#tab-sizes .size-top').top,n0=q('#tab-sizes td.mname').left,h0=q('#tab-sizes thead th.mname').top;t.scrollLeft=-400;t.scrollTop=200;
  return{top:q('#tab-sizes .size-top').top-a0,name:q('#tab-sizes td.mname').left-n0,head:q('#tab-sizes thead th.mname').top-h0,digits:document.querySelector('#tab-sizes [data-sv]').value,p:!!document.querySelector('#tab-sizes p.empty')};});
 assert(r.top===0&&Math.abs(r.name)<1&&Math.abs(r.head)<1&&r.digits==='1320'&&!r.p,JSON.stringify(r));
 pass('size page: buttons in one row above, header and code / name / base / grading fixed while scrolling; English digits (1320)');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
