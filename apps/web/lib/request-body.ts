// Bound memory and wall time even without Content-Length or after headers arrive.
export async function readBoundedJson(source: Request | Response, maxBytes: number, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<unknown> {
  const failure = (code: string) => Object.assign(new Error(code), {
    code, name: code === "BODY_TIMEOUT" ? "TimeoutError" : code === "BODY_ABORTED" ? "AbortError" : "BodyReadError",
  });
  const declared = source.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    void source.body?.cancel().catch(() => {});
    throw failure("BODY_TOO_LARGE");
  }
  const reader = source.body?.getReader();
  if (!reader) throw failure("BODY_EMPTY");
  const signal = options.signal ?? (source instanceof Request ? source.signal : undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStopped: (reason: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectStopped = reject; });
  const onAbort = () => rejectStopped(failure("BODY_ABORTED"));
  let size = 0;
  let finished = false;
  const chunks: Uint8Array[] = [];
  try {
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) throw failure("BODY_ABORTED");
    timer = setTimeout(() => rejectStopped(failure("BODY_TIMEOUT")), options.timeoutMs ?? (source instanceof Request ? 10000 : 150000));
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) { finished = true; break; }
      size += value.byteLength;
      if (size > maxBytes) throw failure("BODY_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (error) {
    if (error instanceof Error) Object.assign(error, { code: "BODY_INVALID_JSON" });
    throw error;
  }
}
