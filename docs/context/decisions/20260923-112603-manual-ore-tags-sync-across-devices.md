# Scope decisions — Manual ore tags sync across devices

_Recorded 2026-09-23._

- **The "unclassified ore" banner's two tag lists (`typeOverrides.ts`) become
  Editable Data, superseding
  `20260907-090317-manual-ore-tags-are-reversible.md`'s "stay device-local"
  call.** That call assumed the gap was short-lived — a CCP patch, then the
  next `npm run sde:build` picks the new type up. It undersold the other
  cause: a type_id the personal mining ledger reports but that was never on
  the market at all (no market group, e.g. Banidine/Augumene —
  `yieldSnapshot.ts`'s non-tradable-variant comment) never enters the
  SDE-derived allowlists (`sde/loadSde.ts`) regardless of how often the SDE
  is rebuilt, so the tag is permanent for that pilot. Re-tagging the same
  type_id on every device they use is exactly the kind of repeated,
  unnecessary confirmation Editable Data exists to avoid (CONTEXT.md). This
  rules out leaving the lists as plain, unsynced Dexie keys.

- **Two `sync.`-prefixed keys, not one blob.** Same independence the
  original decision doc gave the two lists device-locally: untagging a
  moon-ore type must not be able to roll back an unrelated Ignore tag made
  on another device before either synced. `SYNCED_SETTING_KEYS` is
  exact-match, so this is expressible as two ordinary array-valued keys —
  no need for the systemId/characterId-keyed blob shape `piCustomsRates` or
  `industryBuildGroups` use. This rules out merging the lists into one key.

- **Each key adopts its pre-sync value from the plain key it used before,
  unstamped, on first read.** The same migration `lib/useSyncedSetting.ts`
  documents for its five Defaults-panel preferences: a tag made on this
  device months ago must not outrank a real edit made on another device
  yesterday, so the seed write carries no timestamp and any remote copy
  wins on the first merge. With no remote copy it pushes as-is. This rules
  out a one-time "your tags didn't carry over" surprise for anyone who
  tagged a type before this shipped.

- **Never deleted via `deleteSyncedSetting`.** Untagging removes one entry
  and rewrites the array; the key itself is never emptied to nothing in a
  way that needs a tombstone, the same "never deleted, only shrunk" shape
  `industryBuildGroups` already carries. This rules out wiring
  `untagMoonOre`/`untagIgnored` to the tombstone path.
