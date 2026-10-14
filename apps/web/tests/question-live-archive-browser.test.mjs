import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { QUESTION_STORAGE_KEY, validateQuestionRun } from '../lib/research-question-storage.ts';
import { storageKeys } from '../lib/research-versions.ts';
import { REVIEW_ACCESS_COOKIE, reviewSessionValue } from '../lib/reviewer-access.ts';
import { canonicalJson, sha256Text } from '../lib/research-memo.ts';
import { assertArchiveSafe } from '../scripts/run-question-batch.mjs';
import { questionTestConfig } from './question-test-helpers.mjs';

assert.notEqual(process.env.LIVE_MODEL_E2E,'1');
const require=createRequire(import.meta.url);
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE_PATH,'index.mjs')));
const artifacts=new URL('../artifacts-web/question-live-v9-archive/',import.meta.url);
const fixture=new URL('./fixtures/question-live-38501083398/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',fixture),'utf8'));
const runs=[];
for(const item of manifest.requests){
  const record=JSON.parse(await readFile(new URL(`request-${String(item.index).padStart(2,'0')}.json`,fixture),'utf8'));
  assertArchiveSafe(record,[]);await validateQuestionRun(record.record.run);runs.push(record.record.run);
}
const snapshot=runs[1].events.find(e=>e.event==='snapshot_supplied').details;

test('actual v9 blocked records replay, refresh and export unchanged at four widths without generation or fabricated review',{timeout:90000},async t=>{
  const origin='http://127.0.0.1:4346';
  const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','4346','-H','127.0.0.1'],{
    cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe'],
    env:{...process.env,DEEPSEEK_API_KEY:'',OPENAI_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1',RESEARCH_DEMO_TOKEN:questionTestConfig.accessToken,RESEARCH_APP_ORIGIN:origin},
  });
  let logs='',browser;const exited=new Promise(r=>server.once('close',r));
  server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
  t.after(async()=>{await browser?.close();server.kill('SIGTERM');await Promise.race([exited,delay(3000)]);if(server.exitCode===null&&server.signalCode===null){server.kill('SIGKILL');await exited;}});
  for(let i=0;i<80;i++){assert.equal(server.exitCode,null,logs);try{if((await fetch(origin)).ok)break;}catch{}await delay(250);}
  browser=await chromium.launch();await mkdir(artifacts,{recursive:true});
  const checks=[],errors=[],modelRequests=[],configurationReads=[],externalRequests=[],original=runs.map(r=>canonicalJson(r));
  for(const width of [1440,1366,768,390]){
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    await context.addCookies([{name:REVIEW_ACCESS_COOKIE,value:await reviewSessionValue(questionTestConfig.accessToken),url:origin,httpOnly:true,sameSite:'Strict'}]);
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname==='/api/research-question'&&request.method()==='GET'&&!url.searchParams.has('operationId')){
        configurationReads.push('GET '+url.pathname);
        await route.fulfill({contentType:'application/json',body:JSON.stringify({configured:false,provider:'deepseek',model:'deepseek-v4-pro'})});
      }else if(url.pathname.startsWith('/api/research-question')||url.pathname.startsWith('/api/research-memo')){
        modelRequests.push(request.method()+' '+url.pathname);await route.abort();
      }else if(url.origin!==origin){externalRequests.push(url.origin);await route.abort();}else await route.continue();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/questions');
    await page.evaluate(({runs,key,keys,snapshot})=>{
      localStorage.setItem(key,JSON.stringify({runs,reviews:[]}));localStorage.setItem(keys.versions,JSON.stringify([snapshot]));localStorage.setItem(keys.active,snapshot.versionId);
    },{runs,key:QUESTION_STORAGE_KEY,keys:storageKeys(),snapshot});
    await page.reload();
    for(const [i,run] of runs.entries()){
      await page.locator('button[aria-current]').locator('..').getByRole('button').nth(runs.length-1-i).click();
      await page.getByTestId('question-result').waitFor();
      if(run.calls[0].promptVersion==='question-explanation.v9')await page.getByTestId('historical-validation-notice').waitFor();
      assert.ok((await page.getByTestId('question-result').innerText()).includes(run.queryRaw));
      assert.equal(run.answer,null);assert.equal(await page.getByRole('button',{name:'接受研究草稿',exact:true}).count(),0);
      const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出完整记录',exact:true}).click()]);
      const file=new URL(`original-${width}-${i+1}.json`,artifacts);await download.saveAs(file.pathname);
      const exported=JSON.parse(await readFile(file,'utf8'));assert.equal(canonicalJson(exported.run),original[i]);assert.deepEqual(exported.reviews,[]);
    }
    const ledger=await page.evaluate(key=>localStorage.getItem(key),QUESTION_STORAGE_KEY);await page.reload();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),QUESTION_STORAGE_KEY),ledger);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:new URL(`actual-records-${width}.png`,artifacts).pathname,fullPage:true,animations:'disabled'});
    const saved=JSON.parse(ledger);assert.deepEqual(saved.runs.map(r=>canonicalJson(r)),original);assert.deepEqual(saved.reviews,[]);
    checks.push({width,originalRuns:runs.length,bytesPreserved:true,refreshPreserved:true,completeOriginalExport:true,noHorizontalOverflow:true,reviewBinding:'not-applicable-no-accepted-answer',simulatedReviews:0});await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(modelRequests,[]);assert.deepEqual(externalRequests,[]);
  await writeFile(new URL('acceptance.json',artifacts),JSON.stringify({sourceRun:'38501083398',sourceCommit:manifest.commitSha,evaluation:'actual-records-offline-replay-NOT-new-model-acceptance',realModelCalls:0,modelRequests,configurationReads,externalRequests,errors,checks,originalRunHashes:await Promise.all(runs.map(r=>sha256Text(canonicalJson(r))))},null,2));
});
