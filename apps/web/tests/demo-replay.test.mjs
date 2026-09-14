import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { readRegisteredArchive, reserveOutputDirectory, renderReplayHtml } from '../scripts/prepare-demo-replay.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
async function temporary(t) { const dir=await fs.mkdtemp(path.join(os.tmpdir(),'memo-replay-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir; }
const registered = (name,raw) => ({path:name,bytes:raw.length,sha256:hash(raw)});

test('registered text and binary bytes are preserved, and changed or extra files fail closed',async t=>{
  const dir=await temporary(t), text=Buffer.from('synthetic\n\u4e2d\r\n'), binary=Buffer.from([0,255,17,42]);
  await fs.writeFile(path.join(dir,'text.txt'),text);await fs.writeFile(path.join(dir,'image.bin'),binary);
  const registration={files:[registered('text.txt',text),registered('image.bin',binary)]};
  let actual=await readRegisteredArchive(dir,registration);assert.deepEqual(actual.get('text.txt'),text);assert.deepEqual(actual.get('image.bin'),binary);
  await fs.writeFile(path.join(dir,'text.txt'),'corrupt');await assert.rejects(readRegisteredArchive(dir,registration),/digest mismatch/);
  await fs.writeFile(path.join(dir,'text.txt'),text);await fs.writeFile(path.join(dir,'extra.txt'),'unexpected');
  await assert.rejects(readRegisteredArchive(dir,registration),/every registered file/);assert.deepEqual(await fs.readFile(path.join(dir,'text.txt')),text);
});

test('missing files, traversal, unknown directories and symlinks cannot broaden the archive read',async t=>{
  const dir=await temporary(t), raw=Buffer.from('synthetic');
  const registration={files:[registered('data.json',raw)]};
  await assert.rejects(readRegisteredArchive(dir,registration),/every registered file/);
  for(const name of ['../outside','/absolute','C:/absolute','nested\\outside','./data.json'])await assert.rejects(readRegisteredArchive(dir,{files:[registered(name,raw)]}),/registration path/);
  await fs.mkdir(path.join(dir,'unregistered'));await assert.rejects(readRegisteredArchive(dir,registration),/Unregistered archive directory/);await fs.rmdir(path.join(dir,'unregistered'));
  const outside=await temporary(t);await fs.writeFile(path.join(outside,'data.json'),raw);await fs.symlink(path.join(outside,'data.json'),path.join(dir,'data.json'));
  await assert.rejects(readRegisteredArchive(dir,registration),/symlinks/);
});

test('output reservation cannot overwrite a user directory or write inside the archive through a symlink',async t=>{
  const root=await temporary(t), input=path.join(root,'source'), existing=path.join(root,'existing');
  await fs.mkdir(input);await fs.mkdir(existing);await fs.writeFile(path.join(existing,'keep.txt'),'user history');
  await assert.rejects(reserveOutputDirectory(input,existing),{code:'EEXIST'});
  assert.equal(await fs.readFile(path.join(existing,'keep.txt'),'utf8'),'user history');
  await assert.rejects(reserveOutputDirectory(input,path.join(input,'new')),/outside/);
  await fs.symlink(input,path.join(root,'alias'));await assert.rejects(reserveOutputDirectory(input,path.join(root,'alias','new')),/outside/);
  const target=await reserveOutputDirectory(input,path.join(root,'new'));assert.deepEqual(await fs.readdir(target),[]);
});

test('read-only replay escapes model text and retains historical and pending-review labels',()=>{
  const point={text:'<script>alert("synthetic")</script>',citations:['<img onerror=alert(1)>']};
  const memo={summary:point,supporting:[point],counter:[point],alternatives:[point],questions:[point,point]};
  const replay={workflowRun:123,samples:[{index:1,original:{run:{runId:'synthetic-run',memo,context:{references:[]}}},proposal:{memo,paragraphs:Array.from({length:6},()=>({disposition:'revise',reason:'Synthetic test only'}))}}]};
  const html=renderReplayHtml(replay);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img onerror='));assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('历史回放'));assert.ok(html.includes('原稿仍需内容修订'));assert.ok(html.includes('待本人确认'));assert.ok(html.includes("default-src 'none'"));
  assert.ok(!/<(?:button|form|input)\b/i.test(html));
});
