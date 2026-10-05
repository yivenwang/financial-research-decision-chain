import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectResearchBrowserCapabilities,
  missingResearchBrowserCapabilities,
  requireResearchBrowserCapabilities,
  researchBrowserIssue,
  runResearchBrowserOperation,
} from "../lib/research-browser.ts";
import { writeStoredVersions } from "../lib/research-versions.ts";

const ready = { secure: true, hashing: true, ids: true, locks: true };
const cases = [
  ["secure", "window.isSecureContext"],
  ["hashing", "crypto.subtle"],
  ["ids", "crypto.randomUUID"],
  ["locks", "navigator.locks"],
];

function installBrowser(capabilities, counters) {
  const previous = globalThis.window;
  globalThis.window = {
    isSecureContext: capabilities.secure,
    crypto: {
      subtle: capabilities.hashing ? globalThis.crypto.subtle : undefined,
      randomUUID: capabilities.ids ? globalThis.crypto.randomUUID.bind(globalThis.crypto) : undefined,
    },
    navigator: capabilities.locks ? { locks: { request: async (_name, operation) => {
      counters.locks += 1;
      return operation();
    } } } : {},
    localStorage: {
      getItem: () => { counters.reads += 1; return null; },
      setItem: () => { counters.writes += 1; },
    },
    dispatchEvent() {},
  };
  return () => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  };
}

test("the unified preflight detects the exact four browser guarantees", () => {
  for (const [missing, api] of cases) {
    const counters = { reads: 0, writes: 0, locks: 0 };
    const restore = installBrowser({ ...ready, [missing]: false }, counters);
    try {
      const detected = inspectResearchBrowserCapabilities();
      assert.deepEqual(missingResearchBrowserCapabilities(detected), [missing]);
      assert.match(researchBrowserIssue(detected), new RegExp(api.replaceAll(".", "\\.")));
      assert.throws(() => requireResearchBrowserCapabilities(), /操作已阻断/);
    } finally {
      restore();
    }
  }
});

test("missing capability blocks persistent research writes before storage is read or changed", () => {
  for (const [missing] of cases) {
    const counters = { reads: 0, writes: 0, locks: 0 };
    const restore = installBrowser({ ...ready, [missing]: false }, counters);
    try {
      assert.throws(() => writeStoredVersions([]), /未写入研究记录/);
      assert.deepEqual(counters, { reads: 0, writes: 0, locks: 0 });
    } finally {
      restore();
    }
  }
});

test("missing capability blocks the guarded model operation callback", async () => {
  for (const [missing] of cases) {
    let modelRequests = 0;
    await assert.rejects(
      runResearchBrowserOperation(async () => { modelRequests += 1; }, { ...ready, [missing]: false }),
      /未调用模型/,
    );
    assert.equal(modelRequests, 0);
  }
});

test("full capability support permits the guarded operation and persistent write", async () => {
  const counters = { reads: 0, writes: 0, locks: 0 };
  const restore = installBrowser(ready, counters);
  try {
    assert.deepEqual(inspectResearchBrowserCapabilities(), ready);
    assert.equal(researchBrowserIssue(), null);
    let operations = 0;
    await runResearchBrowserOperation(async () => { operations += 1; writeStoredVersions([]); });
    assert.equal(operations, 1);
    assert.equal(counters.writes, 1);
  } finally {
    restore();
  }
});
