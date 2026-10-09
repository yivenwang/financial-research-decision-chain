import { mkdir, readdir, rename } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { operationStore, validOperationId } from "./research-operation.server.ts";

const keyValid = (key: string) => /^(plan|execute)-/.test(key) && validOperationId(key.slice(key.indexOf("-") + 1));
type Manifest = { schema: "question-backup.v1"; instanceId: string; createdAt: string; files: { path: string; sha256: string }[] };
const inside = (child: string, parent: string) => child === parent || (!relative(parent, child).startsWith("..") && !isAbsolute(relative(parent, child)));

// CLI only. Backups include private signed drafts; never serve/upload them publicly.
export async function backupOperations(directory: string, destination: string) {
  const store = operationStore(directory), target = resolve(destination);
  if (!isAbsolute(destination) || inside(target, store.root) || inside(target, store.guard) || inside(target, process.cwd())) throw new Error("BACKUP_PRIVATE_EXTERNAL_DIRECTORY_REQUIRED");
  return store.maintenance(async io => {
    const records = await io.inventory();
    await mkdir(target, { mode: 0o700 }); await io.privateDirectory(target);
    for (const part of ["receipts", "claims"]) await mkdir(join(target, part), { mode: 0o700 });
    const marker = (await io.readPrivate(join(store.guard, ".store.json"))).value;
    const manifest: Manifest = { schema: "question-backup.v1", instanceId: marker.instanceId, createdAt: new Date().toISOString(), files: [] };
    async function copyFile(source: string, path: string) {
      const raw = await io.readPrivate(source);
      const hash = await io.writePrivate(join(target, path), raw.value);
      if (hash !== raw.hash) throw new Error("BACKUP_HASH_MISMATCH");
      manifest.files.push({ path, sha256: hash });
    }
    for (const [part, source] of [["receipts", store.root], ["claims", store.guard]]) {
      await copyFile(join(source, ".store.json"), `${part}/.store.json`);
      for (const record of records) {
        await mkdir(join(target, part, record.key), { mode: 0o700 });
        for (const name of await readdir(join(source, record.key))) await copyFile(join(source, record.key, name), `${part}/${record.key}/${name}`);
      }
    }
    if (await io.exists(join(store.guard, ".recovery-hold.json"))) await copyFile(join(store.guard, ".recovery-hold.json"), "claims/.recovery-hold.json");
    if (await io.exists(join(store.guard, ".recovery-events"))) {
      await io.privateDirectory(join(store.guard, ".recovery-events"));
      await mkdir(join(target, "claims/.recovery-events"), { mode: 0o700 });
      for (const name of await readdir(join(store.guard, ".recovery-events"))) await copyFile(join(store.guard, ".recovery-events", name), `claims/.recovery-events/${name}`);
    }
    await io.writePrivate(join(target, "manifest.json"), manifest); await io.syncDir(target);
    return { status: "backup-complete", operations: records.length, running: records.filter(r => r.record.state === "running").length, instanceId: marker.instanceId };
  });
}

