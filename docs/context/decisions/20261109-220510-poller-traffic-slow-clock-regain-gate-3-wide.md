# Scope decisions — Poller traffic: slow clock, regain gate, 3-wide fan-out

_Recorded 2026-11-09._

- **Wallet journal, order history and zKillboard losses poll at most once per 14 minutes (each domain on its own clock, stamped only by a complete load), not every 5.** A 20-character account made ~380 ESI calls per poll; these three have a page with a manual refresh (or none, for zKillboard) and tolerate the wait. Mail, contracts and clones stay at 5 minutes because their pages have no manual refresh. The wallet journal still loads on every poll while a contract alert's fold is enabled, so a contract is explained by a journal as fresh as it.
- **Calendar keeps its 2-minute window; the skyhook-nearby poll reads a location up to 10 minutes old.** A declined calendar event must not fire a starting alert, but a raid window lasts hours.
- **A tab regaining visibility within 2 minutes of the last poll does not poll again.** Leader take-over and reconnect catch-ups are not gated.
- **The poll fans out 3 characters at a time, active character first.** The old 10-wide burst put every character's ~19 calls in the same few seconds.
