import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createQuestionHandler} from '../lib/research-question.server.ts';
import {questionTestConfig,planOutput,answerOutput,providerResponse} from './question-test-helpers.mjs';
import {REVIEW_ACCESS_COOKIE,reviewSessionValue} from '../lib/reviewer-access.ts';
import {QUESTION_STORAGE_KEY} from '../lib/research-question-storage.ts';
import {storageKeys,baselineVersion} from '../lib/research-versions.ts';
import {createMemoRun} from '../lib/research-memo.server.ts';

assert.notEqual(process.env.LIVE_MODEL_E2E,'1','RC acceptance is NOT-LIVE only');
const require=createRequire(import.meta.url);
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE_PATH,'index.mjs')).href);
const artifacts=new URL('../artifacts-web/rc/',import.meta.url);
const origin='http://127.0.0.1:4331';
const memoOutput={summary:{text:'扣非表现较强，但会计定性仍待核对。',citations:['EV-S-05-C04-ADJ','A-03']},supporting:{text:'扣非增长支持进一步核查核心经营改善。',citations:['EV-S-05-C04-ADJ']},counter:{text:'归母利润下滑构成反证，不能忽略。',citations:['EV-S-05-C04-ATTR']},alternatives:{text:'可能存在调整项性质影响利润比较的解释，仍待验证。',citations:['EV-S-05-C04-NR','A-03']},questions:{first:{text:'需要核对调整项经常性。',citations:['A-03']},second:{text:'需要补充连续可比报告。',citations:['K-07']}},gates:{eg01:'pending',eg02:'pending'}};

