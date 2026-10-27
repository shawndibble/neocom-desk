# Scope decisions — Move plan packs each haul by hold: ship volumes packaged, hauls per pickup

_Recorded 2026-10-12._

- **A hull's volume in the Move plan is its packaged volume, read from the market catalogue.** The slim SDE snapshot carries only the assembled volume, so a Praxis counted 470,000 m³ instead of 50,000. A ship the catalogue lacks is "volume unknown" (and cannot be packed instead), never its assembled volume. This supersedes the "packaged volume where a type has one, else unpackaged" fallback for ships only.
- **Trips are packed, not divided.** Each pickup's stock is packed first-fit decreasing into hauls: a stack may split by whole units across holds and hauls, but one unit never does, so a packaged ship needs one hold big enough on its own. A hauler's trip count is the sum of hauls over pickups, plus one per ship flown. This supersedes the single `ceil(total ÷ hold)` figure.
- **A haul loads at one pickup only.** Two stations never share a haul, so the count can be higher than a pooled total.
- **The cargo hold and the fleet hangar are two holds in the Move plan.** Each haul lists what goes in each. This supersedes the one-number Cargo Space rule (`20261003-095644`) for the Move plan only; Hauling Opportunities keeps it. Specialised Holds stay out, as before.
- **A hull that cannot carry a unit ranks behind every hull that can.** The stack is listed under "Won't fit this hauler", never divided. Order is fewest left-behind stacks, then fewest hauls, then smallest hull.
- **Identical neighbouring hauls fold into one range** ("Hauls 1–5 of 9 · same load each"). Every line is still shown.
