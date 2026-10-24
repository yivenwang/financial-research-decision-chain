import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalJson, sha256Text } from '../lib/research-memo.ts';
import { validateQuestionOutput, validateQuestionExplanation as validateV10Explanation, questionPromptInstructions, resolveQuestionEvidence } from '../lib/research-question.ts';
import { validateQuestionRun } from '../lib/research-question-storage.ts';
import { createQuestionHandler } from '../lib/research-question.server.ts';
import { answerOutput, questionTestConfig, questionRequest, providerResponse, planOutput } from './question-test-helpers.mjs';
import { assertArchiveSafe, runBoundedQuestionBatch } from '../scripts/run-question-batch.mjs';

// Preserve historical free-prose semantics; current v11 has its own closed-contract regressions.
const validateQuestionExplanation=(value,context,version="question-explanation.v10",contract)=>validateV10Explanation(value,context,version,contract);


assert.notEqual(process.env.LIVE_MODEL_E2E,'1');
const files=['manifest.json','request-01.json','request-02.json'].map(name=>readFileSync(new URL('./fixtures/question-live-38501083398/'+name,import.meta.url),'utf8'));
const manifest=JSON.parse(files[0]),record=JSON.parse(files[2]),run=record.record.run;
const snapshot=run.events.find(e=>e.event==='snapshot_supplied').details;
const resolved=await resolveQuestionEvidence(run.contract,snapshot);assert.equal(resolved.status,'READY');
const context=resolved.evidence.context,original=JSON.parse(run.calls[0].rawOutput);

test('actual v9 first failure, original hashes and two-request stop remain immutable',async()=>{
  const hashes=['23eee449f34c7fc2890a2da3706ae5349e978e486edc759010affb456f1cfbe4',
    'e83f3d6486e41dee212a5cf4a3d7da465be6946d43cf5d449fff04cec8109067',
    'bbea9f711e3411738cee3702f707a097c37ada0cfc0ed1f569df7824a0f5513b'];
  for(const [i,file] of files.entries())assert.equal(await sha256Text(file),hashes[i]);
  assert.equal(manifest.commitSha,'b30d7e49ebe1baa3e559c1267076a654938d2e74');
  assert.equal(manifest.requests.length,2);assert.equal(manifest.status,'stopped-after-failure');
  assert.equal(manifest.knownInputTokens,4624);assert.equal(manifest.knownOutputTokens,4207);
  assert.equal(manifest.requestsWithoutUsage,0);assert.equal(manifest.estimatedKnownUsageUsdMicros,22764);
  assert.equal(run.status,'BLOCKED');assert.equal(run.answer,null);
  assert.equal(await sha256Text(questionPromptInstructions('question-explanation.v9')),run.calls[0].promptSha256);
  const before=canonicalJson(run);await validateQuestionRun(run);assert.equal(canonicalJson(run),before);
  assert.throws(()=>validateQuestionOutput(original,context,'question-explanation.v9',run.contract),/ASSUMPTION_PROMOTED/);
  assertArchiveSafe(record,[]);assertArchiveSafe(manifest,[]);
});

test('v10 replay preserves the original response, stops the mock batch at the independent content defect and never resends',async()=>{
  let calls=0,executeBody,failure;
  const handler=createQuestionHandler(()=>questionTestConfig,{fetcher:async(_url,init)=>{
    calls++;
    return JSON.parse(init.body).text.format.name.endsWith('plan') ? providerResponse(planOutput()) :
      providerResponse({}, {output:[{type:'message',content:[{type:'output_text',text:run.calls[0].rawOutput}]}]});
  }});
  const result=await runBoundedQuestionBatch({commitSha:'0'.repeat(40),persist:async()=>{},archive:async(_i,data)=>assertArchiveSafe(data,[]),
    executePhase:async({spec,phase,draft})=>{
      const body=phase==='plan'?{phase,question:spec.question}:{phase,draft,confirmed:true,snapshot};
      if(phase==='execute')executeBody=body;
      const data=await(await handler.POST(questionRequest(body))).json();
      if(data.run.status==='BLOCKED')failure=data;
      return {ok:data.run.status!=='BLOCKED',failureCode:data.run.reasons[0],data,audit:data.run.calls[0],record:{run:data.run}};
    }});
  assert.equal(calls,2);assert.equal(result.requests.length,2);assert.equal(result.status,'stopped-after-failure');
  assert.equal(result.requests[1].failureCode,'ANSWER_CONTRACT_MISMATCH');
  assert.equal(failure.run.answer,null);assert.equal(failure.run.calls[0].rawOutput,run.calls[0].rawOutput);
  assert.deepEqual(await(await handler.POST(questionRequest(executeBody))).json(),failure);assert.equal(calls,2);
});

test('explicit leading conditions govern a proxy hypothesis across commas without changing source text',()=>{
  for(const text of [
    original.inference.text,
    '在调整分类和持续性已经核验的条件下，扣非可视为核心经营代理。',
    '如果调整分类经核验，扣非可视为核心经营代理。',
    '若调整分类经核验，则扣非可视为核心经营代理。',
  ]){
    const answer=answerOutput({sufficiency:'partial'});answer.inference={text,citations:['A-03','EV-S-05-C04-ADJ','EV-S-05-C04-ATTR','EV-S-05-C04-NR','F-02']};
    const before=canonicalJson(answer);
    assert.doesNotThrow(()=>validateQuestionExplanation(answer,context,undefined,run.contract));
    assert.equal(canonicalJson(answer),before);
  }
  assert.equal(questionPromptInstructions('question-explanation.v10'),questionPromptInstructions('question-explanation.v9'),'no new prompt accumulation or judgement change');
});