export async function restoreOperations(directory: string, source: string, servicesStopped: boolean) {
  if (!servicesStopped) throw new Error("SERVICES_STOPPED_ACK_REQUIRED");
  const store = operationStore(directory), backup = resolve(source);
  return store.maintenance(async io => {
    await io.privateDirectory(backup); await io.privateDirectory(join(backup, "receipts")); await io.privateDirectory(join(backup, "claims"));
    const manifest = (await io.readPrivate(join(backup, "manifest.json"))).value as Manifest;
    const marker = (await io.readPrivate(join(store.guard, ".store.json"))).value;
    if (manifest.schema !== "question-backup.v1" || manifest.instanceId !== marker.instanceId || !Array.isArray(manifest.files)) throw new Error("BACKUP_INSTANCE_MISMATCH");
    const files = new Map<string, { value: unknown; hash: string }>();
    for (const item of manifest.files) {
      if (typeof item.path !== "string" || !/^(receipts|claims)\/(\.store\.json|(?:plan|execute)-[a-f0-9-]{36}\/(record|claim|completed|uncertain)\.json|\.recovery-hold\.json|\.recovery-events\/[a-f0-9-]{36}\.json)$/i.test(item.path) || files.has(item.path)) throw new Error("BACKUP_PATH_INVALID");
      await io.privateDirectory(dirname(join(backup, item.path)));
      const raw = await io.readPrivate(join(backup, item.path));
      if (raw.hash !== item.sha256) throw new Error("BACKUP_HASH_MISMATCH");
      files.set(item.path, raw);
    }
    for (const part of ["receipts", "claims"]) if (JSON.stringify(files.get(`${part}/.store.json`)?.value) !== JSON.stringify(marker)) throw new Error("BACKUP_INSTANCE_MISMATCH");
    const keys = (await readdir(store.guard)).filter(keyValid); let restored = 0, preserved = 0;
    // The latest live index wins. We do not import or replace backup index entries.
    for (const key of keys) {
      await io.privateDirectory(join(store.guard, key));
      const completed = await io.exists(join(store.guard, key, "completed.json"));
      const expected = (await io.readPrivate(join(store.guard, key, completed ? "completed.json" : "claim.json"))).value.recordSha256;
      const target = join(store.root, key, "record.json");
      if (await io.exists(target)) {
        await io.privateDirectory(join(store.root, key));
        if ((await io.readPrivate(target)).hash !== expected) throw new Error("RESTORE_EXISTING_RECEIPT_CONFLICT");
        preserved++; continue;
      }
      const incoming = files.get(`receipts/${key}/record.json`);
      if (!incoming || incoming.hash !== expected) throw new Error("RESTORE_MISSING_LATEST_RECEIPT");
      if (!await io.exists(join(store.root, key))) await mkdir(join(store.root, key), { mode: 0o700 });
      await io.privateDirectory(join(store.root, key));
      await io.writePrivate(target, incoming.value); await io.syncDir(store.root); restored++;
    }
    for (const path of files.keys()) if (path.startsWith("receipts/plan-") || path.startsWith("receipts/execute-")) {
      if (!keys.includes(path.split("/")[1])) throw new Error("RESTORE_UNINDEXED_RECEIPT");
    }
    await io.inventory();
    if (!await io.exists(join(store.guard, ".recovery-events"))) await mkdir(join(store.guard, ".recovery-events"), { mode: 0o700 });
    await io.privateDirectory(join(store.guard, ".recovery-events"));
    await io.writePrivate(join(store.guard, ".recovery-events", `${randomUUID()}.json`), { event: "restore", at: new Date().toISOString(), restored, preserved, instanceId: marker.instanceId });
    return { status: "restored-held-awaiting-verification", restored, preserved };
  }, true);
}

export async function quarantineOperation(directory: string, phase: string, id: string, reason: string, servicesStopped: boolean) {
  if (!servicesStopped || !["plan", "execute"].includes(phase) || !validOperationId(id) || !reason.trim() || reason.length > 1000) throw new Error("QUARANTINE_ACK_AND_REASON_REQUIRED");
  const store = operationStore(directory), key = `${phase}-${id}`;
  return store.maintenance(async io => {
    const record = (await io.inventory()).find(r => r.key === key);
    if (!record || record.record.state !== "running") throw new Error("QUARANTINE_RUNNING_RECEIPT_REQUIRED");
    const raw = await io.readPrivate(join(store.root, key, "record.json"));
    await io.writePrivate(join(store.guard, key, "uncertain.json"), { event: "operator-quarantine", at: new Date().toISOString(), reason, recordSha256: raw.hash });
    return { status: "uncertain-claim-preserved-no-retry", phase, id };
  });
}

export async function verifyRecovery(directory: string, acknowledge: boolean, servicesStopped: boolean) {
  const store = operationStore(directory);
  return store.maintenance(async io => {
    const records = await io.inventory();
    const running = records.filter(r => r.record.state === "running").length;
    if (!acknowledge) return { status: "checked", held: await io.exists(join(store.guard, ".recovery-hold.json")), running, uncertain: records.filter(r => r.record.state === "uncertain").length };
    if (!servicesStopped || running) throw new Error("RECOVERY_RECONCILIATION_REQUIRED");
    if (await io.exists(join(store.guard, ".recovery-hold.json"))) {
      if (!await io.exists(join(store.guard, ".recovery-events"))) await mkdir(join(store.guard, ".recovery-events"), { mode: 0o700 });
      await io.privateDirectory(join(store.guard, ".recovery-events"));
      await rename(join(store.guard, ".recovery-hold.json"), join(store.guard, ".recovery-events", `${randomUUID()}.json`));
      await io.writePrivate(join(store.guard, ".recovery-events", `${randomUUID()}.json`), { event: "operator-recovery-verified", at: new Date().toISOString(), operations: records.length });
      await io.syncDir(store.guard); await io.syncDir(join(store.guard, ".recovery-events"));
    }
    return { status: "verified-admission-enabled", operations: records.length };
  });
}
