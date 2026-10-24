# Scope decisions — World-scoped alerts share one Occurrence Key across Characters

_Recorded 2026-10-23._

- **The nearby-skyhook and nearby-Incursion alerts leave the Character out of
  their Occurrence Key.** The thing they report is the world's, not a
  Character's: two Characters in range of one raidable skyhook window, or one
  Incursion, are one occurrence. The feed upserts by key and the toast check
  reads it, so they share one row and one toast. This supersedes "the
  Occurrence Key is character, system, planet and window start" in
  `20261023-094325-raider-skyhook-alert-reads-only-the-public-list.md`.
- **The shared row names whichever Character wrote it last**, and carries that
  Character's jump count. Removing that Character from the roster deletes the
  row (`deleteFeedForCharacter`) even while another is still in range, and the
  toast's delivered mark keeps the next poll from re-raising it. Accepted: the
  alert is advisory and the next window or Incursion alerts again.
- **Not every Character-scoped event can follow.** An event keyed on a
  globally unique id (structure, job, skyhook, den) can; one whose key is
  only a division or a member id (`corpWalletThreshold`, `corpMember*`)
  cannot until its fire carries the corporation id.
