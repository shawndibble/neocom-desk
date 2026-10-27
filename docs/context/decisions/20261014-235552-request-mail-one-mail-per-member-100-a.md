# Scope decisions — Request mail: one mail per Member, 100 a day, matched by shared blueprints (issue #3810)

_Recorded 2026-10-14 · issue #3810._

- **The cap counts mails, not lines, and is its own counter.** A poster may send 100 Request mails a UTC day, apart from the 20 mail invites an admin sends: one mail covers the whole list, so a long Request costs the same as a short one, and inviting never eats into asking.
- **One mail per recipient per Request.** A second mail to the same Member about the same Request is refused by the server; a different Request is a new slot.
- **A mail goes only to a Member of the Community, about the sender's own open Request.** The reservation callable checks both, so the cap's slot is never a way to message an arbitrary Character.
- **Pre-ticked means "shares a matching blueprint".** A blueprint line counts once for a Member however many copies they share; an original line needs a shared original, a copy line is met by a copy or an original. Plain item lines match nobody, because nothing a Member shares says who holds Reactive Metals; the poster ticks those by hand.
- **The Request posts first and stands whatever the mails do.** Each recipient gets a result in the dialog. Refund rules are the invites': ESI refusing a mail gives the slot back (a few times a day), no answer from ESI keeps it spent.
- **The nav badge counts open Requests from others posted since the Requests tab was last shown, read while the app is open.** No push. A Community's first read is its baseline, so what was already on the board is not announced.
- **Accepted limitation, same as the invites.** Reserve, send, then release without confirming refunds the count and frees the dedupe slot, so a determined sender could re-mail. It is bounded by 3 refunds a day and a 2-minute window. A stale retake after midnight is charged to the new day and held to its cap, and a recipient is retaken at most 3 times.
