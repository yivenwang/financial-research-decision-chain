// Shared public-export guard; no environment access, filesystem or transport.
export function assertArchiveSafe(value: unknown, secrets: unknown[]) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw new Error("ARCHIVE_SERIALIZATION_FAILED"); }
  const text = encoded;
  if (typeof text !== "string") throw new Error("ARCHIVE_SERIALIZATION_FAILED");
  if (secrets.some(secret => typeof secret === "string" && secret.length && (text.includes(secret) || text.includes(JSON.stringify(secret).slice(1, -1))))) throw new Error("ARCHIVE_SECRET_BLOCKED");
  const forbidden = new Set(["cookie", "authorization", "ticket", "apikey", "sessionsecret"]);
  const credentialKey = (key: string) => forbidden.has(key.normalize("NFKC").replace(/[\s_.\p{Pd}\p{Cf}]/gu, "").toLowerCase());
  const queue = [{ value, depth: 0 }];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.depth > 64 || queue.length > 100000) throw new Error("ARCHIVE_STRUCTURE_LIMIT");
    const item = current.value;
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("ARCHIVE_INVALID_NUMBER");
    if (typeof item === "string") {
      if (secrets.some(secret => typeof secret === "string" && secret.length && item.includes(secret))) throw new Error("ARCHIVE_SECRET_BLOCKED");
      // Decode complete nested JSON strings/objects; also catch quoted fields in surrounding diagnostic prose.
      for (const match of item.matchAll(/(?:\\*["'])([^"'\n]{1,80})(?:\\*["'])\s*:/g)) {
        let key = match[1].replace(/\\+$/g, "");
        try { key = JSON.parse('"' + key + '"'); } catch { /* Literal key still receives the same normalization. */ }
        if (credentialKey(key)) throw new Error("ARCHIVE_CREDENTIAL_FIELD_BLOCKED");
      }
      if (/^\s*[\[{\"]/.test(item)) {
        try { const decoded = JSON.parse(item); if (decoded !== item) queue.push({ value: decoded, depth: current.depth + 1 }); }
        catch { /* Non-JSON prose has already had its quoted keys and secret values checked. */ }
      }
    } else if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) {
        if (credentialKey(key)) throw new Error("ARCHIVE_CREDENTIAL_FIELD_BLOCKED");
        queue.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}
