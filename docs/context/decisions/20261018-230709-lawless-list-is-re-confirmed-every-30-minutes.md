# Scope decisions — Lawless list is re-confirmed every 30 minutes, not rewritten every run (issue #4272)

_Recorded 2026-10-18 · issue #4272._

- **`syncLawlessSystems` writes `systemConditions/lawless` only when the list changes, or every 30 minutes to re-confirm an unchanged one.** It still checks CCP's feed every 10 minutes, so a change lands within one run; most runs now cost a read instead of a write. `updatedAt` means "last confirmed", not "last changed".
- **The 60-minute hide limit stays; its tolerance drops from six missed runs to about three.** This supersedes the "six missed runs" wording of the 2026-10-07 lawless decision. The app never shows `updatedAt` as a time, only uses it as a staleness cutoff, so a heartbeat keeps that cutoff honest; a write-on-change-only doc could not tell a quiet feed from a dead function. Shortening the heartbeat to keep six-run tolerance would save nothing.
