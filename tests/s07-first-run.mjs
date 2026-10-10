import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

const parser = await import(new URL("../lib/parser-v04.ts", import.meta.url));
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const S07 = {
  sourceId: "S-07",
  period: "2025H1",
  url: "https://static.cninfo.com.cn/finalpage/2025-08-29/1224614835.PDF",
};

async function fetchPdf(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "financial-research-decision-chain-blind-test/0.4" },
  });
  if (!response.ok) throw new Error(`GET ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function extractPdfTextItems(bytes) {
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const items = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (typeof raw.str !== "string" || !Array.isArray(raw.transform)) continue;
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
  return { items, pageCount: document.numPages };
}

test("Blind Test 02 S-07 frozen-parser first run", async () => {
  const bytes = await fetchPdf(S07.url);
  const extraction = await extractPdfTextItems(bytes);
  const result = parser.parseFinancialReport(extraction.items, S07);

  await mkdir("artifacts", { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    parserVersion: "V0.4-frozen-main",
    source: S07,
    pageCount: extraction.pageCount,
    textItemCount: extraction.items.length,
    result,
    discipline: {
      expectedValuesEmbedded: false,
      parserModifiedForS07: false,
      humanTruthComparisonPerformed: false,
    },
  };
  await writeFile(
    "artifacts/s07-first-run.json",
    JSON.stringify(payload, null, 2),
  );

  console.log(JSON.stringify(payload, null, 2));
});
