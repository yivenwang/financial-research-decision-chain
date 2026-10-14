import { mkdir, readdir, lstat, open, rename, unlink, rmdir, statfs, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, isAbsolute, dirname, relative } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type OperationRecord = {
  schema: "question-operation.v2"; ownerSha256: string; inputSha256: string; startedAt: string;
  state: "running" | "completed" | "uncertain"; response?: { status: number; body: unknown };
};
type Phase = "plan" | "execute";
export type StoreOptions = {
  probeSpace?: () => Promise<{ bytes: number; inodes: number }>;
  beforeWrite?: (path: string) => Promise<void>;
  maxBytes?: number; minFreeBytes?: number; maxOperations?: number;
};
export const OPERATION_LIMITS = { recordBytes: 2 * 1024 * 1024, totalBytes: 1024 ** 3, minFreeBytes: 128 * 1024 * 1024, minFreeInodes: 1024, maxOperations: 1000 };
export const validOperationId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);
const digest = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const validHash = (x: unknown): x is string => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";
const within = (child: string, parent: string) => child === parent || (!relative(parent, child).startsWith("..") && !isAbsolute(relative(parent, child)));

// The sibling index is authoritative and never replaced by receipt restore.
// Its immutable claim/result hashes detect missing receipts and stale rollback.
export function operationStore(explicitDirectory?: string, options: StoreOptions = {}) {
  const configured = explicitDirectory || process.env.RESEARCH_RUN_DIRECTORY;
  const root = resolve(configured || join(process.cwd(), ".research-runs"));
  const guard = `${root}.claims`;
  const uid = process.getuid?.();
  async function exists(path: string) { try { await lstat(path); return true; } catch (e) { if (missing(e)) return false; throw e; } }
  async function privateDirectory(path: string) {
    const s = await lstat(path);
    if (uid === undefined || s.isSymbolicLink() || !s.isDirectory() || s.uid !== uid || (s.mode & 0o777) !== 0o700) throw new Error("OPERATION_DIRECTORY_NOT_PRIVATE");
  }
  async function pathPolicy() {
    if (process.env.NODE_ENV === "production" && (!configured || !isAbsolute(configured))) throw new Error("PERSISTENT_RUN_DIRECTORY_REQUIRED");
    if (process.env.NODE_ENV === "production") {
      let checkout = process.cwd();
      for (let p = checkout; ; p = dirname(p)) {
        if (await exists(join(p, ".git"))) { checkout = p; break; }
        if (p === dirname(p)) break;
      }
      if (within(root, checkout) || within(guard, checkout)) throw new Error("OPERATION_DIRECTORY_INSIDE_CHECKOUT");
    }
    // Trusted system symlinks such as macOS /var are canonicalized; writable
    // non-sticky parents are refused. The configured final directories cannot be links.
    for (let p = await realpath(dirname(root)); ; p = dirname(p)) {
      const s = await lstat(p);
      if ((s.mode & 0o022) && !(s.mode & 0o1000)) throw new Error("OPERATION_PARENT_NOT_PRIVATE");
      if (p === dirname(p)) break;
    }
  }
  async function syncDir(path: string) { const h = await open(path, constants.O_RDONLY); try { await h.sync(); } finally { await h.close(); } }
  async function writePrivate(path: string, value: unknown) {
    await options.beforeWrite?.(path);
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > OPERATION_LIMITS.recordBytes) throw new Error("OPERATION_RECORD_TOO_LARGE");
    const h = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
    await syncDir(dirname(path));
    return digest(bytes);
  }
  async function readPrivate(path: string) {
    const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await h.stat();
      if (uid === undefined || !s.isFile() || s.uid !== uid || (s.mode & 0o777) !== 0o600 || s.nlink !== 1 || s.size > OPERATION_LIMITS.recordBytes) throw new Error("OPERATION_FILE_NOT_PRIVATE");
      const bytes = await h.readFile();
      if (bytes.length > OPERATION_LIMITS.recordBytes) throw new Error("OPERATION_RECORD_TOO_LARGE");
      return { value: JSON.parse(bytes.toString("utf8")), hash: digest(bytes), bytes: bytes.length };
    } finally { await h.close(); }
  }
  async function initialize() {
    await pathPolicy();
    for (const p of [root, guard]) {
      if (await exists(p)) { await privateDirectory(p); if ((await readdir(p)).length) throw new Error("OPERATION_STORE_NOT_EMPTY"); }
      else { await mkdir(p, { mode: 0o700 }); await syncDir(dirname(p)); }
    }
    const marker = { schema: "question-store.v1", instanceId: randomUUID() };
    await writePrivate(join(guard, ".store.json"), marker);
    await writePrivate(join(root, ".store.json"), marker);
  }
  async function ensure() {
    await pathPolicy();
    if (!await exists(join(root, ".store.json")) || !await exists(join(guard, ".store.json"))) {
      if (process.env.NODE_ENV === "production") throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
      // Dev/test initialization only. Never adopt a nonempty legacy/lost store.
      if ((!await exists(root) || (await readdir(root)).length === 0) && !await exists(guard)) {
        try { await initialize(); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      }
    }
    await privateDirectory(root); await privateDirectory(guard);
    const a = (await readPrivate(join(root, ".store.json"))).value;
    const b = (await readPrivate(join(guard, ".store.json"))).value;
    if (a.schema !== "question-store.v1" || !validOperationId(a.instanceId) || JSON.stringify(a) !== JSON.stringify(b)) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
    if ((await lstat(root)).dev !== (await lstat(guard)).dev) throw new Error("OPERATION_FILESYSTEM_MISMATCH");
  }
  async function lock<T>(fn: () => Promise<T>): Promise<T> {
    const path = join(guard, ".writer-lock");
    let acquired = false;
    for (let i = 0; i < 200; i++) {
      try { await mkdir(path, { mode: 0o700 }); acquired = true; break; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; await privateDirectory(path); }
      await new Promise(r => setTimeout(r, 25));
    }
    if (!acquired) throw new Error("OPERATION_STORE_LOCKED");
    await writePrivate(join(path, "holder.json"), { pid: process.pid, startedAt: new Date().toISOString() });
    try { return await fn(); }
    finally { await unlink(join(path, "holder.json")); await rmdir(path); await syncDir(guard); }
  }
  function location(phase: Phase, id: string) {
    if (!["plan", "execute"].includes(phase) || !validOperationId(id)) throw new Error("OPERATION_ID_INVALID");
    return `${phase}-${id}`;
  }
  async function readOne(key: string): Promise<{ record: OperationRecord; bytes: number } | null> {
    const dir = join(root, key), anchor = join(guard, key);
    if (!await exists(dir) && !await exists(anchor)) return null;
    if (!await exists(dir) || !await exists(anchor)) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
    await privateDirectory(dir); await privateDirectory(anchor);
    const raw = await readPrivate(join(dir, "record.json"));
    const r = raw.value;
    if (r.schema !== "question-operation.v2" || !validHash(r.ownerSha256)) throw new Error("OPERATION_LEGACY_UNOWNED");
    if (!validHash(r.inputSha256) || !Number.isFinite(Date.parse(r.startedAt)) || !["running", "completed"].includes(r.state) || r.state === "completed" && (!r.response || !Number.isInteger(r.response.status) || r.response.status < 100 || r.response.status > 599)) throw new Error("OPERATION_RECORD_INVALID");
    const claim = (await readPrivate(join(anchor, "claim.json"))).value;
    if (claim.schema !== "question-claim.v1" || claim.ownerSha256 !== r.ownerSha256 || claim.inputSha256 !== r.inputSha256 || claim.startedAt !== r.startedAt) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
    const completed = await exists(join(anchor, "completed.json"));
    const expected = completed ? (await readPrivate(join(anchor, "completed.json"))).value : claim;
    if (expected.recordSha256 !== raw.hash || completed !== (r.state === "completed")) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
    if ((await readdir(dir)).some(n => n !== "record.json")) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
    if (await exists(join(anchor, "uncertain.json"))) {
      const marker = (await readPrivate(join(anchor, "uncertain.json"))).value;
      if (completed || marker.recordSha256 !== raw.hash) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
      return { record: { ...r, state: "uncertain" }, bytes: raw.bytes };
    }
    return { record: r, bytes: raw.bytes };
  }
  async function inventory() {
    const keys = new Set<string>();
    for (const p of [root, guard]) for (const name of await readdir(p)) {
      if ([".store.json", ".writer-lock", ".recovery-hold.json", ".recovery-events"].includes(name) && p === guard || name === ".store.json") continue;
      if (!/^(plan|execute)-[a-f0-9-]{36}$/i.test(name) || !validOperationId(name.slice(name.indexOf("-") + 1))) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
      keys.add(name);
    }
    if (keys.size > (options.maxOperations ?? OPERATION_LIMITS.maxOperations)) throw new Error("OPERATION_CAPACITY_EXCEEDED");
    const records = [];
    for (const key of keys) {
      const item = await readOne(key); if (!item) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
      const r = item.record;
      // Verify full bytes one record at a time, retaining only admission metadata.
      // A store at its disk quota must not retain all research responses in RAM.
      records.push({ key, bytes: item.bytes, record: { schema: r.schema, ownerSha256: r.ownerSha256, inputSha256: r.inputSha256, startedAt: r.startedAt, state: r.state } });
    }
    return records;
  }
  async function space() {
    const available = options.probeSpace ? await options.probeSpace() : await statfs(root).then(s => ({ bytes: Number(s.bavail) * Number(s.bsize), inodes: Number(s.ffree) }));
    if (available.bytes < (options.minFreeBytes ?? OPERATION_LIMITS.minFreeBytes) + OPERATION_LIMITS.recordBytes || available.inodes < OPERATION_LIMITS.minFreeInodes) throw new Error("OPERATION_DISK_SPACE_REQUIRED");
  }
  async function noHold() { if (await exists(join(guard, ".recovery-hold.json"))) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED"); }
  return {
    root, guard, initialize,
    async releaseAbandonedLock(servicesStopped: boolean, reason: string) {
      if (!servicesStopped || !reason.trim() || reason.length > 1000) throw new Error("LOCK_RELEASE_ACK_AND_REASON_REQUIRED");
      await ensure(); const path = join(guard, ".writer-lock"); await privateDirectory(path);
      const names = await readdir(path);
      if (names.some(n => n !== "holder.json")) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
      const holder = names.length ? (await readPrivate(join(path, "holder.json"))).value : null;
      if (holder) {
        if (!Number.isInteger(holder.pid) || holder.pid <= 0) throw new Error("OPERATION_LOCK_HOLDER_INVALID");
        try { process.kill(holder.pid, 0); throw new Error("OPERATION_LOCK_HOLDER_ALIVE"); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e; }
      }
      if (!await exists(join(guard, ".recovery-hold.json"))) await writePrivate(join(guard, ".recovery-hold.json"), { at: new Date().toISOString(), reason: "abandoned-lock" });
      if (!await exists(join(guard, ".recovery-events"))) await mkdir(join(guard, ".recovery-events"), { mode: 0o700 });
      await privateDirectory(join(guard, ".recovery-events"));
      await writePrivate(join(guard, ".recovery-events", `${randomUUID()}.json`), { event: "abandoned-lock-release", at: new Date().toISOString(), holder, reason });
      if (holder) await unlink(join(path, "holder.json"));
      await rmdir(path); await syncDir(guard);
      return { status: "lock-released-held-awaiting-reconciliation" };
    },
    async read(phase: Phase, id: string) {
      await ensure(); return lock(async () => { await noHold(); await inventory(); return (await readOne(location(phase, id)))?.record ?? null; });
    },
    async claim(phase: Phase, id: string, inputSha256: string, ownerSha256: string) {
      if (!validHash(inputSha256) || !validHash(ownerSha256)) throw new Error("OPERATION_OWNER_REQUIRED");
      const key = location(phase, id); await ensure();
      return lock(async () => {
        await noHold(); const records = await inventory();
        if (records.some(r => r.key === key)) return null;
        const reserved = records.reduce((n, r) => n + (r.record.state === "running" ? OPERATION_LIMITS.recordBytes : r.bytes), OPERATION_LIMITS.recordBytes);
        if (records.length >= (options.maxOperations ?? OPERATION_LIMITS.maxOperations) || reserved > (options.maxBytes ?? OPERATION_LIMITS.totalBytes)) throw new Error("OPERATION_CAPACITY_EXCEEDED");
        await space();
        const record: OperationRecord = { schema: "question-operation.v2", ownerSha256, inputSha256, startedAt: new Date().toISOString(), state: "running" };
        await mkdir(join(guard, key), { mode: 0o700 }); await syncDir(guard);
        await mkdir(join(root, key), { mode: 0o700 }); await syncDir(root);
        const hash = await writePrivate(join(root, key, "record.json"), record);
        await writePrivate(join(guard, key, "claim.json"), { schema: "question-claim.v1", ownerSha256, inputSha256, startedAt: record.startedAt, recordSha256: hash });
        return record;
      });
    },
    async complete(phase: Phase, id: string, record: OperationRecord, response: Response) {
      const key = location(phase, id); await ensure();
      return lock(async () => {
        await inventory(); const current = (await readOne(key))?.record;
        if (!current || current.state !== "running" || JSON.stringify(current) !== JSON.stringify(record)) throw new Error("OPERATION_COMPLETION_CONFLICT");
        await space();
        // Consume once; the caller returns a fresh replay of this persisted value,
        // never a response stream already involved in persistence reads.
        const result: OperationRecord = { ...record, state: "completed", response: { status: response.status, body: await response.json() } };
        const hash = await writePrivate(join(root, key, "completed.tmp"), result);
        // Anchor first; an interruption between these writes blocks the store.
        await writePrivate(join(guard, key, "completed.json"), { schema: "question-completion.v1", recordSha256: hash });
        await rename(join(root, key, "completed.tmp"), join(root, key, "record.json")); await syncDir(join(root, key));
        return result;
      });
    },
    // Management methods are CLI-only; there is no public recovery API.
    async inspect() { await ensure(); return lock(async () => ({ root, guard, held: await exists(join(guard, ".recovery-hold.json")), records: await inventory() })); },
    async maintenance<T>(action: (io: { inventory: typeof inventory; readPrivate: typeof readPrivate; writePrivate: typeof writePrivate; privateDirectory: typeof privateDirectory; syncDir: typeof syncDir; exists: typeof exists }) => Promise<T>, restoreMissingRoot = false) {
      if (restoreMissingRoot) {
        await pathPolicy(); await privateDirectory(guard);
        const marker = (await readPrivate(join(guard, ".store.json"))).value;
        if (marker.schema !== "question-store.v1" || !validOperationId(marker.instanceId)) throw new Error("OPERATION_STORE_RECOVERY_REQUIRED");
        if (!await exists(join(guard, ".recovery-hold.json"))) await writePrivate(join(guard, ".recovery-hold.json"), { at: new Date().toISOString(), reason: "explicit-restore" });
        if (!await exists(root)) { await mkdir(root, { mode: 0o700 }); await syncDir(dirname(root)); }
        await privateDirectory(root);
        if (!await exists(join(root, ".store.json"))) await writePrivate(join(root, ".store.json"), marker);
      }
      await ensure(); return lock(() => action({ inventory, readPrivate, writePrivate, privateDirectory, syncDir, exists }));
    },
  };
}

const lockKey = Symbol.for("beacon.model-http-in-flight");
export function claimModelSlot() {
  const state = globalThis as typeof globalThis & { [lockKey]?: boolean };
  if (state[lockKey]) return null;
  state[lockKey] = true;
  return () => { state[lockKey] = false; };
}
