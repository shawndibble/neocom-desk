# Scope decisions — New-mail alerts ride the Alerts Grant with an explicit Add mail (issue #5143)

_Recorded 2026-10-25 · issue #5143._

- **Mail is never part of Turn on.** Unlike the location scope, which a fresh Turn on asks for once the server takes it, the mail scope is asked for only by an explicit per-Character "Add mail" (a mail-read token is the most sensitive grant yet). A re-authorization replaces the token with exactly what is requested, so Add mail, Add nearby and a Re-authorize all carry every extra the Character already had (`beginAlertsLogin` reads the recorded scope lists).
- **State is a mark and a pushed log, on the grant doc.** `mailHighWaterId`, `mailEtag`, `mailPushed` (`deviceId|Occurrence Key`, only while a partial send keeps the mark back). The first read seeds the mark silently, as `diffNewMail` treats a missing baseline; no device wanting `newMail` clears it, so turning it off and on never replays; a re-grant that adds the scope starts unmarked and one that drops it forgets the mark.
- **Only while someone wants it.** No device lists `newMail` for the Character: no ESI call is made, so the token reads nothing it has no use for.
- **A 403 drops the mail scope** from the grant's `scopes` (and the state) without revoking it; the device then sees the Character missing from `mailGrants` and offers Add mail again.
- **Rollout.** `registerDevice` answers `mailGrants` beside `nearbyGrants`; the client asks EVE for the scope only after a server has said it takes it.
- **No mail-only removal.** Turn off deletes the token; removing just the mail scope means Turn off, then Turn on.
