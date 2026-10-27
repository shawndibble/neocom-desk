# Scope decisions — Public contract contents: merged stacks, two-sided headings, priced per side

_Recorded 2026-09-12._

- **A public contract's item lines are merged per item, not per ESI record.**
  ESI reports one record per stack in the issuer's hangar, so five Large Skill
  Injectors arrive as `×1 ×2 ×2` and read as three separate offers. Nothing
  distinguishes those stacks once the contract is accepted, so
  `mergeContractItemLines` sums them into one line. This rules out showing the
  raw record count anywhere — a reader has no use for how the issuer's hangar
  happened to be arranged.

- **Blueprint copies are exempt from that merge.** `material_efficiency`,
  `time_efficiency` and `runs` describe the one copy, and the Build Plan seed
  the line's context menu carries is per copy. Two BPCs of a type are two
  different offers. A blueprint _original_ carries none of those fields and
  stacks like any other item, separately from the copies sharing its type ID.

- **A two-sided contract heads each side; a one-sided one is headed for the
  side it holds.** When the issuer asks for something in return, the list
  splits under "What you get" / "What you hand over" and the inline
  `REQUESTED` tag is dropped. A one-sided contract keeps a single section
  rather than gaining an empty second one — headed "Everything on this
  contract" when it only hands things over, and "What you hand over" when
  every line is something the reader must supply. A list of things to supply
  must never read as a list of things received, which is the one thing the
  dropped tag was carrying.

- **The contents list is priced per side, and always.** Each side carries a
  sell-order total at the reader's Trade Hub
  (`loadContractMarketValue`), which is what makes an asking price judgeable —
  a scam contract's tell is the price sitting _above_ the going rate. Unlike
  the character-scoped contract modal, there is no "outstanding only" gate:
  every contract in the public snapshot is one still standing.

- **`loadContractMarketValue` is typed structurally, on `{ type_id, quantity }`.**
  Public contract lines are a different type from `ContractItem` but a bundle
  is worth the same ISK either way, so the parameter was widened rather than
  the public lines cast.

- **`BuildPlanContextMenu` carries every item action that needs nothing from
  its call site.** View in Market, Add to Compare, Copy name and Build Plan —
  the last two gated on an `itemName` the surface passes. It keeps its name and
  location despite no longer being build-plan-only: four features import it,
  and a move is a merge conflict for every parallel agent holding one of them.
  `ItemContextMenu` stays the richer menu for Market-wired surfaces; nothing
  here needs a Quickbar, show-info or variations group.

- **The contract ID gets a copy button.** It exists to be pasted into an
  in-game search or a chat channel, and the results table already offers the
  same action per row under the same wording
  (`contracts.contextMenu.copyContractId`).

- **Contract screens drop cents above 1,000 ISK.** `formatIskAuto` grew a
  `centsBelow` parameter (default 100, unchanged elsewhere) and every ISK
  figure on a contract surface passes `CONTRACT_ISK_CENTS_BELOW` — the detail
  modals, the search price chips, the BPC listings, the watch notification.
  Full grouped digits stay: a contract is read for the exact number, so
  shorthand is wrong here, but a trailing `.00` on a billion-ISK bundle is
  noise. A parameter rather than a second helper, per `isk.ts`'s own warning
  about near-copies diverging.

- **A contract's asking price of `0.00` is left as the caller renders it.** The
  header stat chips are supplied by the call site (Contract Search, BPC
  Search), and a zero price is a real ESI value — the item_exchange swap case.
  Wording it as "Free" or "—" is a decision for those tables, not something the
  shared modal should change from the inside.
