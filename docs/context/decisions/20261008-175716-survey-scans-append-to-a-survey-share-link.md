# Scope decisions — Survey scans append to a survey Share Link with no sign-in

_Recorded 2026-10-08._

- **A shared Survey is a `survey` Share Link.** Same 9-character id, same
  `/share/<id>` URL, same 7-day lifetime and TTL policy as every other stored
  Share Link, so the link logic and `ShareShell` are reused. It does not live
  longer when scans are added: the lifetime is the standard one, from creation.
- **Scans are a create-only subcollection, `shares/{id}/surveyScans`.** The
  `shares` doc is create-only, so a survey that people keep adding to can't be
  one doc. One doc per pasted Survey Scan holds the raw text (capped at 40,000
  characters), the server's clock as its time, and the survey's own `expiresAt`
  so a TTL policy on `surveyScans` removes it (a TTL delete of the parent
  leaves its subcollection behind).
- **Anyone with the link can add a scan, signed in or not.** The person who
  keeps a Survey going after its starter has left may have no account, and the
  point of the public page is that nobody has to log in. Starting a Survey
  still needs a Firebase session, like any Share Link. The id is the only
  protection, as for every share; the cost is that someone holding the link can
  paste junk, bounded by the per-scan size cap, the parse check on the client,
  and the 7-day expiry. A "Stop sharing" control is not possible on a create-only
  share, as for the other types.
- **A scan's time is the server's clock, not the pasting client's.** Nobody can
  backdate a scan, and a wrong PC clock can't skew the pace.
- **A rock in an earlier scan that is missing from a later one counts as mined.**
  The scanner's range is far, so a rock drifting out of range is not a case to
  handle (Shawn, 2026-10-08).
- **Chat message: four lines, none wider than about 50 visible characters.**
  RockRadar's own message is the benchmark for what the chat window shows
  without wrapping. In-game chat keeps `<b>` and drops colour, size, hint and
  link tags (checked in the client), so style is words and block characters.
