import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, chmod, cp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { operationStore, OPERATION_LIMITS } from "../lib/research-operation.server.ts";
import { backupOperations, restoreOperations, verifyRecovery, quarantineOperation } from "../lib/research-operation-maintenance.server.ts";
import { REVIEW_ACCESS_COOKIE, reviewSessionValue, reviewSessionOwner } from "../lib/reviewer-access.ts";
import { questionTestConfig as config, mainQuestion, questionTestSnapshot, planOutput, answerOutput, providerResponse } from "./question-test-helpers.mjs";

async function fixture(t, storeOptions={}) {
  const base=await mkdtemp(join(tmpdir(),"beacon-owner-test-")),directory=join(base,"receipts");t.after(()=>rm(base,{recursive:true,force:true}));
  const a=await reviewSessionValue(config.accessToken),b=await reviewSessionValue(config.accessToken);let calls=0;
  const handler=()=>createQuestionHandler(()=>config,{runDirectory:directory,storeOptions,fetcher:async(_url,init)=>{calls++;return providerResponse(JSON.parse(init.body).text.format.name.endsWith("plan")?planOutput():answerOutput());}});
  const post=(body,cookie=a,headers={})=>new Request("http://localhost/api/research-question",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json",cookie:`${REVIEW_ACCESS_COOKIE}=${cookie}`,...headers},body:JSON.stringify(body)});
  const get=(phase,id,cookie=a,headers={})=>new Request(`http://localhost/api/research-question?phase=${phase}&operationId=${id}`,{headers:{cookie:`${REVIEW_ACCESS_COOKIE}=${cookie}`,...headers}});
  const id=crypto.randomUUID(),planBody={phase:"plan",question:mainQuestion};
  const plan=async()=>{const r=await handler().POST(post(planBody,a,{"Idempotency-Key":id}));return {response:r,draft:await r.json()};};
  return {base,directory,a,b,id,post,get,plan,planBody,handler,calls:()=>calls};
}
test("verified nonce owns records; sharing code, changing userId, invalid cookies or relogin cannot impersonate owner",async t=>{
  const f=await fixture(t),a=await reviewSessionOwner(f.get("plan",f.id),config.accessToken),b=await reviewSessionOwner(f.get("plan",f.id,f.b),config.accessToken);
  assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);assert.equal(await reviewSessionOwner(f.get("plan",f.id,"invalid"),config.accessToken),null);
  const {draft}=await f.plan();const h=f.handler();
  assert.deepEqual(await(await h.GET(f.get("plan",f.id))).json(),draft);
  assert.equal((await h.GET(f.get("plan",f.id,f.b))).status,404);
  assert.equal((await h.POST(f.post(f.planBody,f.b,{"Idempotency-Key":f.id,"x-user-id":a}))).status,404);
  assert.equal((await h.POST(f.post({...f.planBody,userId:a}))).status,400);assert.equal(f.calls(),1);
  const raw=await readFile(join(f.directory,`plan-${f.id}`,"record.json"),"utf8");
  for(const secret of [f.a,f.b,config.accessToken,config.apiKey,process.env.REVIEW_SESSION_SECRET])assert.equal(raw.includes(secret),false);
  assert.equal(JSON.parse(raw).ownerSha256,a);
});
test("shared Bearer alone cannot plan/read/execute; valid foreign cookie plus Bearer does not override ownership",async t=>{
  const f=await fixture(t),{draft}=await f.plan(),h=f.handler(),bearer={authorization:`Bearer ${config.accessToken}`};
  for(const body of [f.planBody,{phase:"execute",draft,confirmed:true,snapshot:questionTestSnapshot()}])assert.equal((await h.POST(f.post(body,"",bearer))).status,401);
  assert.equal((await h.GET(f.get("plan",f.id,"",bearer))).status,401);
  assert.equal((await h.GET(f.get("plan",f.id,f.b,bearer))).status,404);assert.equal(f.calls(),1);
});
test("draft HMAC binds verified session before material lookup, execution and completed replay",async t=>{
  const f=await fixture(t),{draft}=await f.plan(),body={phase:"execute",draft,confirmed:true,snapshot:questionTestSnapshot()},h=f.handler();
  assert.equal((await h.POST(f.post(body,f.b))).status,422);assert.equal((await h.POST(f.post({...body,snapshot:null},f.b))).status,422);assert.equal(f.calls(),1);
  const first=await(await h.POST(f.post(body))).json();assert.equal(first.run.status,"ANSWER_READY");
  assert.equal((await h.POST(f.post(body,f.b))).status,422);
  assert.equal((await h.GET(f.get("execute",draft.run.requestId,f.b))).status,404);
  assert.deepEqual(await(await f.handler().POST(f.post(body))).json(),first);assert.equal(f.calls(),2);
});
test("same cookie across handler restart/tabs replays exact content; input conflict is not repaired",async t=>{
  const f=await fixture(t),{draft}=await f.plan();
  assert.deepEqual(await(await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":f.id}))).json(),draft);
  assert.equal((await f.handler().POST(f.post({phase:"plan",question:"核对证据"},f.a,{"Idempotency-Key":f.id}))).status,409);
  assert.deepEqual(await(await f.handler().GET(f.get("plan",f.id))).json(),draft);assert.equal(f.calls(),1);
  const automatic = await (await f.handler().POST(f.post(f.planBody))).json();
  assert.deepEqual(await (await f.handler().GET(f.get("plan",automatic.run.requestId))).json(),automatic);
  assert.deepEqual(await (await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":automatic.run.requestId}))).json(),automatic);
  assert.equal(f.calls(),2); // Server-generated IDs must identify the same durable receipt.
});
test("legacy unowned receipts are rejected unchanged, including matching keys and shared Bearer",async t=>{
  const f=await fixture(t);await f.plan();const id=crypto.randomUUID(),dir=join(f.directory,`plan-${id}`);await mkdir(dir,{mode:0o700});
  const raw=JSON.stringify({schema:"question-operation.v1",state:"completed",inputSha256:"a".repeat(64),startedAt:new Date().toISOString(),response:{status:200,body:{private:"legacy"}}});await writeFile(join(dir,"record.json"),raw,{mode:0o600});
  const h=f.handler();assert.equal((await h.GET(f.get("plan",id))).status,409);assert.equal((await h.POST(f.post(f.planBody,f.a,{"Idempotency-Key":id}))).status,503);
  assert.equal(await readFile(join(dir,"record.json"),"utf8"),raw);assert.equal(f.calls(),1);
});
test("unsafe root/record modes and symlink roots fail closed rather than chmod or adopt",async t=>{
  const f=await fixture(t);await f.plan();await chmod(f.directory,0o755);assert.equal((await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":crypto.randomUUID()}))).status,503);await chmod(f.directory,0o700);
  const file=join(f.directory,`plan-${f.id}`,"record.json");await chmod(file,0o644);assert.equal((await f.handler().GET(f.get("plan",f.id))).status,409);await chmod(file,0o600);
  const link=join(f.base,"linked");await symlink(f.directory,link);await assert.rejects(operationStore(link).read("plan",f.id),/NOT_PRIVATE/);assert.equal(f.calls(),1);
});
test("low bytes/inodes and reserved quota block before provider with zero calls",async t=>{
  for(const options of [{probeSpace:async()=>({bytes:0,inodes:100000})},{probeSpace:async()=>({bytes:1e12,inodes:0})},{maxBytes:OPERATION_LIMITS.recordBytes-1}]){
    const f=await fixture(t,options);assert.equal((await f.plan()).response.status,503);assert.equal(f.calls(),0);
  }
});
test("ENOSPC after provider completion retains durable claim and blocks rebilling",async t=>{
  const f=await fixture(t,{beforeWrite:async path=>{if(path.endsWith("completed.tmp"))throw Object.assign(new Error("disk full"),{code:"ENOSPC"});}});
  assert.equal((await f.plan()).response.status,503);assert.equal(f.calls(),1);
  assert.equal((await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":f.id}))).status,202);assert.equal(f.calls(),1);
  assert.equal((await operationStore(f.directory).read("plan",f.id)).state,"running");
});
test("independent processes share one atomic owner claim, then read completed state after restart",async t=>{
  const f=await fixture(t);await operationStore(f.directory).initialize();
  const script=`import {operationStore} from ${JSON.stringify(new URL("../lib/research-operation.server.ts",import.meta.url).href)};const s=operationStore(process.argv[1]);const r=await s.claim('plan',process.argv[2],'a'.repeat(64),'b'.repeat(64));process.stdout.write(r?'claimed':'exists');`;
  const results=await Promise.all([1,2].map(()=>promisify(execFile)(process.execPath,["--experimental-strip-types","--input-type=module","-e",script,f.directory,f.id])));assert.deepEqual(results.map(r=>r.stdout).sort(),["claimed","exists"]);
  const store=operationStore(f.directory),record=await store.read("plan",f.id);await store.complete("plan",f.id,record,Response.json({fixture:"NOT-LIVE"}));
  const reader=`import {operationStore} from ${JSON.stringify(new URL("../lib/research-operation.server.ts",import.meta.url).href)};process.stdout.write(JSON.stringify(await operationStore(process.argv[1]).read('plan',process.argv[2])));`;
  assert.deepEqual(JSON.parse((await promisify(execFile)(process.execPath,["--experimental-strip-types","--input-type=module","-e",reader,f.directory,f.id])).stdout),await store.read("plan",f.id));
});
test("SIGKILL after durable claim leaves a readable running task without a second claim",async t=>{
  const f=await fixture(t);await operationStore(f.directory).initialize();
  const script=`import {operationStore} from ${JSON.stringify(new URL("../lib/research-operation.server.ts",import.meta.url).href)};await operationStore(process.argv[1]).claim('plan',process.argv[2],'a'.repeat(64),'b'.repeat(64));setInterval(()=>{},1000);process.stdout.write('claimed');`;
  const child=spawn(process.execPath,["--experimental-strip-types","--input-type=module","-e",script,f.directory,f.id],{stdio:["ignore","pipe","pipe"]});
  await new Promise((r,j)=>{child.stdout.once("data",r);child.once("error",j);});const stopped=new Promise(r=>child.once("exit",(code,signal)=>r({code,signal})));assert.equal(child.kill("SIGKILL"),true);assert.deepEqual(await stopped,{code:null,signal:"SIGKILL"});
  const store=operationStore(f.directory);assert.equal((await store.read("plan",f.id)).state,"running");assert.equal(await store.claim("plan",f.id,"a".repeat(64),"b".repeat(64)),null);
});
test("stale backup restore preserves newer live claims and requires explicit verification before admission",async t=>{
  const f=await fixture(t);await f.plan();const backup=join(f.base,"backup");await backupOperations(f.directory,backup);
  const later=crypto.randomUUID();await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":later}));const bytes=await readFile(join(f.directory,`plan-${later}`,"record.json"));
  const result=await restoreOperations(f.directory,backup,true);assert.equal(result.preserved,2);assert.deepEqual(await readFile(join(f.directory,`plan-${later}`,"record.json")),bytes);
  assert.equal((await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":crypto.randomUUID()}))).status,503);assert.equal(f.calls(),2);
  assert.equal((await verifyRecovery(f.directory,true,true)).status,"verified-admission-enabled");assert.equal((await f.handler().GET(f.get("plan",later))).status,200);
});
test("missing newer receipt after stale filesystem restore freezes even fresh task IDs, never resets index",async t=>{
  const f=await fixture(t);await f.plan();const backup=join(f.base,"backup");await backupOperations(f.directory,backup);
  const later=crypto.randomUUID();await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":later}));
  const displaced=join(f.base,"displaced");await cp(f.directory,displaced,{recursive:true});await rm(join(f.directory,`plan-${later}`),{recursive:true}); // Synthetic loss injection only.
  assert.equal((await f.handler().POST(f.post(f.planBody,f.a,{"Idempotency-Key":crypto.randomUUID()}))).status,503);assert.equal(f.calls(),2);
  await assert.rejects(restoreOperations(f.directory,backup,true),/MISSING_LATEST/);await assert.rejects(verifyRecovery(f.directory,true,true),/RECOVERY_REQUIRED/);
  assert.ok(await readFile(join(f.directory+".claims",`plan-${later}`,"claim.json")));
});
test("full backup restores missing receipts while preserving index, pending claims require quarantine",async t=>{
  const f=await fixture(t);await f.plan();const store=operationStore(f.directory),pending=crypto.randomUUID();await store.claim("plan",pending,"a".repeat(64),"b".repeat(64));const backup=join(f.base,"complete-backup");await backupOperations(f.directory,backup);
  await rm(f.directory,{recursive:true});const result=await restoreOperations(f.directory,backup,true);assert.equal(result.restored,2);
  await assert.rejects(verifyRecovery(f.directory,true,true),/RECONCILIATION/);
  const before=await readFile(join(f.directory,`plan-${pending}`,"record.json"));await quarantineOperation(f.directory,"plan",pending,"NOT-LIVE operator confirmed uncertainty",true);assert.deepEqual(await readFile(join(f.directory,`plan-${pending}`,"record.json")),before);
  await verifyRecovery(f.directory,true,true);assert.equal((await store.read("plan",pending)).state,"uncertain");assert.equal(await store.claim("plan",pending,"a".repeat(64),"b".repeat(64)),null);
});
test("backup tampering and owner/index loss are never accepted as recovery",async t=>{
  const f=await fixture(t);await f.plan();const backup=join(f.base,"backup");await backupOperations(f.directory,backup);
  await writeFile(join(backup,"receipts",`plan-${f.id}`,"record.json"),"{}");await assert.rejects(restoreOperations(f.directory,backup,true),/HASH_MISMATCH/);
  await assert.rejects(restoreOperations(f.directory,backup,false),/STOPPED_ACK/);
});

test("offline CLI initializes, backs up and verifies a production store without provider credentials", async t => {
  const f = await fixture(t), cli = new URL("../scripts/research-operation-store.mjs", import.meta.url).pathname;
  f.id = f.id.toUpperCase(); // Valid external UUID spelling must also survive backup/restore.
  const run = args => promisify(execFile)(process.execPath, ["--experimental-strip-types", cli, ...args], { env: { ...process.env, NODE_ENV: "production", DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "" } });
  assert.equal(JSON.parse((await run(["init", f.directory])).stdout).modelRequests, 0);
  const store = operationStore(f.directory), record = await store.claim("plan", f.id, "a".repeat(64), "b".repeat(64));
  await store.complete("plan", f.id, record, Response.json({ fixture: "NOT-LIVE" }));
  const backup = join(f.base, "cli-backup"); assert.equal(JSON.parse((await run(["backup", f.directory, backup])).stdout).operations, 1);
  await rm(f.directory, { recursive: true });
  assert.equal(JSON.parse((await run(["restore", f.directory, backup, "--services-stopped"])).stdout).restored, 1);
  assert.equal(JSON.parse((await run(["verify", f.directory, "--acknowledge-recovery", "--services-stopped"])).stdout).status, "verified-admission-enabled");
  await assert.rejects(run(["init", process.cwd()+"/unsafe-store"]), /INSIDE_CHECKOUT/);
});
test("abandoned writer locks require stopped services, dead PID and an append-only recovery hold", async t => {
  const f = await fixture(t); await f.plan(); const store = operationStore(f.directory), lock = join(store.guard, ".writer-lock");
  await mkdir(lock, { mode: 0o700 }); await writeFile(join(lock, "holder.json"), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
  await assert.rejects(store.releaseAbandonedLock(false, "NOT-LIVE test"), /ACK/);
  await assert.rejects(store.releaseAbandonedLock(true, "NOT-LIVE test"), /ALIVE/);
  await writeFile(join(lock, "holder.json"), JSON.stringify({ pid: 2147483647 }));
  assert.equal((await store.releaseAbandonedLock(true, "NOT-LIVE dead holder")).status, "lock-released-held-awaiting-reconciliation");
  await assert.rejects(store.read("plan", f.id), /RECOVERY_REQUIRED/);
  await verifyRecovery(f.directory, true, true); assert.equal((await store.read("plan", f.id)).state, "completed");
});
test("a receipt rolled back from completed to running is refused even with the original owner", async t => {
  const f = await fixture(t), store = operationStore(f.directory); await store.initialize();
  const r = await store.claim("plan", f.id, "a".repeat(64), "b".repeat(64)), path = join(f.directory, `plan-${f.id}`, "record.json");
  const original = await readFile(path); await store.complete("plan", f.id, r, Response.json({ fixture: "NOT-LIVE" }));
  await writeFile(path, original); await assert.rejects(store.read("plan", f.id), /RECOVERY_REQUIRED/);
  await assert.rejects(store.claim("plan", crypto.randomUUID(), "a".repeat(64), "b".repeat(64)), /RECOVERY_REQUIRED/);
});
