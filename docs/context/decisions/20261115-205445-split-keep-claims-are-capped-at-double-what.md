# Scope decisions — Split keep claims are capped at double what ESI holds

_Recorded 2026-11-15. Amends 20261114-211922 (#6180)._

- **A keep may claim at most as much again as ESI holds of that ore type on the entry (a keep of at most double), `maxUnreportedClaim` in `engine/miningTax/split.ts`.** The kept side is billed at once for ore ESI has not reported, so an uncapped claim lets one typo (an extra zero) bill a real Payee for ore that never existed. ESI trails the client by up to about an hour, so a genuine claim is the last stretch of a session, not more than the session itself; a figure past double is far likelier to be the wrong number. This rules out 20261114-211922's "the claim _is_ the cap" for unbounded claims; a pilot whose session really ran past it splits again once ESI catches up (later ore reaches the new side as Growth Collector, and growth on a split day is reviewed).
- **The figure must be for that UTC day only.** An in-game total often includes ore mined after 00:00 UTC, which ESI files on the next day's Mining Ledger Entry; counting it on this day's keep bills it twice. The hint under an above-ESI keep says so.
- **The cap is a ratio, not a fixed unit count.** Moon ore quantities vary by orders of magnitude between a one-pilot session and a fleet, so a fixed number would be useless or obstructive.
