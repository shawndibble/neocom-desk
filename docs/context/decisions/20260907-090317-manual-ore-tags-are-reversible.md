# Scope decisions — Manual ore tags are reversible

_Recorded 2026-09-07._

- **The "unclassified ore" banner's two actions are undoable.** They were
  append-only: `typeOverrides.ts` had no remove, and the banner that writes
  them renders only while `data.unclassified.length > 0`, so tagging the last
  id removed the only route to those lists. Tagging a genuine moon-ore type as
  "Ignore" therefore dropped it out of the ledger permanently — no entry on any
  Mining Ledger Entry, no ISK against any Payee, nothing on screen saying why,
  and no recovery short of clearing app data, which also takes the pilot's
  tokens. A data-correction workaround that cannot itself be corrected is worse
  than the misclassification it exists to fix. This rules out treating the tag
  actions as one-way confirmations.

- **The "Ore tags" action is always in the ledger's header, not gated on
  having tags.** Hiding it until at least one tag exists reads tidier and
  reintroduces the same shape: the check can only re-run when the route's
  snapshot identity changes, and a reload that fails after a successful tag
  leaves the snapshot on its retained copy — so the action would stay hidden
  while the error branch had already taken the banner away. The dialog states
  the empty case itself. This rules out deriving the header action's visibility
  from ledger state.

- **The two lists stay independent, and stay device-local.** Removing from
  "Tagged as moon ore" never touches "Ignored". Neither list gains sync
  plumbing: they remain the documented stop-gap for the window between a CCP
  patch and the next `npm run sde:build`, not Editable Data. This rules out
  merging them into one signed list, and rules out a `SYNCED_SETTING_KEYS`
  entry.

- **Removing tags refreshes the ledger once, on close.** The route's snapshot
  is a paginated per-character read; re-running it per click would put that in
  front of the table once per removal. This rules out wiring the dialog's
  remove button straight to `refresh`.
