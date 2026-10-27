# Scope decisions — Move plan: packed ships can be flown again; a packed ship too big for the hauler is flown

_Recorded 2026-10-12._

- **Packing an assembled ship stays the user's choice, both ways.** A packed ship is listed on its pickup as "Packed" with a "Fly instead" button, which re-plans without its volume. The rig warning on packing is unchanged.
- **A packed ship that fits no hold of the hauler is flagged and flown.** The plan lists it under "Too big to carry · fly these yourself" and counts it as a flight, not a left-behind stack. Loose packaged ships are never flown, so they stay under "Won't fit this hauler".
- **Ranking counts forced flights.** Order is fewest left-behind stacks, then fewest hauls plus forced flights, then smallest hull, so a hauler that carries the ship outranks one that makes the user fly it.
