# Scope decisions — Subject routes split: subjectOf on the poll domain, URL shape in notificationOptions (issue #1249)

_Recorded 2026-09-22 · issue #1249._

- **Which fire field is the subject lives on the event's poll domain; the URL
  shape stays keyed by event id.** Partly reverses
  `20260908-123516-an-alert-lands-on-its-row-not-just.md`, which kept both in
  one `SUBJECT_ROUTES` table so a new event was one line. #1249 moved each
  event's copy onto its domain (`domainCopy.ts`), and `subjectOf` reads that
  domain's own typed fire, so it moved too. The URL half can't follow: the
  Service Worker (`pushHandler.ts`) and the Alerts page build URLs from a
  stored event id and must not import the poll registry (Dexie, loaders). So
  a subject-routed event is two edits, `subjectOf` in `domainCopy.ts` and an
  entry in `notificationOptions.ts`'s `SUBJECT_URLS`. `pollDomains.test.ts`
  requires the two sets to match, so they can't silently disagree.
