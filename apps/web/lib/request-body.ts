export class BodyReadError extends Error {
  code: "BODY_TOO_LARGE" | "BODY_TIMEOUT" | "BODY_ABORTED" | "BODY_EMPTY";
  constructor(code: BodyReadError["code"]) {
    super(code);
    this.code = code;
    this.name = code === "BODY_TIMEOUT" ? "TimeoutError" : code === "BODY_ABORTED" ? "AbortError" : "BodyReadError";
  }
}

// Bound memory and wall time even without Content-Length or after headers arrive.
export async function readBoundedJson(source: Request | Response, maxBytes: number, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<unknown> {
  const declared = source.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) throw new BodyReadError("BODY_TOO_LARGE");
  const reader = source.body?.getReader();
  if (!reader) throw new BodyReadError("BODY_EMPTY");
  const signal = options.signal ?? (source instanceof Request ? source.signal : undefined);
  if (signal?.aborted) { void reader.cancel().catch(() => {}); reader.releaseLock(); throw new BodyReadError("BODY_ABORTED"); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStopped: (reason: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectStopped = reject; });
  const stop = (error: Error) => {
    rejectStopped(error);
    // Do not await a potentially uncooperative underlying cancellation hook.
    void reader.cancel(error).catch(() => {});
  };
  const onAbort = () => stop(new BodyReadError("BODY_ABORTED"));
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    timer = setTimeout(() => stop(new BodyReadError("BODY_TIMEOUT")), options.timeoutMs ?? (source instanceof Request ? 10000 : 150000));
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new BodyReadError("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