test('a premise is not permission for independent unsupported claims or a later unconditional hypothesis',()=>{
  for(const [text,code] of [
    ['在分类经核验的前提下，归母同比下降来自本期负向调整。','UNSUPPORTED_YOY_ATTRIBUTION'],
    ['若分类经核验，则归母下降受负向调整拖累。','UNSUPPORTED_YOY_ATTRIBUTION'],
    ['在分类经核验的条件下，增速差扩大。','UNSUPPORTED_SPREAD_TREND'],
    ['在分类经核验的前提下，可能需要研究；扣非代表核心经营。','ASSUMPTION_PROMOTED'],
    ['在分类经核验的前提下，可能需要研究，但扣非代表核心经营。','ASSUMPTION_PROMOTED'],
  ]){
    const answer=answerOutput({sufficiency:'partial'});answer.inference={text,citations:['A-03','EV-S-05-C04-ADJ','EV-S-05-C04-ATTR','EV-S-05-C04-NR','EV-S-05-C04-SPREAD','F-02']};
    assert.throws(()=>validateQuestionExplanation(answer,context,undefined,run.contract),new RegExp(code));
  }
});

test('the original counter conditions a verified fact on a proxy; scope repair never repairs the archived output into success',()=>{
  const before=canonicalJson(original);
  assert.throws(()=>validateQuestionOutput(original,context,'question-explanation.v10',run.contract),/VERIFIED_FACT_CONDITIONED_ON_ASSUMPTION/);
  assert.equal(canonicalJson(original),before);
  const answer=answerOutput({sufficiency:'partial'});
  answer.counterEvidence.text='归母同比下降仍是反向事实；扣非同比为正是独立披露事实，不依赖核心经营假设。';
  assert.doesNotThrow(()=>validateQuestionExplanation(answer,context,undefined,run.contract));
  answer.counterEvidence.text='归母同比下降仍是反向事实；扣非同比为正，该事实不依赖核心经营假设成立。';
  assert.doesNotThrow(()=>validateQuestionExplanation(answer,context,undefined,run.contract));
  answer.inference.text='扣非同比上升是事实；若分类和持续性经复核，则可能改善核心经营，该判断仍以会计假设为条件。';
  assert.doesNotThrow(()=>validateQuestionExplanation(answer,context,undefined,run.contract),'a separately stated economic hypothesis retains its own condition');
});

// Synthetic pairs exercise historical v10 semantics directly. Current v11
// rejects free prose at the controlled contract before these semantic checks.
function assertSemanticExamples(point, examples) {
  const contextBefore=canonicalJson(context);
  for(const [text,code] of examples) {
    const answer=answerOutput({sufficiency:'partial'});
    answer[point]={text,citations:context.references.map(ref=>ref.id)};
    const before=canonicalJson(answer);
    const validate=()=>validateQuestionExplanation(answer,context,'question-explanation.v10',run.contract);
    if(code) assert.throws(validate,{message:code},text);
    else assert.doesNotThrow(validate,text);
    assert.equal(canonicalJson(answer),before);
  }
  assert.equal(canonicalJson(context),contextBefore);
}

test('semantic assets: a comma retains the premise while sentence and contrast boundaries end it',()=>{
  const premise='在调整分类和持续性经核验的前提下';
  assertSemanticExamples('inference',[
    [premise+'，扣非可视为核心经营代理，仍须复核适用范围。'],
    [premise+',扣非可视为核心经营代理,仍须复核适用范围。'],
    ...['。','；','！','？','\n','，但是','，然而','，不过','，可是','，但','，却'].map(boundary=>[
      premise+'，可能需要研究'+boundary+'扣非代表核心经营。','ASSUMPTION_PROMOTED',
    ]),
  ]);
});

test('semantic assets: a bounded annualization statement passes while a forecast or target promotion fails',()=>{
  assertSemanticExamples('directAnswer',[
    ['机械年化不是盈利预测，估值仍待复核。'],
    ['机械年化不等于全年预测，估值仍待复核。'],
    ['机械年化不得作为目标价，估值仍待复核。'],
    ['机械年化就是盈利预测。','MECHANICAL_ANNUALIZATION_PROMOTED'],
    ['机械年化即为全年预测。','MECHANICAL_ANNUALIZATION_PROMOTED'],
    ['机械年化可作为目标价。','MECHANICAL_ANNUALIZATION_PROMOTED'],
    ['不能忽略风险，但机械年化就是盈利预测。','MECHANICAL_ANNUALIZATION_PROMOTED'],
  ]);
});

test('semantic assets: missing input and disclosed growth do not establish full-report absence or core economics',()=>{
  assertSemanticExamples('directAnswer',[
    ['本次结构化输入未提供非经常性损益比较值，不能断言报告未披露。'],
    ['本次受控输入缺少明细，不能推定报告没有解释。'],
    ['报告披露扣非同比增长，核心经营解释仍是假设。'],
    ['本次输入缺少明细，但报告没有解释。','DISCLOSURE_SCOPE_OVERCLAIM'],
    ['本次输入缺少比较材料，但报告未披露比较信息。','DISCLOSURE_SCOPE_OVERCLAIM'],
    ['报告披露扣非同比增长，已证实核心经营改善。','ASSUMPTION_PROMOTED'],
  ]);
});
