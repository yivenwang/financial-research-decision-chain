import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {controlledQuestionPoints,explanationPolicyFor,questionAnswerState} from '../lib/question-explanation-contract.ts';
import {makeResearchContract,resolveQuestionEvidence,questionExplanationSchema,validateQuestionOutput,questionPromptInstructions,QUESTION_ANSWER_PROMPT_VERSION} from '../lib/research-question.ts';
import {validateQuestionRun} from '../lib/research-question-storage.ts';
import {canonicalJson,sha256Text} from '../lib/research-memo.ts';
import {createQuestionHandler} from '../lib/research-question.server.ts';
import {questionTestSnapshot,questionTestConfig,questionRequest,planOutput,providerResponse,schemaAnswerOutput} from './question-test-helpers.mjs';
import {QUESTION_LIVE_CASES,runBoundedQuestionBatch,assertArchiveSafe,verifyLiveQuestionPhase} from '../scripts/run-question-batch.mjs';
import {checkQuestionInputBudget,QUESTION_BUDGET_VERSION} from '../lib/question-batch-budget.ts';

assert.notEqual(process.env.LIVE_MODEL_E2E,'1');
const snapshot=questionTestSnapshot();
const contractFor=spec=>makeResearchContract(spec.question,planOutput({intent:spec.intent}),crypto.randomUUID(),new Date().toISOString());
const resolved=await resolveQuestionEvidence(contractFor(QUESTION_LIVE_CASES[0]),snapshot);assert.equal(resolved.status,'READY');
const context=resolved.evidence.context;
const wireFor=(context,contract)=>({sufficiency:questionExplanationSchema(context,contract).properties.sufficiency.enum[0],
  ...Object.fromEntries(Object.entries(controlledQuestionPoints(context,contract)).map(([key,definition])=>[key,{text:definition.texts[0],citations:[definition.citationGroup]}]))});

test('all three intents and every approved paragraph combination share the exact schema, dependencies and raw text',()=>{
  for(const spec of QUESTION_LIVE_CASES){
    const contract=contractFor(spec),schema=questionExplanationSchema(context,contract),definitions=controlledQuestionPoints(context,contract);
    for(const directAnswer of definitions.directAnswer.texts)for(const inference of definitions.inference.texts){
      const raw=wireFor(context,contract);raw.directAnswer.text=directAnswer;raw.inference.text=inference;
      const before=canonicalJson(raw),answer=validateQuestionOutput(raw,context,undefined,contract);
      assert.equal(canonicalJson(raw),before);
      for(const key of Object.keys(definitions)){
        assert.deepEqual(schema.properties[key].properties.text.enum,definitions[key].texts);
        assert.deepEqual(schema.properties[key].properties.citations.items.enum,[definitions[key].citationGroup]);
        assert.equal(answer[key].text,raw[key].text);assert.deepEqual(answer[key].citations,raw[key].citations[0].split('|'));
        assert.ok(answer[key].citations.every(id=>context.references.some(r=>r.id===id)));
      }
      assert.ok(answer.counterEvidence.citations.some(id=>context.references.find(r=>r.id===id)?.direction==='反证'));
      assert.ok(answer.uncertainty.citations.includes('A-03'));
    }
    assert.ok(schema.properties.directAnswer.properties.text.enum[0].includes(spec.intent==='EVIDENCE_AUDIT'?'逐项追溯':spec.intent==='DECISION_IMPACT'?'冻结引擎':'扣非同比上升'));
  }
});

test('whitespace and equivalent punctuation do not stop the workflow or rewrite raw/stored prose',()=>{
  const contract=contractFor(QUESTION_LIVE_CASES[0]),raw=wireFor(context,contract);
  for(const key of ['directAnswer','inference','counterEvidence','uncertainty'])raw[key].text='  '+raw[key].text.replaceAll('，',',').replaceAll('；',';').replace(/。$/,'.')+'\n';
  const before=canonicalJson(raw),answer=validateQuestionOutput(raw,context,undefined,contract);
  assert.equal(canonicalJson(raw),before);for(const key of ['directAnswer','inference','counterEvidence','uncertainty'])assert.equal(answer[key].text,raw[key].text);
});

