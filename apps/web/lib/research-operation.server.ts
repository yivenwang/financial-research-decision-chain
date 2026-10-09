import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";

export type OperationRecord = {
  schema: "question-operation.v1"; inputSha256: string; startedAt: string;
  state: "running" | "completed"; response?: { status: number; body: unknown };
};
export const validOperationId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);

// Atomic mkdir is the billing claim, shared by Node workers on this filesystem.
// A crash leaves a claim behind: absence of a result never authorizes a replay.
export function operationStore(explicitDirectory?: string) {
  const configuredDirectory = explicitDirectory || process.env.RESEARCH_RUN_DIRECTORY;
  const directory = configuredDirectory || join(process.cwd(), ".research-runs");
  const root = resolve(directory);
  const location = (phase: "plan" | "execute", id: string) => {
    if (process.env.NODE_ENV === "production" && (!configuredDirectory || !isAbsolute(configuredDirectory))) throw new Error("PERSISTENT_RUN_DIRECTORY_REQUIRED");
    if (!validOperationId(id)) throw new Error("OPERATION_ID_INVALID");
    return join(root, `${phase}-${id}`);
  };
  return {
    async read(phase: "plan" | "execute", id: string): Promise<OperationRecord | null> {
      const dir = location(phase, id);
      try {
        const record = JSON.parse(await readFile(join(dir, "record.json"), "utf8"));
        if (record?.schema !== "question-operation.v1" || !["running", "completed"].includes(record.state) || !/^[a-f0-9]{64}$/.test(record.inputSha256) || !Number.isFinite(Date.parse(record.startedAt)) || record.state === "completed" && (!record.response || !Number.isInteger(record.response.status))) throw new Error("OPERATION_RECORD_INVALID");
        return record;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        try { await stat(dir); } catch (dirError) { if ((dirError as NodeJS.ErrnoException).code === "ENOENT") return null; throw dirError; }
        throw new Error("OPERATION_INTERRUPTED");
      }
    },
    async claim(phase: "plan" | "execute", id: string, inputSha256: string) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const dir = location(phase, id);
      try { await mkdir(dir, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return null; throw error; }
      const record: OperationRecord = { schema: "question-operation.v1", inputSha256, startedAt: new Date().toISOString(), state: "running" };
      await writeFile(join(dir, "record.json"), JSON.stringify(record), { flag: "wx", mode: 0o600 });
      return record;
    },
    async complete(phase: "plan" | "execute", id: string, record: OperationRecord, response: Response) {
      const result: OperationRecord = { ...record, state: "completed", response: { status: response.status, body: await response.clone().json() } };
      const dir = location(phase, id);
      await writeFile(join(dir, "completed.tmp"), JSON.stringify(result), { flag: "wx", mode: 0o600 });
      await rename(join(dir, "completed.tmp"), join(dir, "record.json"));
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
