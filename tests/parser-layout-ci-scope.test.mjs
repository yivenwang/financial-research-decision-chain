import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEngineScope } from '../scripts/parser-layout-ci-scope.mjs';

test('layout-only engine changes use the mandatory restricted corpus lane', () => {
  assert.deepEqual(classifyEngineScope(['lib/parser-v06.ts', 'lib/parser-primary-layout.ts',
    'tests/fixtures/parser-layout/s-05.json', 'docs/PARSER_LAYOUT_GENERALIZATION.md']), { engine: false, parserLayout: true });
});
test('financial semantics, legacy tests, package changes and unknown parser files retain broad gates', () => {
  for (const path of ['lib/chain-v01.ts', 'tests/unknown.test.mjs', 'package.json', 'package-lock.json',
    'docs/CHAIN_V0.1_SPEC.md', 'lib/parser-v05.ts']) {
    assert.deepEqual(classifyEngineScope(['lib/parser-v06.ts', path]), { engine: true, parserLayout: false });
  }
});
test('non-engine changes do not claim a financial regression executed', () => {
  assert.deepEqual(classifyEngineScope(['apps/web/app/page.tsx', 'docs/PROJECT_STATE.md']), { engine: false, parserLayout: false });
});
