// 0.9.114: the right tool panel must fit the window without a scrollbar for every tool group.
// Usage: L7_SRC=<app dir> L7_MDL=<copy of an .mdl> xvfb-run -a node test-0114-panel-fit.mjs
import path from'node:path';import fs from'node:fs/promises';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC,qa=await fs.mkdtemp(path.join((await import('node:os')).tmpdir(),'l7fit-'));const env={...process.env,LOCALAPPDATA:path.join(qa,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:path.join(src,'node_modules/electron/dist/electron'),args:['--no-sandbox',src],env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForSelector('#tool-guide');
await app.evaluate(({dialog},f)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[f]});},process.env.L7_MDL);
const m=async l=>{const r=await page.locator('aside.command-panel').first().evaluate(e=>({sh:e.scrollHeight,ch:e.clientHeight}));console.log(l,r.sh,r.ch,r.sh>r.ch+1?'SCROLL':'fits');if(r.sh>r.ch+1)process.exitCode=1;};
for(const [w,h] of JSON.parse(process.env.SIZES||'[[1440,900],[1366,768],[1280,720],[1920,1080]]')){await page.setViewportSize({width:w,height:h});await page.waitForTimeout(300);
 if(!globalThis.__opened){globalThis.__opened=1;await page.locator('#cad-toolbox [data-action="open"]').click();await page.waitForTimeout(3000);}
 console.log('url',page.url(),await page.locator('aside').count(),app.windows().length);await m(`${w}x${h} groups`);
 const all=await page.locator('[data-tool-category]').evaluateAll(b=>b.map(x=>x.dataset.toolCategory));for(const g of all){await page.locator(`[data-tool-category="${g}"]`).click();await page.waitForTimeout(250);await m(`${w}x${h} ${g}`);;await page.locator('#tool-category-back').click();await page.waitForTimeout(200);}
}
await app.close();
