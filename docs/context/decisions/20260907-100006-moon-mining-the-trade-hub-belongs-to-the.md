# Scope decisions — Moon Mining: the trade hub belongs to the Payee, not to the device

_Recorded 2026-09-07._

- **A Payee names the trade hub its ore is valued at (`PayeeRecord.hubId`),
  and that hub — not a device-local setting — is what every ISK figure billed
  to that Payee is computed from.** The moon tax figure is a bill one player
  sends another: two corpmates opening the same ledger entry must arrive at
  the same amount owed. A device-local hub would have them disagree about what
  is owed for the same ore on the same day, which is the one thing an invoice
  cannot do. Stored on the Payee, it syncs with the Payee (`sync/planSync.ts`'s
  `payeeSpec`), so the hub travels with the obligation rather than with
  whichever machine happened to record it.
- **This is deliberately _not_ the Market Browser's `marketHub`**
  (`src/features/market/hub.ts`). That key is one pilot's viewing preference
  for a page they read; this one is a term of a bill they send. Sharing them
  would mean idly changing which hub you browse silently restates every
  outstanding tax bill. They stay separate keys with separate meanings, and
  Moon Mining never reads the browser's.
- **Jita stays the default, and everything the previous pricing decision
  pinned stays pinned.** An absent `hubId` means Jita, which is exactly what
  every Payee was priced at before the field existed, so no stored figure moves
  on upgrade. Buy-side, and the ore's Compressed counterpart where the SDE has
  one, remain the basis at whatever hub is chosen — the hub decision changes
  _which order book_ is read, never _which side of it_
  (`20260906-081307-moon-mining-price-compressed-ore-at-jita-buy.md`).
- **The default hub is stored as no hub at all.** Picking "Jita (default)" in
  Manage Payees clears the field rather than writing `hubId: 'jita'`, so there
  is one representation of "priced at Jita" instead of two that a reader would
  have to be told are the same. An unknown hub id (a newer build's, or a
  corrupted sync) reads as Jita too, via `hubForPayee`, rather than as an error
  or as unpriced ore.
- **Prices are loaded per _distinct_ hub the ledger's Payees actually use,
  plus the default, and every hub is priced for the whole ore list.** An
  all-Jita ledger — the overwhelmingly common case — still makes exactly one
  hub fetch, as before; each further distinct hub adds one. Every hub gets the
  full type list rather than only its own Payees' ore, because an unassigned
  entry can be assigned to any Payee and the Assign dialog re-prices live as
  that selection changes: a narrowed per-hub set would blank the preview for
  exactly the choice being made.
- **A split values each side at its own Payee's hub** — `splitAssignment` takes
  two price maps, not one. A split hands ore to a _different_ Payee by
  construction, and the two need not bill at the same hub; pricing both sides
  from one book would misstate whichever bill it did not come from. The two
  maps are the same object whenever the two Payees share a hub.
- **A join values the whole group at the one Payee's hub.** Joining already
  requires every assigned member to share a Payee and tax % (the merge rule),
  so there is exactly one hub in play and no blending question to answer.
- **`resolveNeedsReview` looks the Payee up itself** rather than taking a hub
  from its caller: accepting growth is a fresh invoice moment, and every caller
  reaches it from a row action holding only the Assignment. Re-pricing at some
  other hub's book would restate a bill the landlord never quoted. A dismissal
  (no Payee) and an Assignment whose Payee was since deleted both fall back to
  Jita.
- **Ore an entry has _not_ been assigned to anyone is still valued at Jita.**
  The table's Value column, the Unassigned balance card and Dismiss all price
  a residual with no Payee, so there is no hub to inherit — the default is the
  only defensible basis, and `MoonMiningTax.tsx` keeps a plain default-hub map
  for exactly those three.
- **"Some ore could not be priced" names the hub that could not price it.** "No
  buy orders" is a fact about one order book: once two Payees bill at two hubs,
  a pooled warning would blame Jita for Hek's thin book. The banner lists one
  line per hub with unpriced types, over the shared explanation.
