# Scope decisions — Shared pop shows the officer-linked Survey (issue #6405)

_Recorded 2026-11-18 · issue #6405._

- **A Shared Pop carries the Survey its Extraction is linked to.** `SharedPop.surveyId` is
  optional and additive (old docs lack it), filled from the book's Extraction `surveyId`, which an
  officer sets with the existing `linkSurvey` action (it already republishes pops). No rules,
  index or callable change: pops stay function-only reads.
- **The Calendar modal leads with Open Survey** (`/s/<id>`), and keeps Start a new Survey as the
  second action. Without a link it shows Start a Survey here as before. A Survey share expires,
  so an old link may open a not-found page; the officer re-links or a pilot starts a new one.
- **Not here:** linking a Survey started from a pop's start link back to the pop (a `pop=` start
  parameter and a router action that checks the caller is in the pop's audience). That is a
  later PR on #6405; the short URL keeps working as it does today.
