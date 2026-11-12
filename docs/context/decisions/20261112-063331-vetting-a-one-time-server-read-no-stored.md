# Scope decisions — Vetting: a one-time server read, no stored sign-in

_Recorded 2026-11-12._

- **The server reads a pilot's characters once and keeps no sign-in.** The browser
  hands the callable a short-lived access token per character; the server verifies
  it, reads ESI itself and discards it (ADR 0033). A browser-built report was ruled
  out because the pilot being vetted could edit it; a stored refresh token per
  member (the SeAT / Alliance Auth model) was ruled out as custody of every
  member's mail, wallet and assets.
- **One EVE sign-in per character, no app login first.** The apply link
  (`/apply/<corporationId>`) is public like `/survey`. Its sign-in asks for exactly
  the five scopes the read needs and stores nothing on the device.
- **Staying signed in is opt-in.** After Send the pilot lands on the application's
  status page, not Overview with a toast. "Open Neocom Desk with these characters"
  is a separate, ordinary login.
- **The report never says "safe".** Three results: flags found, nothing found
  (neutral, with the count of checks) and incomplete (a source was not shared).
- **Mail is who, never what.** Only mail headers' sender and recipients are read;
  no subject or body is fetched or stored.
- **Only the findings are stored.** Raw rows live in a draft for at most 24 hours
  and are deleted on Send. The report keeps flags with up to 10 evidence rows each.
- **The pilot can see who opened the report and can delete it at any time.** It is
  deleted 30 days after the decision.
- **No Accept or Reject in the queue.** A row opens the report; the decision is
  made there.
- **Sign-offs are per EVE account.** One for an application, two for a promotion by
  default (1 to 3, set by a Director). Whoever asked for a promotion review cannot
  sign it off, and a reviewer sees another's decision only after recording their own.
  One player with two EVE accounts can still sign twice; the app has no stronger
  notion of a person.
- **Reviewers are the CEO, Directors and Personnel Managers.** Settings and the
  watchlist are the CEO's and Directors'.
- **The watchlist is typed by exact name.** Seeding it from corp or alliance
  contacts needs a corp scope and is left for later.
- **The app cannot grant a role or accept a corp application.** ESI has no write for
  either, so a decision is a record and the status page names the in-game step.
- **Not in the first build:** "Since the last review" and "In this corp" on a
  promotion report, an Overview entry, zKillboard checks (kills on corpmates),
  assets and jump clones in watchlist space.
- **The wallet journal reaches back about 30 days,** so ISK flags cover that window
  only, and the report says so.
