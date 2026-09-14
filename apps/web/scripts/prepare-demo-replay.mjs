import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildMemoContext, canonicalJson, memoMarkdown, validateMemo, validateMemoOutput } from '../lib/research-memo.ts';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const objectDigest = value => digest(canonicalJson(value));
const json = value => JSON.stringify(value, null, 2) + '\n';
const equal = (actual, expected, label) => assert.deepEqual(actual, expected, label);
const fail = message => { throw new Error(message); };
const points = memo => [memo.summary, memo.supporting[0], memo.counter[0], memo.alternatives[0], ...memo.questions];
const labels = ['摘要', '支持依据', '反证事实与关联限制', '待验证的替代解释', '下一步研究问题一', '下一步研究问题二'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Read only the exact registered files. No network, credentials, browser storage or model calls.
export async function readRegisteredArchive(root, registration) {
  const expected = new Map();
  for (const item of registration.files) {
    if (!item.path || item.path.startsWith('/') || item.path.includes('\\') || item.path.includes(':') || item.path.split('/').some(p => !p || p === '.' || p === '..') || expected.has(item.path)) fail('Invalid archive registration path');
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 10_000_000 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('Invalid archive registration metadata');
    expected.set(item.path, item);
  }
  if (!expected.size || expected.size > 100) fail('Invalid registered file count');
  if ((await fs.lstat(root)).isSymbolicLink()) fail('Archive root must not be a symlink');
  const names = [];
  async function walk(directory, prefix = '') {
    for (const entry of await fs.readdir(directory, {withFileTypes:true})) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) fail('Archive symlinks are not supported');
      if (entry.isDirectory()) {
        if (![...expected.keys()].some(p => p.startsWith(relative + '/'))) fail('Unregistered archive directory');
        await walk(path.join(directory, entry.name), relative + '/');
      } else if (entry.isFile()) names.push(relative);
      else fail('Unsupported archive entry');
    }
  }
  await walk(root);
  equal(names.sort(), [...expected.keys()].sort(), 'Archive must contain every registered file and no extra files');
  const contents = new Map();
  for (const name of names) {
    const raw = await fs.readFile(path.join(root, name));
    const item = expected.get(name);
    if (raw.length !== item.bytes || digest(raw) !== item.sha256) fail(`Archive digest mismatch: ${name}`);
    contents.set(name, raw);
  }
  return contents;
}

export async function verifyReplay(contents, registration, proposals) {
  const read = name => JSON.parse(contents.get(name).toString('utf8'));
  const batch = read('live-batch-manifest.json');
  equal(batch.commitSha, registration.sourceCommit, 'Batch commit');
  equal(batch.status, 'technical-completed-awaiting-content-review', 'Original batch status');
  equal(batch.contentReview, 'pending', 'Original content review');
  equal(batch.samples.length, 3, 'All three samples are required');
  equal(proposals.sourceRun, registration.workflowRun, 'Proposal source run');
  equal(proposals.sourceCommit, registration.sourceCommit, 'Proposal source commit');
  equal(proposals.sourceArchiveSha256, registration.archiveSha256, 'Proposal source archive');
  equal(proposals.status, 'proposed-awaiting-owner-review', 'Proposal is not acceptance');
  equal(proposals.samples.length, 3, 'Every sample must have a proposal');
  const samples = [];
  for (let i = 1; i <= 3; i++) {
    const prefix = `sample-0${i}/`;
    const audit = read(prefix + 'S-05-live-deepseek-model-audit.json');
    const call = read(prefix + 'S-05-live-deepseek-model-call.json');
    const browser = read(prefix + 'S-05-browser-audit.json');
    const http = read(prefix + 'S-05-live-deepseek-model-http.json');
    const completion = read(prefix + 'sample-completion.json');
    const run = audit.run, entry = batch.samples[i-1], proposal = proposals.samples[i-1];
    equal(call.run, run, 'Original call and audit');
    equal(entry.runId, run.runId, 'Batch run binding');
    equal(http.runId, run.runId, 'HTTP run binding');
    equal(http.httpStatus, 200, 'Original HTTP completion');
    equal(run.status, 'completed', 'Original technical completion');
    equal(completion, {technicalFlow:'completed',contentReview:'pending',modelRequests:1}, 'Original completion record');
    equal(await buildMemoContext(browser.snapshot), run.context, 'Snapshot replay against unchanged engine');
    equal(browser.pdfSha256, run.context.source.sha256, 'PDF hash record');
    equal(browser.afterRollback[0], browser.snapshot, 'Original snapshot preservation');
    equal(browser.errors, [], 'Original browser errors');
    equal(validateMemoOutput(JSON.parse(run.audit.rawOutput), run.context).memo, run.memo, 'Lossless original memo mapping');
    for (const review of audit.reviews) {
      equal(review.runId, run.runId, 'Original review run');
      equal(review.snapshotSha256, run.context.snapshotSha256, 'Original review snapshot');
      equal(review.identityVerified, false, 'Original identity status');
    }
    equal(Buffer.from(memoMarkdown(run, audit.reviews.at(-1))), contents.get(prefix + 'S-05-live-deepseek-model-memo.md'), 'Original Markdown bytes');
    equal(proposal.index, i, 'Proposal index');
    equal(proposal.runId, run.runId, 'Proposal run');
    equal(proposal.snapshotSha256, run.context.snapshotSha256, 'Proposal snapshot');
    equal(proposal.sourceRunSha256, objectDigest(run), 'Proposal source run digest');
    equal(proposal.sourceMemoSha256, objectDigest(run.memo), 'Proposal source memo digest');
    equal(proposal.proposalSha256, objectDigest(proposal.memo), 'Proposal memo digest');
    equal(proposal.status, 'proposed-awaiting-owner-review', 'Proposal review status');
    const checked = validateMemo(proposal.memo, run.context, run.audit.promptVersion);
    if (!checked.memo) fail(`Proposal ${i} validation: ${checked.errors.join(', ')}`);
    equal(proposal.paragraphs.length, 6, 'Six proposal paragraphs');
    points(run.memo).forEach((point,j) => {
      equal(proposal.paragraphs[j].originalPointSha256, objectDigest(point), 'Original paragraph binding');
      const after = points(proposal.memo)[j];
      equal(proposal.paragraphs[j].characters, [...after.text].length, 'Proposal character count');
      equal(proposal.paragraphs[j].disposition, canonicalJson(point) === canonicalJson(after) ? 'retain' : 'revise', 'Proposal disposition');
    });
    samples.push({index:i, original:{run,reviews:audit.reviews,snapshot:browser.snapshot,afterRollback:browser.afterRollback}, proposal});
  }
  equal(new Set(samples.map(s=>s.original.run.runId)).size, 3, 'Independent original samples');
  return {schemaVersion:'competition-demo-replay.v1', mode:'read-only-historical-replay', workflowRun:registration.workflowRun, sourceCommit:registration.sourceCommit, sourceArchiveSha256:registration.archiveSha256, originalContentReview:'needs-revision-per-independent-review', proposalReview:'pending-owner-review', professionalReview:{eg01:'pending',eg02:'pending'}, newModelRequests:0, samples};
}

