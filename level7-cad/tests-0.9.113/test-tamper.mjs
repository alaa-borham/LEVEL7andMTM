import fs from'node:fs/promises';import{_electron}from'file:///opt/node-tools/node_modules/playwright/index.mjs';
const env={...process.env,L7_UPDATE_MANIFEST_URL:'http://127.0.0.1:8765/latest.json'};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:'/home/user/work/dev/node_modules/electron/dist/electron',args:['--no-sandbox','/home/user/work/updtest/app'],env,timeout:60000});const page=await app.firstWindow();page.setDefaultTimeout(30000);
await page.waitForFunction(()=>{const o=document.querySelector('#local-update-status');return o&&!o.hidden&&o.dataset.state==='error';});
console.log('STATUS',await page.locator('#local-update-status').getAttribute('title'));
await app.evaluate(({app})=>app.quit());await new Promise(r=>setTimeout(r,3000));
const v=JSON.parse(await fs.readFile('/home/user/work/updtest/app/package.json','utf8')).version;console.log(v==='0.9.112'?'PASS tampered update rejected, nothing installed':'FAIL installed '+v);