test('RC task closure, guards, recovery, export and keyboard at 1440 / 768 / 390 (synthetic transport, zero live)',{timeout:240000},async t=>{
 const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','4331','-H','127.0.0.1'],{cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe'],env:{...process.env,DEEPSEEK_API_KEY:'',OPENAI_API_KEY:'',RESEARCH_DEMO_TOKEN:questionTestConfig.accessToken,RESEARCH_APP_ORIGIN:origin,NEXT_TELEMETRY_DISABLED:'1'}});
 let logs='',browser;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);const exited=new Promise(r=>server.once('close',r));
 t.after(async()=>{await browser?.close();server.kill('SIGTERM');await Promise.race([exited,delay(3000)]);if(server.exitCode===null&&server.signalCode===null){server.kill('SIGKILL');await exited;}});
 for(let i=0;i<80;i++){assert.equal(server.exitCode,null,logs);try{if((await fetch(origin)).ok)break;}catch{}await delay(250);}
 browser=await chromium.launch();await mkdir(artifacts,{recursive:true});
 const checks=[],errors=[],externalRequests=[];let syntheticCalls=0,memoCalls=0;
 async function setup(width){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  await context.addCookies([{name:REVIEW_ACCESS_COOKIE,value:await reviewSessionValue(questionTestConfig.accessToken),url:origin,httpOnly:true,secure:false,sameSite:'Strict'}]);
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin===origin)await route.continue();else{externalRequests.push(route.request().url());await route.abort();}});
  const root=await mkdtemp(join(tmpdir(),'beacon-rc-mock-'));
  const handler=createQuestionHandler(()=>({...questionTestConfig,appOrigin:origin}),{runDirectory:root,fetcher:async(_url,init)=>{syntheticCalls++;const body=JSON.parse(init.body);const question=body.input[0]?.content?.[0]?.text??JSON.stringify(body);return providerResponse(body.text.format.name.endsWith('plan')?planOutput(question.includes('范围外')?{intent:'OUT_OF_SCOPE'}:{}):answerOutput());}});
  let pendingMode=null;const posts=[];
  await context.route('**/api/research-question**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==='POST')posts.push({id:request.headers()['idempotency-key'],body:request.postData()});
   if(pendingMode&&(request.method()==='POST'||url.searchParams.has('operationId'))){
    if(pendingMode==='unknown'){await route.abort();return;}
    await route.fulfill({status:pendingMode==='blocked'?409:202,json:{code:pendingMode==='blocked'?'OPERATION_INTERRUPTED':'OPERATION_RUNNING',error:pendingMode==='blocked'?'任务记录需要核对，禁止重发。':'任务仍在处理'}});return;
   }
   const input=new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.method()==='POST'?{body:request.postData()}:{})});
   const response=request.method()==='POST'?await handler.POST(input):await handler.GET(input);
   await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await context.route('**/api/research-memo',async route=>{
   if(route.request().method()==='GET'){await route.fulfill({json:{configured:true,provider:'deepseek',model:'RC-NOT-LIVE'}});return;}
   memoCalls++;const run=await createMemoRun(route.request().postDataJSON(),questionTestConfig,{fetcher:async()=>providerResponse(memoOutput)});await route.fulfill({json:{run}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page,posts,setMode:value=>{pendingMode=value;}};
 }
 const capture=async(page,name)=>page.screenshot({path:new URL(name,artifacts).pathname,fullPage:true,animations:'disabled'});
 const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 async function cancelDialog(page){const dialog=page.getByRole('alertdialog');await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'继续编辑',exact:true}).evaluate(e=>e===document.activeElement),true,'safe action receives initial focus');await page.keyboard.press('Tab');assert.equal(await dialog.getByRole('button',{name:'放弃修改并继续',exact:true}).evaluate(e=>e===document.activeElement),true,'focus order');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');await dialog.waitFor({state:'hidden'});}
 for(const width of [1440,768,390]){
  const {context,page,posts,setMode}=await setup(width);const q=`安克创新2026Q1利润变化核验 ${width}`;
  await page.goto(origin+'/questions');await page.getByLabel('研究问题',{exact:true}).fill(q);
  await page.getByRole('button',{name:'生成研究任务',exact:true}).click();await page.getByRole('button',{name:'确认并执行',exact:true}).click();
  await page.getByRole('heading',{name:'需要补充材料',exact:true}).waitFor();
  const callsBefore=syntheticCalls;assert.equal(posts.length,2);
  const [needExport]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出材料需求',exact:true}).click()]);await needExport.saveAs(new URL(`materials-${width}.md`,artifacts).pathname);
  await page.getByRole('link',{name:'补充材料',exact:true}).click();await page.waitForURL('**/changes?returnTo=*');
  await page.getByRole('button',{name:'载入 S-05 已验证样例',exact:true}).click();
  const original=await page.getByTestId('candidate-attributable_np').getByRole('spinbutton').inputValue();
  await page.getByRole('button',{name:'重新选择材料',exact:true}).click();await cancelDialog(page);assert.equal(await page.getByTestId('candidate-attributable_np').getByRole('spinbutton').inputValue(),original);
  await page.getByRole('combobox',{name:'选择已登记材料'}).click();await page.getByRole('option',{name:'S-06 · 2026H1 · 回归演示',exact:true}).click();await cancelDialog(page);assert.match(await page.getByRole('combobox',{name:'选择已登记材料'}).innerText(),/S-05/);
  await page.getByRole('navigation',{name:'产品导航'}).getByRole('link',{name:/研究提问/}).click();await page.getByRole('alertdialog').waitFor();await capture(page,`update-discard-${width}.png`);await cancelDialog(page);assert.match(page.url(),/changes/);
  await page.getByRole('button',{name:'重新选择材料',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改并继续',exact:true}).click();await page.getByRole('button',{name:'载入 S-05 已验证样例',exact:true}).click();
  for(const key of ['attributable_np','adjusted_np','non_recurring_total'])await page.getByTestId(`candidate-${key}`).getByRole('button',{name:'接受证据',exact:true}).click();
  await page.getByRole('button',{name:'预览研究影响',exact:true}).click();await page.getByLabel('证据审核人（自行填写）').fill('RC synthetic evidence reviewer');await page.getByRole('button',{name:'保存为新版本',exact:true}).click();
  await page.getByRole('heading',{name:/V-02 已保存/}).waitFor();await capture(page,`material-saved-${width}.png`);await noOverflow(page);
  await page.getByRole('link',{name:'返回并继续研究',exact:true}).click();await page.waitForURL('**/questions?resume=materials');await page.getByRole('button',{name:'确认并执行',exact:true}).waitFor();assert.equal(await page.getByLabel('研究问题',{exact:true}).inputValue(),q);assert.equal(syntheticCalls,callsBefore,'return makes no model call');
  await page.getByRole('button',{name:'确认并执行',exact:true}).click();await page.getByRole('heading',{name:'研究草稿待审核',exact:true}).waitFor();
  const runId=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).runs.at(-1).runId,QUESTION_STORAGE_KEY);
  assert.ok((await page.getByTestId('review-context').innerText()).includes(runId));assert.ok((await page.getByTestId('review-context').innerText()).includes(q));
  await page.getByLabel('问题审核人',{exact:true}).fill('unfinished reviewer');await page.getByLabel('问题审核意见',{exact:true}).fill('unfinished review');
  const history=page.locator('button[aria-current]').locator('..');const first=history.getByRole('button').last();
  await first.click();await cancelDialog(page);assert.equal(await page.getByLabel('问题审核意见',{exact:true}).inputValue(),'unfinished review');
  await first.click();await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改并继续',exact:true}).click();await page.getByRole('heading',{name:'待确认研究任务',exact:true}).waitFor();
  await history.getByRole('button').first().click();await page.getByTestId('question-review').waitFor();assert.equal(await page.getByLabel('问题审核人',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('问题审核意见',{exact:true}).inputValue(),'');
  await capture(page,`question-result-${width}.png`);await noOverflow(page);assert.equal(await page.getByRole('navigation',{name:'研究结果章节'}).count(),1);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出待审核研究草稿',exact:true}).click()]);await download.saveAs(new URL(`draft-${width}.md`,artifacts).pathname);
  // Forced discard confirmation in the human memo editor, including parent version switches.
  await page.goto(origin+'/versions');await page.getByRole('button',{name:'生成 AI 备忘录',exact:true}).click();await page.getByRole('button',{name:'创建人工修订稿',exact:true}).click();
  const editor=page.getByTestId('memo-revision-editor');await editor.getByLabel('摘要正文',{exact:true}).fill('未保存的修改，仍待专业复核。');
  await page.getByRole('button',{name:'放弃未保存修改',exact:true}).click();await cancelDialog(page);assert.equal(await editor.getByLabel('摘要正文',{exact:true}).inputValue(),'未保存的修改，仍待专业复核。');
  await page.getByRole('button').filter({hasText:'V-01'}).click();await cancelDialog(page);assert.ok(await editor.isVisible());
  await page.getByRole('navigation',{name:'产品导航'}).getByRole('link',{name:/研究提问/}).click();await page.getByRole('alertdialog').waitFor();await capture(page,`revision-discard-${width}.png`);await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改并继续',exact:true}).click();await page.waitForURL('**/questions');
  // Pending: 202 has one recommendation; unknown transport allows confirmed same-ID resend only.
  setMode('waiting');await page.getByRole('button',{name:'生成研究任务',exact:true}).click();const pending=page.getByTestId('pending-request');await pending.getByRole('button',{name:'检查任务状态',exact:true}).waitFor();
  assert.equal(await pending.getByRole('button').count(),1);assert.equal(await pending.getByRole('button',{name:'重发同一请求（幂等）'}).count(),0);
  await pending.getByText('其他处理方式与费用说明',{exact:true}).click();await pending.getByRole('button',{name:'结束等待',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'继续等待',exact:true}).click();assert.ok(await pending.isVisible());
  await pending.getByRole('button',{name:'结束等待',exact:true}).click();await capture(page,`pending-end-${width}.png`);await page.getByRole('alertdialog').getByRole('button',{name:'保留标识并结束等待',exact:true}).click();await pending.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('beacon-question-unresolved-v1')).length),1);assert.deepEqual(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('beacon-question-unresolved-v1'))[0]).sort()),['endedAt','id','phase']);
  setMode('unknown');await page.getByRole('button',{name:'生成研究任务',exact:true}).click();await pending.getByRole('button',{name:'检查任务状态',exact:true}).waitFor();await pending.getByText('其他处理方式与费用说明',{exact:true}).click();const beforePosts=posts.length;
  await pending.getByRole('button',{name:'重发同一请求（幂等）',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'返回检查状态',exact:true}).click();assert.equal(posts.length,beforePosts);
  await pending.getByRole('button',{name:'重发同一请求（幂等）',exact:true}).click();setMode('waiting');await page.getByRole('alertdialog').getByRole('button',{name:'确认重发同一请求',exact:true}).click();await pending.getByRole('button',{name:'检查任务状态',exact:true}).waitFor();assert.deepEqual(posts.at(-1),posts.at(-2),'resend preserves exact ID/body');
  setMode('blocked');await pending.getByRole('button',{name:'检查任务状态',exact:true}).click();await page.getByText('任务记录需要核对，禁止重发。',{exact:true}).waitFor();assert.equal(await pending.getByRole('button',{name:'重发同一请求（幂等）'}).count(),0);assert.equal(await page.getByRole('button',{name:'生成研究任务',exact:true}).isDisabled(),true);await noOverflow(page);
  await capture(page,`pending-blocked-${width}.png`);
  await pending.getByRole('button',{name:'结束等待',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'保留标识并结束等待',exact:true}).click();setMode(null);
  await page.getByLabel('研究问题',{exact:true}).fill('范围外测试');await page.getByRole('button',{name:'生成研究任务',exact:true}).click();await page.getByRole('heading',{name:'超出当前范围',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'导出范围说明',exact:true}).isVisible());
  await page.getByLabel('研究问题',{exact:true}).fill('核验本期利润变化');await page.getByRole('button',{name:'生成研究任务',exact:true}).click();await page.getByRole('button',{name:'确认并执行',exact:true}).waitFor();
  await page.evaluate(keys=>{const v=JSON.parse(localStorage.getItem(keys.versions));v[0].chain.formula.consistent=false;localStorage.setItem(keys.versions,JSON.stringify(v));},storageKeys());await page.getByRole('button',{name:'确认并执行',exact:true}).click();await page.getByRole('heading',{name:'已阻断',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'导出阻断说明',exact:true}).isVisible());
  // The dashboard's blocked state and insufficient state must remain honest on screen.
  await page.goto(origin+'/workspace');await page.getByRole('heading',{name:'当前研究更新已阻断',exact:true}).waitFor();await page.getByText('已阻断，待重审',{exact:true}).waitFor();assert.equal(await page.getByText('F-02 闭合',{exact:true}).count(),0);await capture(page,`dashboard-blocked-${width}.png`);
  await page.evaluate(({keys,baseline})=>{localStorage.setItem(keys.versions,JSON.stringify([baseline]));localStorage.setItem(keys.active,'V-01');window.dispatchEvent(new Event('anker-research-version-updated'));},{keys:storageKeys(),baseline:baselineVersion});await page.getByRole('heading',{name:'当前证据不足，等待核验',exact:true}).waitFor();await noOverflow(page);await capture(page,`dashboard-insufficient-${width}.png`);
  checks.push({width,materialsRoundTrip:true,historyGuard:true,updateGuard:true,revisionGuard:true,pendingStateMachine:true,sameIdResend:true,keyboardFocusOrder:true,noOverflow:true});await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);
 await writeFile(new URL('acceptance.json',artifacts),JSON.stringify({mode:'synthetic/mock-transport-only',realModelCalls:0,externalRequests,syntheticCalls,memoCalls,checks,errors},null,2));
});
