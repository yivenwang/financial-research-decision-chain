import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalJson, sha256Text } from '../lib/research-memo.ts';
import { QUESTION_ANSWER_PROMPT_VERSION, questionPromptInstructions, resolveQuestionEvidence,
  validateQuestionExplanation, validateQuestionOutput } from '../lib/research-question.ts';
import { questionCitationChoices } from '../lib/question-citation-policy.ts';
import { validateQuestionRun } from '../lib/research-question-storage.ts';
import { createQuestionHandler } from '../lib/research-question.server.ts';
import { assertArchiveSafe, runBoundedQuestionBatch } from '../scripts/run-question-batch.mjs';
import { questionTestConfig, questionRequest, providerResponse, planOutput, answerOutput } from './question-test-helpers.mjs';

assert.notEqual(process.env.LIVE_MODEL_E2E, '1');
const raw = readFileSync(new URL('./fixtures/question-live-38381793600/request-02.json', import.meta.url), 'utf8');
const manifestRaw = readFileSync(new URL('./fixtures/question-live-38381793600/manifest.json', import.meta.url), 'utf8');
const record = JSON.parse(raw), run = record.record.run, manifest = JSON.parse(manifestRaw);
const snapshot = run.events.find(e => e.event === 'snapshot_supplied').details;
const resolved = await resolveQuestionEvidence(run.contract, snapshot);
assert.equal(resolved.status, 'READY');
const context = resolved.evidence.context;
const original = JSON.parse(run.calls[0].rawOutput);
const flatten = value => {
  const copy = structuredClone(value);
  for (const key of ['directAnswer','inference','counterEvidence','uncertainty']) copy[key].citations = [...new Set(copy[key].citations.flatMap(id => id.split('|')))];
  return copy;
};

test('actual v6 output, first failure, two successful HTTP calls and cost receipt stay immutable', async () => {
  assert.equal(await sha256Text(raw), '1121c971fe11058ed1f805650dc153146677204d6ae6146b14f288ab587202ef');
  assert.equal(await sha256Text(manifestRaw), 'f37bba905922b96fce28ea5ae11d81038a59f6ffd444697dd352137fd6847112');
  assert.equal(await sha256Text(questionPromptInstructions('question-explanation.v6')), run.calls[0].promptSha256);
  assert.equal(manifest.commitSha, '8d3b93d83d61cad84df9309713a678f3d0326f98');
  assert.equal(manifest.requests.length, 2); assert.equal(manifest.requestsWithoutUsage, 0);
  assert.ok(manifest.requests.every(r => r.audit.providerHttpStatus === 200));
  assert.equal(manifest.status, 'stopped-after-failure');
  assert.equal(manifest.requests[1].failureCode, 'PARAGRAPH_EVIDENCE_OMITTED');
  assert.equal(run.answer, null); assert.equal(run.status, 'BLOCKED');
  const before = canonicalJson(run); await validateQuestionRun(run); assert.equal(canonicalJson(run), before);
  for (const data of [record, manifest]) assertArchiveSafe(data, []);
});

test('raw counter paragraph lacks its own adjusted-profit evidence; current wire never fills the omitted ID', () => {
  assert.throws(() => validateQuestionOutput(original, context, 'question-explanation.v6', run.contract), /PARAGRAPH_EVIDENCE_OMITTED/);
  assert.throws(() => validateQuestionOutput(original, context, QUESTION_ANSWER_PROMPT_VERSION, run.contract), /ANSWER_CITATION_OR_TEXT_INVALID/);
  const before = canonicalJson(original);
  assert.throws(() => validateQuestionExplanation(flatten(original), context, 'question-explanation.v6', run.contract), /PARAGRAPH_EVIDENCE_OMITTED/);
  assert.equal(canonicalJson(original), before);
});

test('v7 counter groups explicitly bind both profit sides and the assumption limit; v6 selections retain old meaning', () => {
  const mandatory = ['EV-S-05-C04-ATTR','EV-S-05-C04-ADJ','A-03'];
  const choices = questionCitationChoices(context, 'counterEvidence');
  assert.ok(choices.length > 0);
  for (const token of choices) {
    assert.ok(mandatory.every(id => token.split('|').includes(id)));
    assert.ok(token.split('|').every(id => context.references.some(r => r.id === id)));
  }
  assert.ok(questionCitationChoices(context, 'counterEvidence', false).includes('EV-S-05-C04-ATTR'));
  assert.ok(!choices.includes('EV-S-05-C04-ATTR'));
});

test('the actual spread-expansion sentence is independently blocked even with a different conditional assumption', () => {
  const answer = answerOutput({ sufficiency: 'partial' });
  answer.inference = { text: original.inference.text, citations: ['EV-S-05-C04-ADJ','EV-S-05-C04-ATTR','A-03','K-07','EV-S-05-C04-SPREAD'] };
  assert.throws(() => validateQuestionExplanation(answer, context, undefined, run.contract), /UNSUPPORTED_SPREAD_TREND/);
  for (const text of ['增速差扩大，仍待核验。','若会计假设成立，则增速差扩大，仍待核验。']) {
    answer.inference.text = text;
    assert.throws(() => validateQuestionExplanation(answer, context, undefined, run.contract), /UNSUPPORTED_SPREAD_TREND/);
  }
  for (const text of ['不能断言增速差扩大，仍待核验。','增速差未扩大，仍待核验。','若未来增速差扩大，则需要核验。']) {
    answer.inference.text = text;
    assert.doesNotThrow(() => validateQuestionExplanation(answer, context, undefined, run.contract));
  }
});

test('core-basis assertion cannot silently promote the pending accounting assumption', () => {
  const answer = answerOutput({ sufficiency: 'partial' });
  answer.counterEvidence.text = original.counterEvidence.text;
  assert.throws(() => validateQuestionExplanation(answer, context, undefined, run.contract), /ASSUMPTION_PROMOTED/);
  answer.counterEvidence.text = '归母同比下降仍是反证；扣非能否代表核心口径仍待会计复核。';
  assert.doesNotThrow(() => validateQuestionExplanation(answer, context, undefined, run.contract));
});

test('v6 content rules remain historical while a new v7 acceptance rejects the known unsupported trend', () => {
  const answer = answerOutput({ sufficiency: 'partial' });
  answer.inference = { text: original.inference.text, citations: ['EV-S-05-C04-ADJ','EV-S-05-C04-ATTR','A-03','K-07','EV-S-05-C04-SPREAD'] };
  assert.doesNotThrow(() => validateQuestionExplanation(answer, context, 'question-explanation.v6', run.contract));
  assert.throws(() => validateQuestionExplanation(answer, context, QUESTION_ANSWER_PROMPT_VERSION, run.contract), /UNSUPPORTED_SPREAD_TREND/);
});

test('original failed wire replays twice through the batch, blocks and cannot be resent under its operation ID', async () => {
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
  assert.equal(calls,2);assert.equal(result.requests.length,2);assert.equal(result.status,'stopped-after-failure');
  assert.equal(failure.run.answer,null);assert.equal(failure.run.calls[0].rawOutput,run.calls[0].rawOutput);
  assert.deepEqual(await (await handler.POST(questionRequest(executeBody))).json(),failure);assert.equal(calls,2);
});
