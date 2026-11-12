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
  the five scopes the read needs and stores no token on the device. The access
  token is handed from the callback to the page in memory, never in router state or
  web storage. The device keeps only the report's handle (its id and key) in
  `localStorage`, so the status page reopens in that browser; the apply link on
  another device starts a fresh application.
- **Staying signed in is opt-in.** After Send the pilot lands on the application's
  status page, not Overview with a toast. "Open Neocom Desk with these characters"
  is a separate, ordinary login.
- **The report never says "safe".** Three results: flags found, nothing found
  (neutral, with the count of checks) and incomplete (a source was not shared).
- **Mail is who, never what.** Only the sender and recipients of mail headers are
  kept. ESI's header list carries the subject, which is dropped as it is read; no
  body is fetched.
- **Only the findings are stored.** Raw rows live in a draft for 24 hours, are
  refused after that and removed by the daily sweep, and are deleted at once on
  Send. The report keeps flags with up to 10 evidence rows each.
- **A shared report nobody decides is deleted after 90 days.**
- **The pilot can see who opened the report and can delete it at any time.** It is
  deleted 30 days after the decision.
- **No Accept or Reject in the queue.** A row opens the report; the decision is
  made there.
- **Sign-offs are per EVE account.** One for an application, two for a promotion by
  default (1 to 3, set by a Director). Whoever asked for a promotion review cannot
  sign it off, and a reviewer sees another's decision only after recording their own.
  A review closes when the sign-offs needed are in: rejected if any said no, else
  accepted. A single no does not close a two-sign-off review, or the second
  reviewer would know every earlier sign-off was a yes.
- **A review about you is closed to you.** A reviewer cannot open or sign a report
  on themselves or one of their declared characters.
  One player with two EVE accounts can still sign twice; the app has no stronger
  notion of a person.
- **Reviewers are the CEO, Directors and Personnel Managers.** Settings and the
  watchlist are the CEO's and Directors'.
- **The watchlist is typed by exact name.** Seeding it from corp or alliance
  contacts needs a corp scope and is left for later.
- **The app cannot grant a role or accept a corp application.** ESI has no write for
  either, so a decision is a record and the status page names the in-game step.
- **Vetting is off until a Director turns it on,** and an apply link to a corp with
  it off says so.
- **A member can decline a requested review.** The reviewers see "Declined"; the
  request is kept 30 days. One waiting promotion review per member, and its report
  must include the member's own character.
- **Limits:** 30 characters and 30 reads per report, 10 drafts per character per
  corporation per day, 200 watchlist entries, a 1,000-character note, the newest
  5,000 dealings per character, 4 pages of mail headers. Dealings with NPC
  corporations and agents are dropped at the read.
- **Opens are logged once per reviewer per hour,** and the log keeps its newest 100
  entries. The queue shows a report's flag count without logging an open.
- **Three checks beyond the watchlist ones:** corp hopping (4 player corporations
  joined in a year), cyno skills with no declared capital or black ops pilot, and
  an old character with very few skill points. Watchlist ISK of 100M or more, or a
  stay in a watchlist corporation that ended within 180 days, is "Serious".
- **Not in the first build:** "Since the last review" and "In this corp" on a
  promotion report, an Overview entry, zKillboard checks (kills on corpmates),
  assets and jump clones in watchlist space.
- **The wallet journal reaches back about 30 days,** so ISK flags cover that window
  only, and the report says so.
