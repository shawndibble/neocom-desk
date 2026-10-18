# Scope decisions — A contract's wallet change rides on the contract alert

_Recorded 2026-10-17._

- **A wallet change a contract caused is shown on the contract alert, not as a
  second alert.** A contract finishing moves ISK, so a Character with both
  Contract Completed and Wallet Balance Changed on heard about one thing
  twice. ESI names the cause on the journal line (`context_id_type:
'contract_id'`, `context_id`, a `contract_*` `ref_type`), and
  `engine/walletCause.ts` uses it to fold the line into the contract alert:
  "…contract was completed. Wallet balance changed by 476,740,542 ISK." On by
  default; a per-Character choice under Wallet Balance Changed turns it off
  (`walletFoldIntoContract`), which restores both alerts.

- **The wallet alert is only dropped when something carries it.** ESI says a
  journal line's context varies by `ref_type` and can be absent, so a line with
  no `contract_id` context, an unlisted `ref_type`, or no contract alert behind
  it stays a Wallet Balance Changed alert. Carried means the contract fire is in
  the same poll and enabled on that channel, or the contract alert's Feed row
  already exists. Only `ref_type`s whose transition is certain are listed;
  refunds and reversals are left out because cancelled, expired and deleted
  contracts fire no contract alert (Contract Failed is status `failed` only).

- **The ISK usually arrives after the contract alert, so the Feed row is
  revised.** ESI caches the contract list for 5 minutes and the wallet journal
  for 60, so a same-poll merge is the exception. When the line shows up in a
  later poll, the contract alert's existing Feed row has its body rewritten to
  include the amount (a later observer may revise copy, never `firedAt` or
  `dismissedAt`). The browser toast that already went out is not recalled.

- **Contracts only, for now.** Market orders do not fold: a journal
  `market_transaction` line carries a transaction id, not an order id, and one
  order fills as several partial sales that each fire a wallet alert while Market
  Order Filled fires once at the end. Matching them is the fuzzy `fillTime`
  heuristic, a separate decision. Scheduled Push is unaffected: neither alert is
  a projected event.

- **The summed amount counts every line a contract caused, whatever the
  Wallet Balance Changed settings.** The journal is fetched for the contract
  alert's sake whenever folding is on and a contract alert is reachable, even
  with Wallet Balance Changed off or the line under its minimum ISK change. A
  line nothing absorbs is dropped unless it would have been an alert on its
  own (event on, at or above the minimum).

Review follow-ups: a later poll's lines are added to the amount the feed row already carries (kept on the row as local `walletChangeIsk`), a dismissed row no longer counts as carrying the alert, and browser toasts fold only within one poll — a toast already shown cannot be revised, so a line arriving later stays its own wallet toast.

Fetching the journal for a contract alert also saves the wallet baseline when Wallet Balance Changed is off. Turning that event on later alerts only on lines newer than that baseline.
