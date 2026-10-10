import { operationStore } from "../lib/research-operation.server.ts";
import { backupOperations, restoreOperations, quarantineOperation, verifyRecovery } from "../lib/research-operation-maintenance.server.ts";

// Offline management only. This executable neither loads keys nor calls a model.
const [command, directory, argument, ...flags] = process.argv.slice(2);
const stopped = flags.includes("--services-stopped") || argument === "--services-stopped";
try {
  if (!directory?.startsWith("/")) throw new Error("ABSOLUTE_DIRECTORY_REQUIRED");
  let result;
  if (command === "init") { await operationStore(directory).initialize(); result = { status: "initialized-empty-private-store" }; }
  else if (command === "backup") result = await backupOperations(directory, argument);
  else if (command === "restore") result = await restoreOperations(directory, argument, stopped);
  else if (command === "verify") result = await verifyRecovery(directory, flags.includes("--acknowledge-recovery") || argument === "--acknowledge-recovery", stopped);
  else if (command === "quarantine") result = await quarantineOperation(directory, argument, flags[0], flags[1] ?? "", stopped);
  else if (command === "unlock") result = await operationStore(directory).releaseAbandonedLock(stopped, argument ?? "");
  else throw new Error("USAGE_INIT_BACKUP_RESTORE_VERIFY_QUARANTINE_UNLOCK");
  console.log(JSON.stringify({ ...result, modelRequests: 0 }));
} catch (error) {
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "STORE_MANAGEMENT_FAILED";
  console.error(JSON.stringify({ code, modelRequests: 0 })); process.exitCode = 1;
}