function sampleMarkdown(sample) {
  const {index,original,proposal} = sample;
  const before=points(original.run.memo), after=points(proposal.memo);
  return [`# 样本 ${index} · 历史输出与修订建议`, '',
    '只读历史回放；AI 原稿保留。建议由 Codex 整理，尚未经项目所有者确认或专业签署。原始 CI 接受事件只验证交互。', '',
    `原调用：${original.run.runId}`, `原快照 SHA-256：${original.run.context.snapshotSha256}`, `建议内容 SHA-256：${proposal.proposalSha256}`, '',
    ...before.flatMap((point,j)=>[`## ${labels[j]}`, '', `处置：${proposal.paragraphs[j].disposition === 'retain' ? '保留' : '修订'}。${proposal.paragraphs[j].reason}`, '',
      `原文：${point.text}`, `原引用：${point.citations.join('、')}`, '', `建议：${after[j].text}`, `建议引用：${after[j].citations.join('、')}`, '']),
    '## 本样本的输入证据', '', ...original.run.context.references.map(ref=>`- [${ref.id}] ${ref.excerpt}${ref.url ? ` [来源](${ref.url})` : ''}`), '',
    '专业关卡仍待复核；本页不向产品写入版本或接受事件。', ''].join('\n');
}

export function renderReplayHtml(replay) {
  const sections = replay.samples.map(s => {
    const before=points(s.original.run.memo), after=points(s.proposal.memo);
    return `<section id="sample-${s.index}"><h2>样本 ${s.index}</h2><p>原调用：<code>${escape(s.original.run.runId)}</code></p><p><a href="sample-0${s.index}-review.md">下载逐段核对稿</a> · <a href="original/sample-0${s.index}/S-05-live-deepseek-model-memo.png">原界面截图</a> · <a href="original/sample-0${s.index}/S-05-reviewed-chain.png">原证据与计算截图</a></p>${before.map((point,j)=>`<article><h3>${labels[j]} · ${s.proposal.paragraphs[j].disposition==='retain'?'建议保留':'建议修订'}</h3><p>${escape(s.proposal.paragraphs[j].reason)}</p><div class="comparison"><div><h4>AI 原稿</h4><p>${escape(point.text)}</p><p class="refs">${escape(point.citations.join(' · '))}</p></div><div><h4>修订建议 · 待本人确认</h4><p>${escape(after[j].text)}</p><p class="refs">${escape(after[j].citations.join(' · '))}</p></div></div></article>`).join('')}<details><summary>核对本样本的固定输入与引用</summary>${s.original.run.context.references.map(r=>`<p><strong>${escape(r.id)}</strong>：${escape(r.excerpt)} ${r.url?`<a href="${escape(r.url)}">来源</a>`:''}</p>`).join('')}</details></section>`;
  }).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'"><title>三样本历史回放与修订核对</title><style>body{max-width:1120px;margin:32px auto;padding:0 20px;font:16px/1.75 system-ui,sans-serif;color:#182333;background:#f5f7fa}header,section{background:white;padding:24px;border:1px solid #d5dde7;border-radius:8px;margin:20px 0}h1{font-size:26px}h2{font-size:22px}h3{font-size:18px}a{color:#065da8}code,.refs{overflow-wrap:anywhere;font-size:13px}.notice{padding:16px;border-left:4px solid #926100;background:#fff7df}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:20px}.comparison>div{background:#f6f8fb;padding:16px}article{border-top:1px solid #d5dde7;margin-top:24px;padding-top:12px}h4{margin:0}.refs{color:#465267}nav a{display:inline-block;margin-right:20px}summary{cursor:pointer}details{margin-top:24px}@media(max-width:700px){.comparison{grid-template-columns:1fr}body{margin:12px auto;padding:0 10px}header,section{padding:16px}}</style><header><h1>三样本历史回放与修订核对</h1><p>来源：GitHub Run ${replay.workflowRun} · 2026-09-09 · 全部 3 份 / 18 段</p><p class="notice"><strong>历史回放 · 原稿仍需内容修订 · 建议待本人确认</strong><br>本核对页不调用模型、不写入产品审核记录。原截图中的 CI 接受仅是技术交互证据；EG-01 / EG-02 仍待专业复核。这是离线核对材料，产品 UI 以 GitHub 应用为准。</p><nav><a href="#sample-1">样本 1</a><a href="#sample-2">样本 2</a><a href="#sample-3">样本 3</a><a href="replay-data.json">完整数据与来源绑定</a></nav></header>${sections}</html>\n`;
}

