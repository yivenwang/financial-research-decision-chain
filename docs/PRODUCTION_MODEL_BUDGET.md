# Production model resource protection — 2026-10-16

The public competition mode still issues a server-signed anonymous visitor cookie. Both Memo POST and Question POST require that verified session. No account, access-code form or email step is added to open mode. A shared Bearer remains useful for configuration GET only; it cannot own a paid request.

## Enforced bounds

- Both provider paths validate the **complete outgoing JSON wire** before fetch: UTF-8 byte length + 4096 framing reserve must be at most 32768. This is a conservative local estimate, not an exact provider tokenizer.
- Existing provider settings stay unchanged: DeepSeek output at most 6000 tokens / 150 seconds, OpenAI 4000 / 90 seconds, no automatic provider retry.
- One shared persistent ledger permits **240 provider attempts over its entire lifetime**, at most **24 per verified visitor in a rolling hour**, **30 globally in a rolling minute**, and **one in-flight attempt across Node processes** on the same local filesystem.
- Claims are fsynced before fetch. HTTP 429/5xx, timeout, cancellation uncertainty, malformed responses and failed content validation do not refund the claim. New cookies, process restarts, releases and midnight do not reset the lifetime count.
- The returned token usage is checked against the input estimate and original output ceiling. Invalid or over-budget usage cannot become accepted content; available usage metadata is retained.
- Missing configuration, uninitialized/corrupt ledger, unsafe file modes, disk pressure, unresolved attempt or abandoned writer lock fail closed. There is no environment or HTTP switch to disable production protection.

The ledger records only an attempt UUID, time, visitor hash, provider/model, wire hash, input/output ceilings, sanitized outcome and reported usage. It does not record API keys, cookies, tickets, prompts, uploaded documents or research text.

## Initialize and inspect

Use the same operating-system UID that runs Next, with an existing private parent directory outside the checkout. The current `RESEARCH_RUN_DIRECTORY` operation store remains separate; this tool uses its sibling `DIRECTORY.model-budget`.

```sh
cd /path/to/beacon/apps/web
node --experimental-strip-types scripts/model-budget-store.mjs init /absolute/persistent/research-runs
node --experimental-strip-types scripts/model-budget-store.mjs inspect /absolute/persistent/research-runs
```

Run `init` once before the first production start. It refuses a nonempty or previously initialized directory. Keep `RESEARCH_RUN_DIRECTORY` stable across releases and share the same filesystem between Node workers. The directory must be 0700 and each metadata file 0600, owned by the service UID; symbolic-link roots/records and hard-linked records are refused. Do not point this ledger at the existing receipt or `.claims` directory.

`inspect` reports reserved/remaining attempts, unresolved attempts, unknown usage and known token totals. Both commands make zero provider requests. They do not offer reset, refund, deletion, unlock or uncertain-operation release.

## Release, backup and recovery

Back up the budget directory together with current operation receipts using the existing trusted operator backup process. Retain the newest ledger through deployment and rollback. **Never delete, recreate or restore an older budget ledger to recover quota.** A simultaneous filesystem rollback is not independently detectable by an application on that same filesystem; provider billing remains an external record.

After a process crash leaves an unresolved attempt or writer lock, paid calls intentionally remain blocked. An operator must stop relevant workers, preserve the original directory, reconcile the pending attempt against provider billing and determine a separately reviewed recovery action. Do not automatically expire the claim or interpret absent usage as free. No destructive recovery action is part of this change.

At exhaustion, ordinary read-only research, local PDF parsing, evidence, valuation/decision display and historical records remain available. Paid generation returns a clear resource-protection failure. Increasing/resetting the finite allowance is an explicit operator decision beyond this audit change.

## Limits of the claim

These controls bound provider attempts and requested/checked token exposure. They are **not a currency-denominated hard billing cap**: provider pricing, exact tokenization, upstream billing on failed/cancelled requests and account-side limits remain external dependencies. Historical USD estimates from the six-request acceptance harness are not reused as production billing authorization.

Browser disconnection does not automatically revoke an already dispatched provider request; it stays bounded by the existing provider timeout and retains its reservation. A stolen signed cookie is still a bearer credential; full accounts, revocation and distributed storage are outside this minimal competition hardening.

The six-request manual acceptance workflow keeps its stricter independent budget, fixed-SHA approval, first-failure stop and no retries. Its isolated Next server must initialize this new sibling ledger before starting in production mode. Mock tests do not establish real provider billing correctness or live deployment acceptance.
