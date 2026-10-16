import { modelBudgetStore } from "../lib/model-budget.server.ts";

// Offline, metadata-only commands. No credential loading, provider request,
// reset, refund, unlock, deletion or recovery mutation is exposed here.
const [command, runDirectory, ...extra] = process.argv.slice(2);
try {
  if (!runDirectory?.startsWith("/") || extra.length || !["init", "inspect"].includes(command)) throw new Error("MODEL_BUDGET_USAGE_INIT_OR_INSPECT_ABSOLUTE_RUN_DIRECTORY");
  const store = modelBudgetStore(`${runDirectory}.model-budget`);
  if (command === "init") await store.initialize();
  console.log(JSON.stringify({ status: command === "init" ? "initialized-private-model-budget" : "inspected-model-budget", ...await store.inspect(), modelRequests: 0 }));
} catch (error) {
  const code = error instanceof Error && /^MODEL_BUDGET_[A-Z_]+$/.test(error.message) ? error.message : "MODEL_BUDGET_MANAGEMENT_FAILED";
  console.error(JSON.stringify({ code, modelRequests: 0 })); process.exitCode = 1;
}
