# Scope decisions — World-scoped alerts share one Occurrence Key across Characters

_Recorded 2026-10-23._

- **The nearby-skyhook and nearby-Incursion alerts leave the Character out of
  their Occurrence Key.** The thing they report is the world's, not a
  Character's: two Characters in range of one raidable skyhook window, or one
  Incursion, are one occurrence. The feed upserts by key and the toast check
  reads it, so they share one row and one toast. This supersedes "the
  Occurrence Key is character, system, planet and window start" in
  `20261023-094325-raider-skyhook-alert-reads-only-the-public-list.md`.
- **One Character delivers it, chosen per poll** (`sharedWorldFires.ts`): one
  who has the event on for a live channel, then the nearest, then the lowest
  id. Without that, a first Character with the feed off wrote no row to mark
  delivered and the second toasted again. The row names that Character and
  carries its jump count. Removing it from the roster deletes the row
  (`deleteFeedForCharacter`) even while another is still in range, and the
  delivered mark keeps the next poll from re-raising it. Accepted: the alert
  is advisory and the next window or Incursion alerts again.
- **Events with a Scheduled Push Projection do not follow.** A projection row
  is `{deviceId}:{key}`, written per Character, so a shared key would make
  two Characters overwrite and sweep each other's row. Corp structure fuel and
  corp industry jobs stay per Character until the backend can share a row.
- **Not every Character-scoped event can follow.** An event keyed on a
  globally unique id (structure, job, skyhook, den) can; one whose key is
  only a division or a member id (`corpWalletThreshold`, `corpMember*`)
  cannot until its fire carries the corporation id.
