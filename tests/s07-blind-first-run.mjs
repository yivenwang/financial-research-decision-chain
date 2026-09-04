import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const parser = await import(new URL("../lib/parser-v04.ts", import.meta.url));
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const FROZEN_COMMIT = "e34b0a5044e362b7bbd176102b8790bec6c167c9";
const source = {
  sourceId: "S-07",
  period: "2025H1",
  url: "https://static.cninfo.com.cn/finalpage/2025-08-29/1224614835.PDF",
};

const response = await fetch(source.url, {
  redirect: "follow",
  headers: {
    "user-agent":
      "Mozilla/5.0 (compatible; FinanceCompetitionBlindTest/0.4; +https://github.com/yivenwang/financial-research-decision-chain)",
    accept: "application/pdf,*/*;q=0.8",
  },
});
assert.equal(response.ok, true, `S-07 PDF fetch failed: ${response.status}`);
const pdfBytes = new Uint8Array(await response.arrayBuffer());
assert.ok(pdfBytes.byteLength > 10_000, "S-07 PDF unexpectedly small");
const pdfSha256 = createHash("sha256").update(pdfBytes).digest("hex");

const document = await pdfjs.getDocument({ data: pdfBytes }).promise;
const items = [];
for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  for (const raw of content.items) {
    if (typeof raw?.str !== "string" || !Array.isArray(raw?.transform)) continue;
    const x = Number(raw.transform[4]);
    const y = Number(raw.transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    items.push({
      str: raw.str,
      x,
      y,
      page: pageNumber,
      width: typeof raw.width === "number" ? raw.width : undefined,
    });
  }
}

const result = parser.parseFinancialReport(items, source);
assert.equal(result.source.sourceId, "S-07");

await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/S07_FIRST_RUN_FROZEN.json",
  JSON.stringify(
    {
      protocol: "Blind Test 02 / first run before human truth comparison",
      frozenCommit: FROZEN_COMMIT,
      source,
      pdfSha256,
      pdfBytes: pdfBytes.byteLength,
      pageCount: document.numPages,
      textItemCount: items.length,
      firstRun: {
        metrics: result.metrics,
        issues: result.issues,
        blockers: result.blockers,
        canPromoteToEvidence: result.canPromoteToEvidence,
      },
    },
    null,
    2,
  ),
);

console.log("S-07 first-run artifact saved. Do not modify parser before artifact review.");
