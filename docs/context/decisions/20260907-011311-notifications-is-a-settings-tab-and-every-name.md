# Scope decisions — Notifications is a Settings tab, and every name in it reads as words

_Recorded 2026-09-07._

- **Notifications is a Settings tab of its own, not a panel down the General
  tab.** It had outgrown the page it sat on: a master switch, two channel
  gates, a search box, and one collapsible section per Character each holding
  17 events plus 26 EVE types under one of them. Below the font-size control
  and the keyboard-shortcut table, the thing people actually came to Settings
  to change was the thing they had to scroll past everything else to reach.
  Tab order is General, Notifications, Data Age, Activity Log.

- **A Settings deep link's hash picks the tab, then the anchor.** The Overview
  feed links to `/settings#notifications`, which used to resolve purely by
  `scrollIntoView` — sound only while every anchor lived on the default tab.
  A hash naming a section on another tab now selects that tab
  (`TAB_FOR_HASH`), resolved in the `useState` initializer so the first paint
  is already right, and re-derived during render (not in an effect) when the
  hash changes later. `#corp-access` still maps to General and still scrolls.

- **The active Character's section starts expanded.** With several Characters
  signed in, every section collapsed meant the one section a reader almost
  certainly came for was the one the page did not show. Seeded from an effect
  rather than at mount, because `useActiveCharacter` hydrates from Dexie a
  tick later, and guarded by a ref so a re-render never re-opens a section the
  user has since collapsed by hand. Every other Character stays collapsed.

- **The delivery columns are "Browser" and "Overview", not "App" and
  "List".** Neither old word named what it delivered or where it landed, and
  "App" was actively backwards: the browser channel is the one that fires
  _outside_ the app, while the "List" it was contrasted with is a page inside
  it. The captions now match the two channel checkboxes above them verbatim —
  a third name for the same channel on one screen was the confusion, not the
  cure — and each carries a tooltip spelling the channel out. Widening them
  meant the five independent grids on this panel (captions, per-Character
  select-all, event rows, Family headers, type rows) could no longer size
  themselves to their own content and drift apart, so they share one explicit
  two-track class.

- **An EVE Notification `type` is shown as a phrase, never as ESI's
  `CamelCase`.** `StructureImpendingAbandonmentAssetsAtRisk` reached the user
  in two places — as a row label in the per-type list, and inside the generic
  notification body a payload falls back to — and in neither did the
  identifier tell anyone what had happened. `notifications.eveTypeName.<Type>`
  is the catalog, one entry per member of the Notification Allow-List, with
  `humanizeEveType` as the floor beneath it for a type nothing has named yet.

- **The type catalog is its own set of strings, not the fired titles reused.**
  `StructureLostShields` and `StructureLostArmor` both fire under the title
  "Structure reinforced"; they are two separately togglable rows in Settings,
  and rendering them identically would make one of them unusable. The catalog
  is required to be distinct per type, which a test asserts across the whole
  allow-list.
