import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rmdir, statfs } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

// A finite, persistent provider-attempt allowance. This is not a currency cap.
// No clock rollover, new session, failure or unknown bill automatically refunds it.
export const MODEL_BUDGET_LIMITS = Object.freeze({ attempts: 240, visitorPerHour: 24, globalPerMinute: 30, inputEstimate: 32768, framingReserve: 4096 });
type Usage = { inputTokens: number; outputTokens: number; totalTokens: number };
type Metadata = { ownerSha256: string; provider: "deepseek" | "openai"; model: string; maxOutputTokens: number };
type Claim = Metadata & { schema: "model-budget-attempt.v1"; id: string; startedAt: number; inputEstimate: number; wireSha256: string };
type Result = { schema: "model-budget-result.v1"; id: string; finishedAt: number; outcome: "completed" | "failed"; failureCode: string | null; usage: Usage | null };
type Limits = { [Key in keyof typeof MODEL_BUDGET_LIMITS]: number };
export type ModelBudgetReservation = { finish: (usage: Usage | null, failureCode: string | null) => Promise<void> };
export type ModelBudgetStore = { reserve: (claim: Omit<Claim, "schema" | "id" | "startedAt">) => Promise<ModelBudgetReservation> };
type Options = { now?: () => number; limits?: Partial<Record<"attempts" | "visitorPerHour" | "globalPerMinute", number>> };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const validHash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validId = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
const within = (child: string, parent: string) => child === parent || (!relative(parent, child).startsWith("..") && !isAbsolute(relative(parent, child)));
const fail = (code: string): never => { throw new Error(code); };

