# Scope decisions — High-collateral courier flag: modal-only, at 50x the reward (issue #1720)

_Recorded 2026-09-25 · issue #1720._

- **A `high-collateral` risk fires at collateral ≥ 50× the reward.** Set well
  clear of honest high-value freight — a 1B load paying 25M is 40× — so the flag
  names an outlier, not ordinary work. Worded as the condition ("Collateral is
  N× the reward") and its cost, never as a scam verdict, per
  `20260912-172628-courier-risk-flags-state-a-condition-never-a.md`.

- **Modal-only: no row marker, no lane-card marker.** That same decision keeps
  the collateral ratio off the row because a card line below `sm` has no room
  for it, and this ticket did not change that constraint. So the risk is in
  `RISK_COPY` but not `MARKED_RISKS`; it still heads the modal list as a warning
  (`WARNING_RISKS`), not a note. It is a flag, never a hide — `blocksCompletion`
  ignores it.

- **Below the community floor, the reward is stated as a share of it** ("pays
  N% of that floor") with one line naming the two bases — the going rate prices
  cargo size, the floor prices collateral — so a high multiple beside a short
  floor stops reading as a contradiction. At or above the floor the old wording
  stands.
