# Scope decisions — Ask to copy opens the Requests compose dialog in place (issue #3813)

_Recorded 2026-10-15 · issue #3813._

- **"Ask <name> to copy…" on a Community Offer row opens the Requests compose dialog in place, over BPC Sourcing; it does not navigate to the Community.** The label ends in "…" (DESIGN.md §6c: opens a dialog needing more input), and a pilot who is sourcing a blueprint keeps their search, filters and sources. It reuses `ComposeRequestDialog` through `AskToCopyDialog`, so the callable, caps, mail and results are the Requests tab's. The Request lands on the Community's board; the pilot is not taken there.
- **Only a Shared BPO from a Community Offer gets it, never a reaction formula** (GLOSSARY Community Offer: a formula cannot be copied). A copy row keeps its plain "from <name>". A formula BPO row keeps the old plain "ask <name> to copy" text, with no control.
- **The Community posted to is the one the Offer came from.** An Offer merged across Communities carries every Community by id; one posts straight to compose, several ask which first (a small select, Continue), since a Request belongs to exactly one Community.
- **The line is one blueprint, quantity 1, kind BPC, runs/ME/TE left empty,** and the holder is pre-ticked on step 2 on top of the Members who share a matching blueprint. An original is requested as a copy: "ask to copy" asks for a copy, not for the original (the Request line kinds `bpo` is a loan).
