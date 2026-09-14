import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { renderReplayHtml } from '../scripts/prepare-demo-replay.mjs';

test('offline report remains readable on desktop and narrow screens without network or write controls',async t=>{
  const packagePath=process.env.PLAYWRIGHT_PACKAGE_PATH;
  assert.ok(packagePath,'PLAYWRIGHT_PACKAGE_PATH is required for the explicit browser check');
  const {chromium}=await import(pathToFileURL(path.join(packagePath,'index.mjs')).href);
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'replay-layout-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const point={text:'合成布局检查：核对引用与修改理由，原稿独立保留，当前建议仍待确认。'.repeat(3),citations:['SYNTHETIC-REFERENCE-NOT-LIVE']};
  const memo={summary:point,supporting:[point],counter:[point],alternatives:[point],questions:[point,point]};
  const samples=[1,2,3].map(index=>({index,original:{run:{runId:`synthetic-run-${index}`,memo,context:{references:[]}}},proposal:{memo,paragraphs:Array.from({length:6},()=>({disposition:'revise',reason:'合成布局检查，不代表真实模型或人工内容验收。'}))}}));
  const file=path.join(temp,'index.html');await fs.writeFile(file,renderReplayHtml({workflowRun:'SYNTHETIC-NOT-LIVE',samples}));
  const page=await browser.newPage();const network=[],errors=[];
  page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto(pathToFileURL(file).href);
  assert.equal(await page.locator('section').count(),3);assert.equal(await page.locator('article').count(),18);
  assert.equal(await page.locator('button,form,input').count(),0);
  const out=path.resolve('artifacts-demo-layout');await fs.mkdir(out,{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No horizontal overflow at ${width}`);
    assert.ok((await page.locator('header').innerText()).includes('原稿仍需内容修订'));
    await page.screenshot({path:path.join(out,`replay-report-${width}-SYNTHETIC-NOT-LIVE.png`)});
  }
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
});
