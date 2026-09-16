import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../lib/research-memo.ts';

const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');

test('owner decision accepts the exact three proposals while professional gates stay pending', async () => {
  const proposals = await read('../../../docs/demo/run-10-revision-proposals.json');
  const decision = await read('../../../docs/demo/run-10-owner-review.json');

  assert.equal(decision.schemaVersion, 'memo-revision-owner-decision.v1');
  assert.equal(decision.recordedAt, '2026-09-16');
  assert.deepEqual(decision.decisionSource, {
    channel: 'project-workspace',
    instruction: '三份全部按建议通过',
    approverRole: 'project-owner',
    authorizationRecorded: true,
    identityVerifiedByApplication: false,
  });
  assert.equal(decision.scope, 'memo-only');
  assert.equal(decision.status, 'accepted-by-project-owner');
  assert.deepEqual(decision.proposalBinding, {
    schemaVersion: proposals.schemaVersion,
    sourceRun: proposals.sourceRun,
    sourceCommit: proposals.sourceCommit,
    sourceArchiveSha256: proposals.sourceArchiveSha256,
  });
  assert.equal(proposals.status, 'proposed-awaiting-owner-review');
  assert.equal(proposals.samples.length, 3);
  assert.equal(decision.samples.length, 3);

  let revised = 0;
  let retained = 0;
  for (const [index, proposal] of proposals.samples.entries()) {
    const accepted = decision.samples[index];
    assert.equal(accepted.index, proposal.index);
    assert.equal(accepted.runId, proposal.runId);
    assert.equal(accepted.snapshotSha256, proposal.snapshotSha256);
    assert.equal(accepted.sourceRunSha256, proposal.sourceRunSha256);
    assert.equal(accepted.sourceMemoSha256, proposal.sourceMemoSha256);
    assert.equal(accepted.proposalSha256, proposal.proposalSha256);
    assert.equal(accepted.proposalSha256, digest(proposal.memo));
    assert.equal(accepted.decision, 'accepted');
    const counts = proposal.paragraphs.reduce((value, paragraph) => {
      value[paragraph.disposition] += 1;
      return value;
    }, { revise: 0, retain: 0 });
    assert.deepEqual(accepted.paragraphs, { revised: counts.revise, retained: counts.retain });
    revised += counts.revise;
    retained += counts.retain;
  }

  assert.deepEqual(decision.summary, { samples: 3, paragraphs: 18, revised, retained });
  assert.equal(revised, 16);
  assert.equal(retained, 2);
  assert.deepEqual(decision.professionalReview, { eg01: 'pending', eg02: 'pending' });
  assert.deepEqual(decision.effects, {
    originalModelRunsChanged: false,
    historicalReviewEventsChanged: false,
    browserRevisionLedgerWritten: false,
    promptChanged: false,
    modelBudgetChanged: false,
    financialRulesChanged: false,
    decisionLogicChanged: false,
  });
});