test('a small edit cannot change a financial assertion, condition, citation or professional boundary',()=>{
  const contract=contractFor(QUESTION_LIVE_CASES[0]);
  for(const text of ['归母同比下降来自负向调整。','扣非代表核心经营。','增速差扩大。','会计复核已通过。','机械年化就是盈利预测。','两个税前项目差额来自所得税。','报告没有解释。','建议买入。','利润增加１％。']){
    const raw=wireFor(context,contract);raw.inference.text=text;const before=canonicalJson(raw);
    assert.throws(()=>validateQuestionOutput(raw,context,undefined,contract));assert.equal(canonicalJson(raw),before);
  }
  const raw=wireFor(context,contract);raw.inference.text=raw.inference.text.replace('不依赖','依赖');
  assert.throws(()=>validateQuestionOutput(raw,context,undefined,contract),/ANSWER_CONTRACT_MISMATCH/);
  const missing=wireFor(context,contract);missing.counterEvidence.citations=['A-03'];
  assert.throws(()=>validateQuestionOutput(missing,context,undefined,contract),/PARAGRAPH_EVIDENCE_OMITTED/);
});

test('the catalog follows reverse directions, absent counter, actual comparison availability and bounded evidence',()=>{
  const contract=contractFor(QUESTION_LIVE_CASES[0]);
  const reverse=structuredClone(context);reverse.references.find(r=>r.id.endsWith('-ADJ')).direction='反证';
  const choices=controlledQuestionPoints(reverse,contract);assert.match(choices.directAnswer.texts[0],/扣非同比下降/);assert.doesNotMatch(choices.directAnswer.texts[0],/扣非同比上升/);
  const absent=structuredClone(context);absent.references.forEach(r=>{if(r.direction==='反证')r.direction='中性';});
  assert.match(controlledQuestionPoints(absent,contract).counterEvidence.texts[0],/没有标为反证/);
  const comparison=structuredClone(context);comparison.references.find(r=>r.id.endsWith('-NR')).excerpt='Controlled comparison is supplied';
  assert.doesNotMatch(controlledQuestionPoints(comparison,contract).uncertainty.texts[0],/缺少上年/);
  const missing=structuredClone(context);missing.references=missing.references.filter(r=>r.id!=='F-02');
  assert.throws(()=>controlledQuestionPoints(missing,contract),/ANSWER_CONTROLLED_EVIDENCE_MISSING/);
  for(const [status,word] of [['不认可','不认可'],['限定范围认可','记录范围'],['限定认可','记录范围'],['资料不足','资料不足']]){
    const review=structuredClone(context);review.references.find(r=>r.id==='A-03').excerpt='状态：'+status+'。';
    const statements=controlledQuestionPoints(review,contract).inference.texts;
    assert.equal(statements.length,1);assert.ok(statements[0].includes(word));assert.doesNotMatch(statements[0],/专业.*已通过/);
    assert.doesNotThrow(()=>validateQuestionOutput(wireFor(review,contract),review,undefined,contract));
  }
});

test('version capabilities, exact old prompts and original first failures remain immutable',async()=>{
  for(let v=1;v<=11;v++){
    const p=explanationPolicyFor('question-explanation.v'+v);
    assert.equal(p.controlled,v===11);assert.equal(p.premiseScope,v>=10);assert.equal(p.financialBoundaries,v>=9);assert.equal(p.groups,v>=6);
  }
  assert.throws(()=>explanationPolicyFor('question-explanation.v12'),/UNSUPPORTED/);
  assert.deepEqual(questionAnswerState('partial'),{status:'PARTIAL',answerStatus:'PARTIAL'});
  assert.deepEqual(questionAnswerState('complete'),{status:'ANSWER_READY',answerStatus:'PASS'});
  assert.equal(questionPromptInstructions('question-explanation.v10'),questionPromptInstructions('question-explanation.v9'));
  for(const id of ['38381793600','38390408233','38501083398']){
    const record=JSON.parse(readFileSync(new URL('./fixtures/question-live-'+id+'/request-02.json',import.meta.url),'utf8')),run=record.record.run;
    const before=canonicalJson(run);await validateQuestionRun(run);assert.equal(canonicalJson(run),before);
    assert.equal(run.status,'BLOCKED');assert.equal(run.answer,null);
    const snapshot=run.events.find(e=>e.event==='snapshot_supplied').details,resolved=await resolveQuestionEvidence(run.contract,snapshot);
    assert.equal(resolved.status,'READY');assert.throws(()=>validateQuestionOutput(JSON.parse(run.calls[0].rawOutput),resolved.evidence.context,undefined,run.contract));
    assert.equal(await sha256Text(questionPromptInstructions(run.calls[0].promptVersion)),run.calls[0].promptSha256);
  }
});

