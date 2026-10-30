# Scope decisions — SP Farm mark scopes SP extraction readiness (issue #5658)

_Recorded 2026-10-30 · issue #5658._

- **SP extraction readiness applies only to Characters marked SP Farm.** One global threshold made every main permanently ready and the alert fired for all of them on enable. With none marked, nothing shows ready: a behaviour change for pilots with monitoring on today (owner, 2026-10-30). Rules out per-character SP floors.
- **The mark is a synced set of Character ids (`sync.spFarmCharacters`), not device-local.** Same reason as the threshold: a judgement about the pilot. Additive, so backward-compatible with the shared Firebase project.
- **Column and row-menu action exist only while SP extraction monitoring is on.** A mark means nothing otherwise; the Settings hint tells the pilot to mark Characters.
- **Unmarking resets the alert baseline.** The poller returns an empty entry list for an unmarked Character, so re-marking a ready one fires once.
