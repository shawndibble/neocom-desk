# Scope decisions — Stock Targets v1 scope (issue #3521)

_Recorded 2026-10-10 · issue #3521._

- **On hand is the pilot's own stock: every Character's hangars plus their
  own open sell orders, optionally at one station or structure.** Sell orders
  count because a listed item leaves the asset list, so a pilot stocking a
  market would otherwise read a full shelf as empty. Rules out, for now, the
  structure's whole market (every seller's sell orders): that needs the
  opt-in `esi-markets.structure_markets.v1` grant and its own grant prompt,
  so it is the follow-up that makes a corp market's shelf exact. Corp
  hangars are the other follow-up. The list stores `locationId` already, so
  neither changes the stored shape.
- **Stock Lists are one account-wide synced setting (`sync.stockLists`), not
  a synced collection, and not keyed per Character.** The Build Groups
  precedent: a collection needs a `firestore.rules` clause deployed by hand,
  and a denied collection takes the whole sync pass down. Account-wide
  because the counts already span every Character, so switching Character
  must not hide the lists. Accepts last-write-wins on the whole array: an
  edit made on two devices before either syncs can lose one of them.
- **The below-target alert reads cached assets and orders only, and is filed
  under one Character.** A live read inside the foreground poll would fan an
  asset request out per Character on every poll. Filed under the lowest
  Character id holding the assets scope, so one empty shelf fires once, not
  once per Character. It fires on a drop into Low or from Low to Out, never
  for a Stock Target the pilot just added or changed.
- **The Overview's Stock card is absent until the pilot keeps a Stock List**
  (`available: false`), rather than a new "hidden by default" mechanism in
  the hidden-cards setting, which stores only hidden keys and cannot tell
  "never chosen" from "chosen shown". It reads the last-viewed list.
- **A share link carries the list, never the sender's counts.** The
  receiver saves a copy and counts it against their own stock. Without the
  structure-market source above, two pilots' counts differ, so sharing the
  sender's numbers would mislead. A base36 `typeId:target` text code, like
  the Appraisal's, no backend and no expiry.
- **Builder's time per run is the blueprint's own time after its TE, before
  skills and facility.** The Build Plan applies those once made; the column
  is for comparing blueprints, and its header tooltip says so. "You can
  build now" means the active Character holds a blueprint (BPO or BPC).
- **Deviations from the mockup, for DESIGN.md:** the summary is `StatChips`,
  not boxed stats; statuses are the tinted-word pill (§6c's verdict cue),
  not outlined boxes; the item group line under each name is left out (the
  bundled SDE carries group ids, not names); the Builder's "needs a
  blueprint" section is a plain section heading on every width; the row ⋮
  is the shared item menu plus "Remove from list".