export function modelBudgetStore(directory: string, options: Options = {}) {
  const root = resolve(directory);
  const uid = process.getuid?.();
  const limits: Limits = { ...MODEL_BUDGET_LIMITS, ...options.limits };
  for (const key of ["attempts", "visitorPerHour", "globalPerMinute"] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > MODEL_BUDGET_LIMITS[key]) fail("MODEL_BUDGET_CONFIGURATION_INVALID");
  }
  const now = options.now ?? Date.now;
  async function privateDirectory(path: string) {
    const value = await lstat(path);
    if (uid === undefined || value.isSymbolicLink() || !value.isDirectory() || value.uid !== uid || (value.mode & 0o777) !== 0o700) fail("MODEL_BUDGET_NOT_PRIVATE");
  }
  async function policy() {
    if (!isAbsolute(directory)) fail("MODEL_BUDGET_ABSOLUTE_DIRECTORY_REQUIRED");
    if (process.env.NODE_ENV === "production") {
      let checkout = process.cwd();
      for (let path = checkout; ; path = dirname(path)) {
        try { await lstat(join(path, ".git")); checkout = path; break; } catch (error) { if (!missing(error)) throw error; }
        if (path === dirname(path)) break;
      }
      if (within(root, checkout)) fail("MODEL_BUDGET_INSIDE_CHECKOUT");
    }
    for (let path = await realpath(dirname(root)); ; path = dirname(path)) {
      const value = await lstat(path);
      if ((value.mode & 0o022) && !(value.mode & 0o1000)) fail("MODEL_BUDGET_PARENT_NOT_PRIVATE");
      if (path === dirname(path)) break;
    }
  }
  async function syncDirectory() { const handle = await open(root, constants.O_RDONLY); try { await handle.sync(); } finally { await handle.close(); } }
  async function write(name: string, value: unknown) {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 4096) fail("MODEL_BUDGET_RECORD_INVALID");
    const handle = await open(join(root, name), constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY, 0o600);
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    await syncDirectory();
  }
  async function read(name: string) {
    const handle = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const value = await handle.stat();
      if (!value.isFile() || value.uid !== uid || (value.mode & 0o777) !== 0o600 || value.nlink !== 1 || value.size > 4096) fail("MODEL_BUDGET_NOT_PRIVATE");
      const bytes = await handle.readFile();
      if (bytes.length > 4096) fail("MODEL_BUDGET_RECORD_INVALID");
      return JSON.parse(bytes.toString("utf8"));
    } finally { await handle.close(); }
  }
  async function ensure() {
    await policy(); await privateDirectory(root);
    const marker = await read(".store.json");
    if (marker.schema !== "model-budget-store.v1" || !validId(marker.instanceId) || JSON.stringify(marker.limits) !== JSON.stringify(limits)) fail("MODEL_BUDGET_RECOVERY_REQUIRED");
  }
  async function lock<T>(action: () => Promise<T>) {
    const path = join(root, ".writer-lock");
    let acquired = false;
    for (let count = 0; count < 200; count++) {
      try { await mkdir(path, { mode: 0o700 }); acquired = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try { await privateDirectory(path); } catch (error) { if (!missing(error)) throw error; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    if (!acquired) fail("MODEL_BUDGET_LOCKED");
    try { return await action(); }
    finally { await rmdir(path); await syncDirectory(); }
  }
  async function inventory() {
    const names = await readdir(root);
    const claims: Claim[] = [], results = new Map<string, Result>();
    for (const name of names) {
      if ([".store.json", ".writer-lock"].includes(name)) continue;
      const match = /^(attempt|result)-([a-f0-9-]{36})\.json$/.exec(name);
      if (!match || !validId(match[2])) throw new Error("MODEL_BUDGET_RECOVERY_REQUIRED");
      const value = await read(name);
      if (value.id !== match[2]) fail("MODEL_BUDGET_RECORD_INVALID");
      if (match[1] === "attempt") {
        if (value.schema !== "model-budget-attempt.v1" || !validHash(value.ownerSha256) || !validHash(value.wireSha256) ||
          !["deepseek", "openai"].includes(value.provider) || typeof value.model !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(value.model) ||
          !Number.isSafeInteger(value.startedAt) || value.startedAt < 0 || !Number.isSafeInteger(value.inputEstimate) || value.inputEstimate < MODEL_BUDGET_LIMITS.framingReserve || value.inputEstimate > limits.inputEstimate ||
          value.maxOutputTokens !== (value.provider === "deepseek" ? 6000 : 4000)) fail("MODEL_BUDGET_RECORD_INVALID");
        claims.push(value);
      } else {
        if (value.schema !== "model-budget-result.v1" || !Number.isSafeInteger(value.finishedAt) || !["completed", "failed"].includes(value.outcome) ||
          value.failureCode !== null && (typeof value.failureCode !== "string" || !/^[A-Z][A-Z_0-9]{0,79}$/.test(value.failureCode)) ||
          value.usage !== null && !validUsage(value.usage)) fail("MODEL_BUDGET_RECORD_INVALID");
        results.set(value.id, value);
      }
    }
    if (claims.length > limits.attempts || [...results.keys()].some(id => !claims.some(claim => claim.id === id))) fail("MODEL_BUDGET_RECOVERY_REQUIRED");
    for (const claim of claims) if (results.has(claim.id) && results.get(claim.id)!.finishedAt < claim.startedAt) fail("MODEL_BUDGET_RECORD_INVALID");
    return { claims, results };
  }
  async function safe<T>(action: () => Promise<T>) {
    try { return await action(); }
    catch (error) { if (error instanceof Error && /^MODEL_BUDGET_[A-Z_]+$/.test(error.message)) throw error; return fail("MODEL_BUDGET_RECOVERY_REQUIRED"); }
  }
  return {
    root,
    async initialize() {
      return safe(async () => {
        await policy();
        try { await mkdir(root, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        await privateDirectory(root);
        if ((await readdir(root)).length) fail("MODEL_BUDGET_ALREADY_INITIALIZED");
        await write(".store.json", { schema: "model-budget-store.v1", instanceId: randomUUID(), limits });
      });
    },
    async inspect() {
      return safe(async () => { await ensure(); return lock(async () => {
        const { claims, results } = await inventory();
        return { schema: "model-budget-inspection.v1", attemptsReserved: claims.length, attemptsRemaining: limits.attempts - claims.length,
          inFlightOrUncertain: claims.filter(claim => !results.has(claim.id)).length, usageUnknown: claims.filter(claim => !results.get(claim.id)?.usage).length,
          knownInputTokens: [...results.values()].reduce((total, value) => total + (value.usage?.inputTokens ?? 0), 0),
          knownOutputTokens: [...results.values()].reduce((total, value) => total + (value.usage?.outputTokens ?? 0), 0), limits };
      }); });
    },
    async reserve(input: Omit<Claim, "schema" | "id" | "startedAt">): Promise<ModelBudgetReservation> {
      return safe(async () => { await ensure(); return lock(async () => {
        if (!validHash(input.ownerSha256) || !validHash(input.wireSha256)) fail("MODEL_BUDGET_OWNER_REQUIRED");
        if (!["deepseek", "openai"].includes(input.provider) || !/^[a-zA-Z0-9._-]{1,100}$/.test(input.model) ||
          !Number.isSafeInteger(input.inputEstimate) || input.inputEstimate < MODEL_BUDGET_LIMITS.framingReserve || input.inputEstimate > limits.inputEstimate ||
          input.maxOutputTokens !== (input.provider === "deepseek" ? 6000 : 4000)) fail("MODEL_BUDGET_RECORD_INVALID");
        const { claims, results } = await inventory();
        const at = now();
        if (!Number.isSafeInteger(at) || claims.some(claim => claim.startedAt > at)) fail("MODEL_BUDGET_CLOCK_INVALID");
        if (claims.length >= limits.attempts) fail("MODEL_BUDGET_EXHAUSTED");
        if (claims.some(claim => !results.has(claim.id))) fail("MODEL_BUDGET_BUSY");
        if (claims.filter(claim => claim.startedAt > at - 60000).length >= limits.globalPerMinute ||
          claims.filter(claim => claim.ownerSha256 === input.ownerSha256 && claim.startedAt > at - 3600000).length >= limits.visitorPerHour) fail("MODEL_BUDGET_RATE_LIMITED");
        const space = await statfs(root);
        if (Number(space.bavail) * Number(space.bsize) < 1024 * 1024 || Number(space.ffree) < 16) fail("MODEL_BUDGET_DISK_SPACE_REQUIRED");
        const claim: Claim = { schema: "model-budget-attempt.v1", id: randomUUID(), startedAt: at, ownerSha256: input.ownerSha256,
          wireSha256: input.wireSha256, inputEstimate: input.inputEstimate, provider: input.provider, model: input.model, maxOutputTokens: input.maxOutputTokens };
        await write(`attempt-${claim.id}.json`, claim);
        return { finish: async (usage: Usage | null, failureCode: string | null) => safe(async () => {
          await ensure(); return lock(async () => {
            const current = await inventory();
            if (!current.claims.some(value => JSON.stringify(value) === JSON.stringify(claim)) || current.results.has(claim.id)) fail("MODEL_BUDGET_RECOVERY_REQUIRED");
            const result: Result = { schema: "model-budget-result.v1", id: claim.id, finishedAt: Math.max(now(), claim.startedAt),
              outcome: failureCode ? "failed" : "completed", failureCode: failureCode && /^[A-Z][A-Z_0-9]{0,79}$/.test(failureCode) ? failureCode : failureCode ? "PROVIDER_FAILURE" : null,
              usage: validUsage(usage) ? usage : null };
            await write(`result-${claim.id}.json`, result);
          });
        }) };
      }); });
    },
  };
}
function validUsage(usage: Usage | null): usage is Usage {
  return Boolean(usage && [usage.inputTokens, usage.outputTokens, usage.totalTokens].every(value => Number.isSafeInteger(value) && value >= 0) && Number.isSafeInteger(usage.inputTokens + usage.outputTokens) && usage.totalTokens === usage.inputTokens + usage.outputTokens);
}
export function modelInputBudget(wire: string) {
  const wireBytes = Buffer.byteLength(wire, "utf8"), estimatedInputTokens = wireBytes + MODEL_BUDGET_LIMITS.framingReserve;
  if (estimatedInputTokens > MODEL_BUDGET_LIMITS.inputEstimate) fail("MODEL_BUDGET_INPUT_EXCEEDED");
  return { wireBytes, estimatedInputTokens };
}
export async function reserveModelBudget(wire: string, metadata: Metadata, dependencies: { budgetStore?: ModelBudgetStore; runDirectory?: string } = {}) {
  const inputBudget = modelInputBudget(wire);
  let store = dependencies.budgetStore;
  if (!store && process.env.NODE_ENV === "production") {
    const configured = dependencies.runDirectory ?? process.env.RESEARCH_RUN_DIRECTORY;
    if (!configured || !isAbsolute(configured)) fail("MODEL_BUDGET_ABSOLUTE_DIRECTORY_REQUIRED");
    store = modelBudgetStore(`${configured}.model-budget`);
  }
  const reservation = store ? await store.reserve({ ...metadata, inputEstimate: inputBudget.estimatedInputTokens, wireSha256: hash(wire) }) : null;
  return { inputBudget, finish: reservation?.finish ?? (async () => {}) };
}
export function modelBudgetFailureStatus(code: string | null | undefined) {
  return code === "MODEL_BUDGET_INPUT_EXCEEDED" ? 422 : /^(MODEL_BUDGET_(EXHAUSTED|BUSY|RATE_LIMITED|LOCKED))$/.test(code ?? "") ? 429 : code?.startsWith("MODEL_BUDGET_") ? 503 : null;
}
