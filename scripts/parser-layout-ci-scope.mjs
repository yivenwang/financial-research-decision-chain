import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// A narrow parser-only lane. Changes to ANY other engine/test/package file
// retain the original broad financial gates; this is not a branch-name bypass.
const allowed = new Set([
  'lib/parser-v06.ts', 'lib/parser-primary-layout.ts',
  'tests/parser-layout-generalization.test.mjs', 'tests/parser-layout-pdf.test.mjs',
  'tests/parser-layout-ci-scope.test.mjs',
  'tests/fixtures/parser-layout/s-05.json', 'tests/fixtures/parser-layout/s-06.json',
]);
export function classifyEngineScope(paths) {
  const engine = paths.filter(path => /^(lib\/|tests\/|package(?:-lock)?\.json$|docs\/CHAIN_V0\.1_SPEC\.md$)/.test(path));
  const parserLayout = engine.length > 0 && engine.every(path => allowed.has(path));
  return { engine: engine.length > 0 && !parserLayout, parserLayout };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = process.env.EVENT_NAME === 'pull_request'
    ? classifyEngineScope(execFileSync('git', ['diff', '--name-only', process.env.BASE_SHA, process.env.HEAD_SHA], { encoding: 'utf8' }).trim().split('\n'))
    : { engine: true, parserLayout: false };
  const output = `engine=${scope.engine}\nparser_layout=${scope.parserLayout}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}
