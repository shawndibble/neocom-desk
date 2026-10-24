# Scope decisions — Haul route: per-character cap, local snapshot, volume-greedy (issue #4965)

_Recorded 2026-10-24 · issue #4965._

- **The ten-stop cap is per Character section.** Each Character's route is its own list of Legs, so one Character's pickups never use up another's. Repeat pickup visits count, returns to the destination do not. What the cap cuts is listed under "Left out" with its volume; nothing is dropped silently. Rules out one cap across the whole haul.
- **Trips are volume-greedy, nearest pickup first.** A trip fills the hold from the nearest pickup with stock left (jumps under the Jump Basis, ties keep the Move plan's largest-first order); a pickup's stock splits across trips. It is not an optimal tour and does not pack by item: stacks the hauler cannot carry at all (single unit bigger than its biggest hold) are left out of the route, as the Move plan already warns.
- **The active haul is device-local.** A snapshot in the Dexie `settings` store (key `activeHaul`), never synced, so no FAQ phrase. One at a time: a new Show my route asks before replacing it. There is no per-leg progress yet (#4968); a Clear haul button ends it.
- **A Leg's Route Safety link names the destination stop with its station tag** and starts from the Leg's origin system; the origin's station is not carried (the `from` parameter is a system).
