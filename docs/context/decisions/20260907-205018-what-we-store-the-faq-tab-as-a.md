# Scope decisions — What We Store: the FAQ tab as a user-facing commitment

_Recorded 2026-09-07._

- **Settings gains an FAQ tab, one Panel per question.** It ships with three:
  **What We Store**, where to report a bug or request a feature, and who to
  thank. The first had no answer anywhere in the product — only in
  `CONTEXT.md`'s **Editable Data** / **API-Derived Data** split and ADR 0001,
  neither of which a pilot reads. Questions are added because someone asked
  them, never to round the list out: an FAQ padded with invented questions
  reads as filler and goes stale faster than it helps.

- **What We Store has two groups, not three.** A "never collected at all"
  group was written and then dropped. A list of what is _not_ held is
  unfalsifiable by the reader and unbounded by nature — it invites padding, and
  it reads as protesting rather than answering. The two groups that remain
  account for everything that exists; absence from both is the answer. A test
  pins the count at two so the group does not creep back.

- **The repo URL has one definition.** `lib/links.ts` holds `REPO_URL` and
  `ISSUES_URL`; the landing page footer, which had its own copy, now imports
  them. Two definitions drift, and a stale URL is a dead end for exactly the
  person trying to report something.

- **The section is a commitment, and is wired so it cannot quietly go stale.**
  `sync/characterPurge.ts`'s `REMOTE_COLLECTIONS` is now exported and is the
  authoritative list of what leaves a device; `features/faq/FaqPanel.test.tsx`
  pins a map from each collection to the line that tells the user about it.
  Adding a synced collection fails that test until whoever added it decides
  what the user should be told. The copy's "two settings" is pinned to
  `SYNCED_SETTING_KEYS.length` the same way. This is the same deliberate
  two-file friction `sync/syncedSettings.ts` already imposes, for the same
  reason.

- **The section states the exceptions rather than rounding them off.** Three
  things leave the device beyond the plainly user-made data, and each is named
  in the copy instead of being technically-not-lied-about: Notification Feed
  rows (already-shown alerts, so a second device can catch up), Scheduled Push
  occurrences (title and body rendered ahead of time, because the functions
  package carries no SDE and no i18n catalog — see
  `functions/src/registerDevice.ts`), and Sentry crash reports (with
  `userInfo` and `httpBodies` off, per `instrument.ts`). A section a reader can
  catch overclaiming is worth less than no section at all, so this is a
  standing rule for the copy, not a one-time wording choice.

- **Moon Mining assignment snapshots are named as stored, not defended as
  derived.** The ore lines and ISK figures an Assignment snapshots are
  EVE-derived in origin, and it would be easy to file them under "API-derived,
  stays local". They do not: the snapshot is the invoice (see the
  **Assignment** glossary entry), so it syncs, and the copy says so.

- **The deletion promise is stated with its caveat.** `characterPurge.ts`
  records by design that a Character whose refresh token is already dead cannot
  be signed in as, so its remote docs survive until it authenticates again.
  "Remove a character and it's deleted" would be the one outright false
  sentence in the section; the copy says the deletion runs the next time that
  character is added back, and a test pins that clause.

- **No status colours in the section.** `docs/DESIGN.md` §6 reserves those for
  meaning, and "synced" versus "never leaves this device" is a distinction the
  headings already make in words — colour-coding it would both misuse the
  token and lean on colour as the only signal (§7).
