# Scope decisions — Route Safety system notes are an account-wide synced settings blob (issue #4452)

_Recorded 2026-10-20 · issue #4452._

- **System notes are account-wide, not per Character.** A solar system is not a Character's; "gate camp seen at Tama" is the pilot's knowledge whichever alt is active. Rules out a per-Character fan-out.
- **They are one synced settings blob (`sync.systemNotes`), not a new Synced Collection.** Needs no Dexie version, Firestore rule or index (rules are deployed by hand and dev and prod share one Firebase project). Backup and delete-all already cover allow-listed `sync.*` keys. Accepted cost: whole-blob last-write-wins, so notes on two systems edited on two devices before either syncs lose one (the same trade as `sync.stockLists`).
- **A note is the pilot's own text and never an input to routing, rankings or Avoided Systems.** Route Safety states conditions, never verdicts (`20260912-172628`). Each note carries an updated date so a stale one reads as a past observation.
