import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalJson, sha256Text } from '../lib/research-memo.ts';
import { QUESTION_ANSWER_PROMPT_VERSION, questionPromptInstructions, questionExplanationSchema,
  resolveQuestionEvidence, validateQuestionExplanation, validateQuestionOutput } from '../lib/research-question.ts';
import { validateQuestionRun } from '../lib/research-question-storage.ts';
import { createQuestionHandler } from '../lib/research-question.server.ts';
import { assertArchiveSafe, runBoundedQuestionBatch } from '../scripts/run-question-batch.mjs';
import { questionTestConfig, questionRequest, providerResponse, planOutput, answerOutput } from './question-test-helpers.mjs';

assert.notEqual(process.env.LIVE_MODEL_E2E, '1');
const files = ['manifest.json', 'request-01.json', 'request-02.json'].map(name =>
  readFileSync(new URL('./fixtures/question-live-38390408233/' + name, import.meta.url), 'utf8'));
const manifest = JSON.parse(files[0]), record = JSON.parse(files[2]), run = record.record.run;
const snapshot = run.events.find(e => e.event === 'snapshot_supplied').details;
const resolved = await resolveQuestionEvidence(run.contract, snapshot);
assert.equal(resolved.status, 'READY');
const context = resolved.evidence.context, original = JSON.parse(run.calls[0].rawOutput);

test('v7 original bytes, prompt and first-failure receipt remain unchanged after v8', async () => {
  const hashes = ['39e2a229770547aa8dfc774ac45cbee539fd72dcf030e117e78afa4fdcf46bb5',
    'ff96c483cf80caa974b1cb57d6af3566f7fa0ddbaebcb9434a43105bf1f2c0a4',
    '150941b23dc7d749d96debc317d25b606e41e2af653a20ae41b30eee645cf7f3'];
  for (const [i, file] of files.entries()) assert.equal(await sha256Text(file), hashes[i]);
  assert.equal(await sha256Text(questionPromptInstructions('question-explanation.v7')), run.calls[0].promptSha256);
  assert.equal(manifest.commitSha, '8aed309389ea02a7c0caf5619220e8ec95d8a3bf');
  assert.equal(manifest.requests.length, 2); assert.equal(manifest.requestsWithoutUsage, 0);
  assert.equal(manifest.estimatedKnownUsageUsdMicros, 24719);
  assert.ok(manifest.requests.every(r => r.audit.providerHttpStatus === 200));
  assert.equal(manifest.status, 'stopped-after-failure');
  assert.equal(manifest.requests[1].failureCode, 'ANSWER_CITATION_OR_TEXT_INVALID');
  const before = canonicalJson(run); await validateQuestionRun(run); assert.equal(canonicalJson(run), before);
  assert.equal(run.answer, null); assert.equal(run.status, 'BLOCKED');
  assertArchiveSafe(record, []); assertArchiveSafe(manifest, []);
});

test('wire schema rejects numeric identifiers in prose while citations retain their exact IDs', () => {
  const schema = questionExplanationSchema(context, run.contract);
  for (const key of ['directAnswer','inference','counterEvidence','uncertainty']) {
    const pattern = new RegExp(schema.properties[key].properties.text.pattern);
    assert.ok(pattern.test('会计假设待复核，连续可比历史未知。'));
    for (const text of ['会计 A-03 待复核。','本次 S-05 C-04 比较。','K-07 待核验。','利润１增长５％。','<b>文字</b>']) assert.ok(!pattern.test(text));
  }
  for (const version of ['question-explanation.v7', QUESTION_ANSWER_PROMPT_VERSION]) {
    assert.throws(() => validateQuestionOutput(original, context, version, run.contract), /ANSWER_CITATION_OR_TEXT_INVALID/);
  }
  assert.ok(schema.properties.uncertainty.properties.citations.items.enum.some(id => id.includes('K-07')));
});

test('a conditional accounting hypothesis cannot excuse the unrelated unsupported decline attribution', () => {
  const answer = answerOutput({ sufficiency: 'partial' });
  answer.inference = { text: original.inference.text.replace('（A-03待复核）', '（会计假设待复核）'),
    citations: ['A-03','EV-S-05-C04-ADJ','EV-S-05-C04-NR','EV-S-05-C04-ATTR','F-02'] };
  assert.doesNotThrow(() => validateQuestionExplanation(answer, context, 'question-explanation.v7', run.contract));
  assert.throws(() => validateQuestionExplanation(answer, context, undefined, run.contract), /UNSUPPORTED_YOY_ATTRIBUTION/);
  for (const text of ['归母同比下降受本期非经常性损益拖累，仍待核验。', '若会计假设成立，则归母下降主要受非经常性损益为负影响。']) {
    answer.inference.text = text;
    assert.throws(() => validateQuestionExplanation(answer, context, undefined, run.contract), /UNSUPPORTED_YOY_ATTRIBUTION/);
  }
  for (const text of ['无法断言归母同比下降受本期非经常性损益拖累，原因待核验。', '归母同比下降是否受非经常性损益影响，仍待核验。']) {
    answer.inference.text = text;
    assert.doesNotThrow(() => validateQuestionExplanation(answer, context, undefined, run.contract));
  }
});

test('verified adjusted-profit growth does not depend on accepting the pending core-basis hypothesis', () => {
  const answer = answerOutput({ sufficiency: 'partial' });
  answer.counterEvidence.text = original.counterEvidence.text.replace('（A-03待复核）','（会计假设待复核）').replace('S-05 C-04','本次');
  assert.throws(() => validateQuestionExplanation(answer, context, undefined, run.contract), /VERIFIED_FACT_CONDITIONED_ON_ASSUMPTION/);
  answer.counterEvidence.text = '归母同比下降是整体盈利改善的反证；扣非同比上升不依赖核心经营假设，但其能否代表核心经营仍待会计复核。';
  assert.doesNotThrow(() => validateQuestionExplanation(answer, context, undefined, run.contract));
});

test('original blocked response is retained after two mock requests and idempotent lookup never sends another', async () => {
  let calls = 0, executeBody, failure;
  const handler = createQuestionHandler(() => questionTestConfig, { fetcher: async (_url, init) => {
    calls++;
    return JSON.parse(init.body).text.format.name.endsWith('plan') ? providerResponse(planOutput()) :
      providerResponse({}, { output: [{ type:'message', content:[{type:'output_text',text:run.calls[0].rawOutput}] }] });
  } });
  const result = await runBoundedQuestionBatch({ commitSha:'0'.repeat(40), persist:async()=>{}, archive:async(_i,data)=>assertArchiveSafe(data,[]),
    executePhase: async ({ spec, phase, draft }) => {
      const body = phase === 'plan' ? {phase, question:spec.question} : {phase,draft,confirmed:true,snapshot};
      if (phase === 'execute') executeBody = body;
      const data = await (await handler.POST(questionRequest(body))).json();
      if (data.run.status === 'BLOCKED') failure = data;
      return {ok:data.run.status !== 'BLOCKED',failureCode:data.run.reasons[0],data,audit:data.run.calls[0],record:{run:data.run}};
    } });
  assert.equal(calls,2); assert.equal(result.requests.length,2); assert.equal(result.status,'stopped-after-failure');
  assert.equal(failure.run.answer,null); assert.equal(failure.run.calls[0].rawOutput,run.calls[0].rawOutput);
  assert.deepEqual(await (await handler.POST(questionRequest(executeBody))).json(),failure); assert.equal(calls,2);
});
