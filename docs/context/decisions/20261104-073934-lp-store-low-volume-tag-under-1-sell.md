# Scope decisions — LP store: low-volume tag under 1 sell per day, dim unaffordable offers only when LP above zero

_Recorded 2026-11-04._

- **An LP store offer is tagged "Low volume" when its known sells per day is under 1** (`LOW_SELLS_PER_DAY`). A real zero counts; missing volume data does not, since no data is not a thin market. Why: the sort puts the biggest ISK/LP first, and a figure resting on a market that trades less than once a day is the least trustworthy one. This is a volume test only: it does not catch a fat price off one lone sell order in a busy market. Rules out a depth-based test for now.
- **Offers the pilot cannot yet afford are dimmed, and say "need N more LP", only when they hold LP above zero.** Why: at 0 LP every offer is out of reach and flagging each says nothing; the Affordable filter already covers the zero case. Rules out dimming for an unknown LP balance.
- **On a phone the dense card's bold corner figure is the sorted column** when that is ISK/LP, sells/day or profit and the picker shows it; otherwise ISK/LP.
