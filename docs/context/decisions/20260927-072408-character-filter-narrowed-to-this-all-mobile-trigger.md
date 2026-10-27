# Scope decisions — character filter narrowed to this/all, mobile trigger merges the phone identity avatar

_Recorded 2026-09-27._

- **`CharacterFilterValue` narrows from `'current' | 'all' | Set<number>` to
  just `'current' | 'all'`.** The hand-picked-subset case (pick exactly N of
  M characters) was never a feature anyone asked for — every caller's own
  comments described only "current" or "all," no test ever exercised a
  genuine partial subset, and it cost the picker a full checkbox-list-plus-
  search UI to offer something nobody used. `CharacterFilterControl` drops
  `MultiSelect` in favor of a two-item `DropdownMenuRadioGroup`. This applies
  uniformly to every caller, including `OpenOrdersPanel`'s own character
  strip (a distinct filter-chip feature, not the this/all identity toggle,
  but narrowed the same way rather than forked into two components).
- **A legacy persisted `number[]` (from before this narrowing) reads back as
  `'all'`, never `'current'`.** The active Character differs per device, so
  there is no single id in an old array that every device reading the synced
  Firestore value could safely collapse to. `StoredCharacterFilterValue`
  still accepts an array on read for this reason; nothing writes one any
  more. Same handling for a legacy comma-separated `?chars=` URL param.
- **The phone-only "whose data is this" avatar (`PhoneIdentityAvatar` in
  `PageHeader`, added by #1764) is deleted outright**, not kept alongside the
  new control. Its job — a portrait cue below `md` — is absorbed into
  `CharacterFilterControl`'s own trigger: below `md` the trigger is icon-only
  (the active Character's portrait for `'current'`, the `AllCharacters`/
  `UsersThree` glyph for `'all'`), fixed to the same box a sibling
  `IconButton size="sm"` uses, rather than a full-width text pill floating in
  its own corner of the header. A route with no `CharacterFilterControl` (a
  one-Character account, or a route that never offered the filter) now has
  no phone identity cue in its header at all — mobile still reaches
  `/characters` via the bottom tab bar's More sheet, which predates and is
  independent of this avatar.
- **Losing the avatar's one-tap "return to this page after switching
  Character" shortcut is an accepted tradeoff.** The bottom-bar route back to
  Characters always lands on Overview instead. Character-switching is
  infrequent enough that this isn't worth keeping a second, floating control
  for.
- **At `md` and up, `CharacterFilterControl` is unchanged**: the usual text
  button ("This character" / "All characters"). There's room for the words
  there; the icon-only treatment is a phone-width space problem specifically.
