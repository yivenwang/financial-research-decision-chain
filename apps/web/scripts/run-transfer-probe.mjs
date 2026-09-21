import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFinancialReportV06Strict } from "../../../lib/parser-v06-strict.ts";

const [pdfPath, metadataPath, outputPath] = process.argv.slice(2);
assert.ok(pdfPath && metadataPath && outputPath, "Provide PDF, registered metadata and new output directory");
const source = JSON.parse(await readFile(resolve(metadataPath), "utf8"));
assert.match(source.sourceId ?? "", /^XFER-[A-Za-z0-9-]+$/);
assert.ok(source.company && source.period && /^https:\/\//.test(source.url ?? ""));
assert.match(source.pdfSha256 ?? "", /^[a-f0-9]{64}$/);
const bytes = await readFile(resolve(pdfPath));
const digest = x => createHash("sha256").update(x).digest("hex");
assert.equal(digest(bytes), source.pdfSha256, "Source differs from registered PDF");
const out = resolve(outputPath); await mkdir(out);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const record = { schemaVersion: "transfer-probe.v1", startedAt: new Date().toISOString(), source,
  codeSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" }).trim(),
  workingTreeClean: !execFileSync("git", ["status", "--porcelain"], { cwd: appRoot, encoding: "utf8" }).trim(),
  parser: "V0.6-strict", modelRequests: 0, financialRulesChanged: false, humanReview: "pending" };
await writeFile(resolve(out, "registration.json"), JSON.stringify(record, null, 2), { flag: "wx" });
await writeFile(resolve(out, "source.pdf"), bytes, { flag: "wx" });
try {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const items = [];
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      for (const raw of content.items) if (typeof raw.str === "string" && Array.isArray(raw.transform)) {
        const x = Number(raw.transform[4]), y = Number(raw.transform[5]);
        if (Number.isFinite(x) && Number.isFinite(y)) items.push({ str: raw.str, x, y, page, width: raw.width });
      }
    }
  } finally { await doc.destroy(); }
  const serializedItems = JSON.stringify(items);
  await writeFile(resolve(out, "coordinates.json"), serializedItems, { flag: "wx" });
  const result = parseFinancialReportV06Strict(items, { sourceId: source.sourceId, period: source.period, url: source.url });
  await writeFile(resolve(out, "first-output.json"), JSON.stringify({ ...record, finishedAt: new Date().toISOString(),
    coordinatesSha256: digest(serializedItems), result, status: result.canPromoteToEvidence ? "PARSED_REVIEW_PENDING" : "BLOCKED_REVIEW_REQUIRED",
    limitation: "Parser-only probe. Company, period, original values and error classification require independent review; no Anker decision chain was run." }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ status: result.canPromoteToEvidence ? "PARSED_REVIEW_PENDING" : "BLOCKED_REVIEW_REQUIRED", blockers: result.blockers.length, modelRequests: 0 }));
} catch (error) {
  await writeFile(resolve(out, "execution-failure.json"), JSON.stringify({ ...record, status: "EXECUTION_FAILED", finishedAt: new Date().toISOString(),
    error: { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message.slice(0, 2000) : "Execution failed" } }, null, 2), { flag: "wx" });
  process.exitCode = 1;
}
