# Scope decisions — Review request link, resend cooldown and own-review queue (issue #6328)

_Recorded 2026-11-17 · issue #6328._

- **A signed-out member's link goes through the normal EVE login and returns to the request.** The mailed link is `/vetting`; no public per-review link and no server key per request. Rules out a member landing on a request without a Neocom Desk sign-in.
- **The asking officer may resend the request mail once a day.** The server enforces 24 hours (`VETTING_MAIL_COOLDOWN_MS`) when the officer records "mail sent" (`recordVettingRequestMailCallable`, a `vetting` router action). Only the officer who asked can record it, and only while the member has not shared. Rules out relying on the mail queue's pacing alone.
- **The queue does not list a review about the viewing officer.** It is closed to them, so a row they cannot open is noise. Rules out showing it dimmed with a reason.