export async function reserveOutputDirectory(inputRoot, outputPath) {
  const input=await fs.realpath(inputRoot);
  const requested=path.resolve(outputPath);
  const parent=await fs.realpath(path.dirname(requested));
  const output=path.join(parent,path.basename(requested));
  if(output===input || output.startsWith(input+path.sep)) fail('Output must be outside the source archive');
  await fs.mkdir(output);
  return output;
}

export async function prepareReplay(archiveDir, outputDir) {
  const registration=JSON.parse(await fs.readFile(path.join(repo,'docs/demo/run-10-archive-manifest.json'),'utf8'));
  const proposals=JSON.parse(await fs.readFile(path.join(repo,'docs/demo/run-10-revision-proposals.json'),'utf8'));
  const input=path.resolve(archiveDir);
  const contents=await readRegisteredArchive(input,registration);
  const replay=await verifyReplay(contents,registration,proposals);
  // mkdir is exclusive; an existing destination is never reused or cleared.
  const output=await reserveOutputDirectory(input,outputDir);
  try {
    for(const [name,bytes] of contents){const dest=path.join(output,'original',name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes,{flag:'wx'});}
    await fs.writeFile(path.join(output,'replay-data.json'),json(replay),{flag:'wx'});
    for(const sample of replay.samples)await fs.writeFile(path.join(output,`sample-0${sample.index}-review.md`),sampleMarkdown(sample),{flag:'wx'});
    await fs.writeFile(path.join(output,'index.html'),renderReplayHtml(replay),{flag:'wx'});
    const report={schemaVersion:'demo-replay-verification.v1',sourceWorkflowRun:registration.workflowRun,sourceArchiveSha256:registration.archiveSha256,registeredFiles:contents.size,samples:replay.samples.map(s=>({index:s.index,runId:s.original.run.runId,snapshotSha256:s.original.run.context.snapshotSha256,proposalSha256:s.proposal.proposalSha256})),proposalParagraphs:18,newModelRequests:0,ownerReview:'pending',professionalReview:'pending',files:[]};
    for(const name of ['replay-data.json','index.html','sample-01-review.md','sample-02-review.md','sample-03-review.md'])report.files.push({path:name,sha256:digest(await fs.readFile(path.join(output,name)))});
    await fs.writeFile(path.join(output,'verification.json'),json(report),{flag:'wx'});
    await fs.writeFile(path.join(output,'README.md'),'# 离线核对包\n\n双击 `index.html` 查看三份原稿、修订建议及证据；无须密钥或联网生成。原记录逐字节保留在 `original/`。`replay-data.json` 供开发者核对数据与准确来源绑定，不能直接当作已接受的产品台账导入。\n\n所有建议待所有者确认，CI 原始审核与专业审核分别对待。正式操作、启动和部署方案见 GitHub 收尾说明。\n',{flag:'wx'});
    return report;
  } catch(error) {
    // Preserve partial output for diagnosis; never delete source or user files.
    throw new Error(`Output incomplete; use a new empty destination after resolving the error: ${error.message}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length!==4 || args[0]!=='--archive-dir' || args[2]!=='--out') {
    console.error('Usage: node --experimental-strip-types apps/web/scripts/prepare-demo-replay.mjs --archive-dir <extracted-run-10> --out <new-directory>');process.exitCode=1;
  } else {
    try{const report=await prepareReplay(args[1],args[3]);console.log(json({verifiedFiles:report.registeredFiles,samples:report.samples.length,proposalParagraphs:report.proposalParagraphs,newModelRequests:0,ownerReview:'pending',professionalReview:'pending',output:path.resolve(args[3])}));}
    catch(error){console.error(error.message);process.exitCode=1;}
  }
}
