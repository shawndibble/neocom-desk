# Scope decisions — Mail folders are multi-select toggles, not tabs

_Recorded 2026-09-07._

- **The All/Inbox/Corp/Alliance/Sent `Tabs` strip is replaced by a
  multi-select toggle group**, reversing round 18's "Tab bar over folder
  sidebar" (`20260901-172427-mail-page-rebuild.md`). Single-select forced a
  choice between exactly one folder and everything; the case a pilot actually
  has is a stable _subset_ — "Inbox, Corp and Alliance, but not Sent". Round
  18 was not wrong that five fixed folders don't earn a sidebar; it was wrong
  that they are only ever wanted one at a time.

- **The synthetic All tab is deleted, not carried over.** All four selected
  _is_ All, so a fifth control would be a second way to say the same thing
  that can then disagree with the four beside it. `total_unread_count` loses
  its home along with it and is simply not shown — the per-folder counts are,
  and round 18 already recorded that these come from ESI as-is and that the
  total is not their sum once Custom Labels exist.

- **A `role="group"` of `FilterChip`s, not a `Tabs` taught to multi-select.**
  `Tabs` keeps its `role="tablist"` contract, which DESIGN.md §7 pins and
  other routes depend on: `aria-selected` on a tab promises exactly one
  visible panel, and that stops being true the moment two folders can be on.
  `aria-pressed` on a real `<button>` inside a labelled group is the APG
  toggle idiom, and the shape `Contacts.tsx` and `OpenOrdersPanel.tsx`
  already ship. **Losing the tab bar's arrow-key roving focus is correct
  rather than a regression** — each chip is its own tab stop now, which is
  what a set of independent toggles should be. §7's "Tabs: full
  `role="tablist"` semantics" line still governs `Tabs`; this control is not
  one.

- **Selecting none is allowed, and explained.** The Moon Mining ledger's
  status filter refuses to unselect its last chip; this one does not. That
  precedent's own stated reason was that an empty filter "renders an empty
  table with nothing explaining it" — so the fix is to supply the
  explanation, not to make a chip visibly ignore a press. Zero folders
  renders an `EmptyState` naming the cause with a **Show all folders**
  action, and the chip row sits _outside_ that branch so the control that
  undoes it never vanishes along with the rows. An empty selection stored on
  disk is still rejected on read, so a reload can never strand the page.

- **The selection is a durable, device-wide preference**
  (`src/features/character/mailFolderPref.ts`: `createLocalSetting` plus a
  `VIEW_PREFERENCE_KEYS` entry), replacing the in-memory, per-character tab
  memory from issue #416. Two changes of tier, both deliberate:
  - **Durable**, because a tab could get away with being temporary — losing
    it put you back on All, which hid nothing — whereas a folder filter whose
    whole purpose is "stop showing me Sent" has not granted the request if it
    forgets by the next reload.
  - **Device-wide**, because "which folders do I care about" is a habit of
    the pilot rather than a fact about one of their characters. The chips are
    on screen at all times, so a character that wants a different set is one
    click away — which is not true of a preference you must first rediscover.

- **`src/engine/mail.ts` keeps its shape.** `resolveMailTab` still returns
  one canonical tab per header, so the filter is just
  `folders.has(resolveMailTab(...))`. Only `MAIL_TABS` (the four folders in
  display order) and `parseMailFolders` (validation for the stored value) are
  added. The toggle itself stays inline in `Mail.tsx` — flipping one member
  of a `Set` is not a module.
