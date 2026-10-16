import assert from 'node:assert/strict';
import test from 'node:test';
import { QUESTION_PENDING_KEY, claimPendingQuestion, clearPendingQuestion } from '../lib/research-question-pending.ts';

test('two tabs cannot replace the shared unresolved request; stale completion cannot erase its successor', async t => {
  const before = globalThis.window;
  const data = new Map();
  let queue = Promise.resolve();
  globalThis.window = {
    isSecureContext: true, crypto,
    navigator: { locks: { request(_key, fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; } } },
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) },
  };
  t.after(() => { if (before === undefined) delete globalThis.window; else globalThis.window = before; });
  const first = { phase: 'plan', id: crypto.randomUUID(), body: { question: 'A' } };
  const second = { phase: 'plan', id: crypto.randomUUID(), body: { question: 'B' } };
  const result = await Promise.allSettled([claimPendingQuestion(first), claimPendingQuestion(second)]);
  assert.deepEqual(result.map(r => r.status), ['fulfilled', 'rejected']);
  assert.deepEqual(JSON.parse(data.get(QUESTION_PENDING_KEY)), first);
  await clearPendingQuestion(second);
  assert.deepEqual(JSON.parse(data.get(QUESTION_PENDING_KEY)), first);
  await clearPendingQuestion(first);
  await claimPendingQuestion(second);
  await clearPendingQuestion(first);
  assert.deepEqual(JSON.parse(data.get(QUESTION_PENDING_KEY)), second);
  await clearPendingQuestion(second);
  assert.equal(data.has(QUESTION_PENDING_KEY), false);
});
