# Scope decisions — The phone tab bar is the pilot's four, and the More sheet is whatever is left

_Recorded 2026-09-13._

- **The phone's bottom tab bar is a device-local preference, never synced.** It
  answers for a screen — the only one that has a tab bar — not for the pilot,
  the same reason the text scale is local while every default in
  `DefaultsPanel` syncs. Built on `createLocalSetting`, which rejects the
  `sync.` prefix outright, so the constraint is enforced rather than
  remembered. Rules out a per-Character bar and a bar that follows a pilot from
  their phone to their laptop.
- **The count stays fixed at four + More.** `Layout`'s `MOBILE_NAV_ITEM` splits
  a viewport as narrow as ~320px into equal shares; a variable count re-opens
  that width maths, and permits both a two-item bar that reads as broken and a
  six-item one whose labels truncate to nothing. The ask was to swap the links,
  not to resize the bar.
- **The bar reads in the desktop rail's order, not the order the chips were
  picked.** One order to learn, not two — the same rule the sheet already
  followed. Rules out a reorder UI for now; ordering stays an additive change
  if it is ever asked for.
- **The More sheet is derived as the complement, never hand-kept.** Anything
  the pilot pushes out of the bar appears in the sheet by construction
  (`mobileSheetPaths`). Two hand-maintained lists would eventually leave a path
  in both places, or in neither — and on a phone, in neither means the route is
  unreachable.
- **Corp, Settings and the active Character sit outside the rotation.** Corp UI
  hides rather than locks, so a chosen `/corp` would leave a hole in the bar for
  every Character without access; Settings has no other route on a phone; the
  Character link is the only way to switch or add one. All three keep permanent
  sheet rows and are absent from `MOBILE_TAB_CHOICES`.
- **A stored bar that is not exactly four distinct known paths is discarded,
  not repaired.** `parseMobileTabs` falls back to the default rather than
  padding a short row — a bar with a hole in it is worse than a bar the pilot
  did not choose. A valid set in the wrong order is re-sorted, though: that is
  still their choice.
- **The Settings chips edit a draft and write only a full bar.** Unpicking one
  leaves the previous bar standing until a replacement is picked, so the
  preference on disk is always renderable; unpicked chips go inert at four
  rather than evicting a choice the pilot never named.
- **Lock dots stay off the tab bar.** The tab is 10px text with `px-1` and no
  room for the marker; the sheet still shows it for everything the bar does not
  hold.
