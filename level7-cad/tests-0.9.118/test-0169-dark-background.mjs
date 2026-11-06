// 0.9.168: a dark (or light) drawing background turns the line / curve / point colours that would not show
// on it readable, and the labels on the drawing follow it; a user colour that shows well is kept.
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0169-dark-background.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.dismiss());await page.waitForSelector('.l7-design-cat');
 const f=page.frames().find(x=>x.url().includes('l7design'));await f.waitForFunction(()=>!!window.level7);
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
 const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return(x+0.05)/(y+0.05);};
 await f.evaluate(()=>{localStorage.setItem('level7.colors',JSON.stringify({'--line':'#1f2430','--curve':'#888888','--point':'#ff0000'}));window.level7.applyColors();window.level7.openVisibility();});
 const set=v=>f.evaluate(v=>{const i=document.querySelector('.vis-win input[data-ck="--canvas"]');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));},v);
 const state=()=>f.evaluate(()=>{const c=JSON.parse(localStorage.getItem('level7.colors'));const sv=getComputedStyle(document.querySelector('#canvas'));return{c,text:sv.getPropertyValue('--text').trim(),box:document.querySelector('.vis-win input[data-ck="--line"]').value};});
 await set('#000000');let s=await state();
 assert(ratio(s.c['--line'],'#000000')>=3&&ratio(s.c['--curve'],'#000000')>=3&&s.c['--point']==='#ff0000'&&s.box===s.c['--line']&&lum(s.text)>0.5,JSON.stringify(s));
 pass(`black background: dark lines become ${s.c['--line']}, curves ${s.c['--curve']}; the red points stay (they show); labels light; the colour boxes show the new colours`);
 await set('#ffffff');s=await state();
 assert(ratio(s.c['--line'],'#ffffff')>=3&&ratio(s.c['--curve'],'#ffffff')>=3&&lum(s.text)<0.2,JSON.stringify(s));pass('white background: the lines turn dark again, labels dark');
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