test('six synthetic phases fit the existing budget, replay exact bindings and never interpret review as professional acceptance',async t=>{
  const before=process.env.QUESTION_ACCEPTANCE_BUDGET_MODE;process.env.QUESTION_ACCEPTANCE_BUDGET_MODE=QUESTION_BUDGET_VERSION;
  t.after(()=>{if(before===undefined)delete process.env.QUESTION_ACCEPTANCE_BUDGET_MODE;else process.env.QUESTION_ACCEPTANCE_BUDGET_MODE=before;});
  let calls=0;const receipts=[];
  const result=await runBoundedQuestionBatch({commitSha:'0'.repeat(40),persist:async()=>{},archive:async(_i,data)=>assertArchiveSafe(data,[]),
    executePhase:async({spec,phase,draft})=>{
      const handler=createQuestionHandler(()=>questionTestConfig,{fetcher:async(_url,init)=>{
        calls++;const body=JSON.parse(init.body);receipts.push({...checkQuestionInputBudget(init.body),intent:spec.intent,phase});
        return providerResponse(phase==='plan'?planOutput({intent:spec.intent}):schemaAnswerOutput(body));
      }});
      const body=phase==='plan'?{phase,question:spec.question}:{phase,draft,confirmed:true,snapshot};
      const response=await handler.POST(questionRequest(body)),data=await response.json();await validateQuestionRun(data.run);
      const audit=await verifyLiveQuestionPhase({spec,phase,response:{httpStatus:response.status,data},snapshot,draft});
      if(phase==='execute'){
        assert.equal(audit.promptVersion,QUESTION_ANSWER_PROMPT_VERSION);assert.equal(data.run.answer.verification.professional,'pending');assert.equal(data.run.answer.formalRecommendation,null);
        assert.deepEqual(await(await handler.POST(questionRequest(body))).json(),data);
      }
      return {ok:true,data,audit,record:{run:data.run}};
    }});
  assert.equal(calls,6);assert.equal(result.status,'technical-completed-awaiting-content-review');assert.equal(result.contentReview,'pending');
  t.diagnostic(JSON.stringify({transport:'synthetic-NOT-LIVE',realModelCalls:0,receipts}));
});

test('an unexpected provider statement stops the batch at two mock calls, retaining raw output and no rebilling',async()=>{
  let calls=0,failure,body;
  const handler=createQuestionHandler(()=>questionTestConfig,{fetcher:async(_url,init)=>{
    calls++;const request=JSON.parse(init.body);
    if(request.text.format.name.endsWith('plan'))return providerResponse(planOutput());
    const answer=schemaAnswerOutput(request);answer.inference.text='归母下降来自负向调整。';
    return providerResponse(answer);
  }});
  const result=await runBoundedQuestionBatch({commitSha:'0'.repeat(40),persist:async()=>{},archive:async(_i,data)=>assertArchiveSafe(data,[]),executePhase:async({spec,phase,draft})=>{
    body=phase==='plan'?{phase,question:spec.question}:{phase,draft,confirmed:true,snapshot};
    const data=await(await handler.POST(questionRequest(body))).json();
    if(data.run.status==='BLOCKED')failure=data;
    return {ok:data.run.status!=='BLOCKED',data,failureCode:data.run.reasons[0],audit:data.run.calls[0],record:{run:data.run}};
  }});
  assert.equal(calls,2);assert.equal(result.requests.length,2);assert.equal(result.status,'stopped-after-failure');
  assert.equal(failure.run.answer,null);assert.deepEqual(failure.run.reasons,['ANSWER_CONTRACT_MISMATCH']);
  assert.equal(JSON.parse(failure.run.calls[0].rawOutput).inference.text,'归母下降来自负向调整。');
  assert.deepEqual(await(await handler.POST(questionRequest(body))).json(),failure);assert.equal(calls,2);
});
