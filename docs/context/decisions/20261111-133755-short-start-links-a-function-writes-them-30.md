# Scope decisions — Short start links: a function writes them, 30 days

_Recorded 2026-11-11._

- **A long start link is hard to use in game.** The EVE calendar shows a description as
  plain text (`<url=…>` is not rendered), so a link with a name, a structure and notes is
  an unreadable wall. A **short start link** is a stored `/s/<id>` that opens the Survey
  start page with the same fields filled in.
- **One writer: the `shortStartLink` HTTP function.** `POST` (JSON or form body) or `GET`
  (query string) with `place`, `placeId`, `payee`, `payeeId`, `rate`, `notes`; it answers
  `{id, path, url, expiresAt}`. It is an HTTP trigger because a script has no Firebase
  session for a callable. The `shares` rules refuse `survey-start` from any client, so the
  function (Admin SDK) is the only writer and there is no anonymous write to abuse. No
  `firestore.rules` change. Functions are deployed by hand.
- **Stored as a `shares` doc of type `survey-start`, 30 days.** The existing
  `shares.expiresAt` TTL policy removes it, so no new collection or policy. 30 days, not
  the 7 of a Survey share: an event can be set a few weeks ahead, but short links cycle.
- **The id comes from the canonical query (a hash).** The same details always give the
  same id and renew the 30 days, so a script repeating a request adds no rows. A
  collision with a different live link takes the next hash attempt.
- **The page re-validates.** `/s/<id>` of this type navigates to `/survey?<query>`; the
  start page caps and checks every value as for a hand-written link.
- **Per-caller limit: one new link every 30 seconds, 30 an hour.** The caller is the
  request IP, SHA-256 hashed (the address is never stored), noted in `shortLinkLimits/<hash>`
  with the last link's time and the count in a fixed one-hour window, in the same
  transaction that stores the link. The TTL policy on `shortLinkLimits.expiresAt`
  (`firestore.indexes.json`, deployed by hand) removes it after the window. Asking again for
  a link that is still live is free and uncounted. A refused call answers `429` with a
  `Retry-After` header; `maxInstances: 5` stays as the concurrency cap.
