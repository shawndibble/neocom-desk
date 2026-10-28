# Scope decisions — Improve: a buy list that subtracts owned items (issue #5033)

**Superseded by `20261027-201156-improve-no-longer-counts-owned-stock`: Improve no longer counts owned stock.**

_Recorded 2026-10-25 · issue #5033. Design only: no code yet. Extends `20261024-171917-improve-a-goal-driven-swap-search-on-the`._

- **In Planning mode an owned unit costs 0 ISK in the search.** The search may then prefer a swap to a module the pilot holds. Showing owned stock only at the end would hide that the best swap is one they already own. Refitting mode is unchanged: it already prices "sell the old part, buy the new part".
- **Each owned unit is spent once.** A suggestion is priced alone against the full stock. The total for the ticked suggestions spends each unit once, in list order, so it can exceed the sum of the rows (as the Implant Finder does with owned turn-ins). Partial stock prices only the missing copies, and the row says "You own 5 of 8".
- **The budget caps "still to buy"**, not the full fit price. Prices stay sell prices at the hub the Price section uses; only the stock count follows the pilot's place pick.
- **"Count what I own" is a switch, on by default.** Hidden when the character lacks the assets scope. Remembered on this device. The drawer names the place ("Counting what you own at …"); when nothing is owned there it says so and names the setting that changes the place.
- **One shared owned-stock rule and one place pick for Appraisal "Minus owned", the Fittings multibuy export and Improve.** The final list is the existing "Multibuy minus owned"; Improve gets no second list. A second pick would let the drawer and the export disagree.
- **What counts as owned.** Stock in a hangar at the picked place, or in a container there, containers nested too. A place is an NPC station or a player structure (the structure assets scope is already requested), or "Everywhere". Never counted: fitted modules, and the cargo or bays of a ship (cargo is loaded for a trip and leaves with the ship; add it later if pilots ask). A structure whose name is unreadable stays pickable as "Unknown structure" plus its id, and its stock still counts.
- **The shared rule is fixed first, in its own ticket.** `ownedAtStation` ignored containers ("out of v1") and `ownedAnywhere` counted fitted modules. The fix changes Appraisal and the export too, so it is reviewed and tested on its own (#5149); the Improve ticket (#5150) is blocked by it.
- **Ticket split.** #5149 shared owned-stock fix (`ready-for-agent`). #5150 Improve Planning mode prices only what the pilot lacks (`ready-for-human`: new switch, place line and row note are visible UI; "Mockups first").
