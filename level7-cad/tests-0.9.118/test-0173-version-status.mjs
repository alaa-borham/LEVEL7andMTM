// 0.9.171: the bottom bar shows the installed version («الإصدار 0.9.x · التحديثات · …»).
// Usage: L7_SRC=<app dir> xvfb-run -a node test-0173-version-status.mjs
import path from'node:path';import fs from'node:fs/promises';import os from'node:os';import assert from'node:assert/strict';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const src=process.env.L7_SRC;const env={...process.env,LOCALAPPDATA:await fs.mkdtemp(path.join(os.tmpdir(),'ec-'))};delete env.ELECTRON_RUN_AS_NODE;
const pass=t=>console.log('PASS '+t);let failed=0,app;
try{
 const ver=JSON.parse(await fs.readFile(src+'/package.json','utf8')).version;
 app=await _electron.launch({executablePath:src+'/node_modules/electron/dist/electron',args:['--no-sandbox',src],env});const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.waitForSelector('.l7-design-cat');
 await page.waitForFunction(v=>(document.querySelector('#local-update-status')?.textContent||'').includes('الإصدار '+v),ver);
 const t=await page.locator('#local-update-status').textContent();assert(await page.locator('#local-update-status').isVisible());
 pass(`bottom bar: «${t}»`);
}catch(e){failed=1;console.error(e);}
await app?.close().catch(()=>{});process.exit(failed);
