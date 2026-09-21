# Scope decisions — Mail reply and forward

_Recorded 2026-09-21._

- **Reply and Forward, not a general compose.** No "write mail from scratch to
  anyone" — every send starts from an existing mail the character already
  received. Keeps the feature to what a pilot actually asked for (answer this
  mail) without the added surface of a from-scratch recipient/subject form.

- **`esi-mail.send_mail.v1` joins the base `SCOPES` set**, not an opt-in
  group. `src/esi/scopes.ts`'s own header calls this app "read-only by
  design, with one narrow, explicit exception" — `organize_mail` for
  mark-read. This decision adds a second exception and widens it: unlike
  `corp`'s seven scopes (opt-in because ~95% of users hold no corp role and
  gain nothing from granting them, CONTEXT.md round 35), every character can
  send mail, so gating it behind a feature-triggered consent screen would
  just delay the same prompt for nearly everyone who'd use it. The accepted
  cost: **every existing user is re-prompted for consent on their next
  login** once this ships — `revokedScopes` in `scopes.ts` already treats a
  widened grant as a no-op, not a revocation, so no cache purge follows, but
  the SSO screen itself changes for everyone, whether or not they ever reply.
  **This is a real, weighed cost, not just friction avoided**: a character
  who never opens Reply still holds send-mail capability from that point on,
  and a compromised session or leaked refresh token can now send mail as
  that character, app-wide — not scoped to the subset who'd ever use it,
  same shape of risk the `corp` group's opt-in gate exists to avoid. Accepted
  anyway because the two aren't equivalent: `corp`'s gate is sized to ~95% of
  users who _cannot_ exercise those scopes at all (CCP role-gates them
  server-side, so holding them unused is pure downside with zero eventual
  benefit); send-mail is a capability every character can use, so the
  "unused grant" population shrinks over time rather than staying near-total,
  and the blast radius (one character's mail) matches what `organize_mail`
  already carries today.

- **No CSPA (contact-charge) support.** A stranger who prices contact from
  non-contacts can reject a send unless `approved_cost` is attached. This app
  does not read, display, or pay that charge — a rejected send surfaces only
  ESI's error message text (never a raw response dump) with a hint to use
  the in-game client instead. Reply-all is the
  one path likely to hit this (a third party on the original mail who isn't a
  contact); replying to the original sender alone effectively never does,
  since they already messaged this character. Handling the charge would mean
  a real-ISK approval step in an app that has never asked a pilot to spend
  ISK through it — out of scope for v1.

- **Inline compose, in the existing reading pane.** Reply/Forward opens a
  compose box in the same `Panel` that already renders the open mail
  (`Mail.tsx`) — no modal, no new route. Consistent with round 18's read that
  Mail is a two-pane, not a document-per-page, view; a new `/mail/compose`
  route would be the first place Mail left that shape. The traded cost is a
  tall box on a narrow screen, where Mail already collapses to one pane at a
  time — accepted, since at that width an inline box and a full page end up
  looking nearly the same anyway.

- **Both Reply and Forward auto-quote the original body**, editable, rather
  than starting blank. Reply could have started blank — the original stays
  visible above it in the same pane — but Forward cannot: its recipient never
  had the original in their own inbox, so a blank Forward would send them
  nothing. Quoting both keeps one compose behavior instead of two, rather
  than a Reply/Forward split that would need explaining.

- **Reply defaults to reply-all** (sender plus every original recipient,
  mailing lists included — ESI allows sending back to a `mailing_list`
  recipient id same as any other), shown as removable chips. Reply-to-sender-
  only was considered and rejected: corp/alliance mail is routinely CC'd
  to several people, and defaulting to "just the sender" would silently drop
  them unless a pilot remembered to add each one back by hand. The chips stay
  editable so a pilot can trim the list back down before sending.

- **Forward's recipient picker is search-plus-contacts**, not contacts-only.
  A live name search (the same ESI search pattern already used elsewhere in
  the app) covers forwarding to someone outside the character's contact
  list; contacts surface first as quick picks since they're the common case.
  Contacts-only was rejected as too narrow — forwarding to someone not yet a
  contact is a normal use of the feature, not an edge case.

- **Reply-all's chips are editable except the sender's.** A pilot can remove
  any CC'd recipient before sending; the sender's own chip is pinned. Removing
  every CC is still a reply; removing the sender turns "reply" into "forward
  to the CC list", a different action this decision already gives its own
  entry point.

- **Drafts persist to Dexie, device-only, keyed one-per-mail**, surviving a
  refresh or character switch, overwritten on retry, cleared on send. Same
  tier as this app's refresh tokens (CLAUDE.md: "Refresh tokens live in Dexie
  only") — local, never synced through the backend, never sent anywhere but
  ESI. A pilot who starts a reply, picks another mail, and comes back should
  find their draft rather than an empty box; the alternative (drop it on
  navigation) was rejected as the one thing most likely to lose real work
  mid-feature. A lingering draft necessarily holds someone else's quoted mail
  text, same as the mail body it quotes — but that body is already sitting in
  this same Dexie cache, unencrypted, for as long as `mail:{mailId}`'s
  `STALE_AFTER.static` window keeps it (`features/character/mail.ts`). A
  draft adds no exposure beyond what the app already keeps on-device; no
  separate expiry is added here for that reason.

- **No toast component exists in this app** (checked before deciding) —
  a failed send surfaces inline, near the Send button: same spot and tier
  `ReauthBanner` already uses for an actionable error, not the component
  itself — its props (`title`/`hint`/`actionLabel`/`onLogin`) are
  login-specific and don't fit a rate-limit or CSPA rejection. Rate limiting
  and auth failure on the send call follow the existing pattern every other
  ESI write already uses (`esi/client.ts`'s `X-Ratelimit-*`/`Retry-After`
  handling, `emitEsiAuthFailure` on a 401/403) — nothing new to design there.

- **A successful send invalidates the Sent folder's cached headers**, so the
  new mail appears without a manual refresh. Nothing else about the cache
  changes: this is a targeted invalidation of one key, not a broader
  reload.
