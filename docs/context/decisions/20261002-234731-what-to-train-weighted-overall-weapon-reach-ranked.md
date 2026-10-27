# Scope decisions — What to train: weighted Overall, weapon reach ranked

_Recorded 2026-10-02._

- **Overall is a weighted sum, not a plain one.** Damage, EHP, active tank
  and every role's own output (mining, remote repair, jump range, bursts…)
  count whole; speed, align time, lock range and weapon reach count half;
  the capacitor's depletion time (or stable % points) counts a quarter. The
  capacitor turning stable, or unstable, still counts whole. A plain sum put
  Controlled Bursts (+19 s before a Rokh runs dry, +8%) above Large Hybrid
  Turret (+3.4% DPS), and Rapid Firing (+3.9% DPS, cap dry 5% sooner) below
  a +0.4% drone skill — backwards for nearly every pilot. Each single-stat
  "Rank by" stays unweighted, and the weights apply only to a fit that
  shoots: on a hauler or miner align time and speed are what keep it alive,
  so an unarmed fit keeps the plain sum. The weights are a judgement call, pinned by
  `whatToTrain.integration.test.ts` against that real fit, not tuned per
  hull or doctrine.
- **Weapon reach is ranked: optimal, falloff, tracking.** Read off the
  firing guns and launchers (`applied.weapons`, never drones or fighters),
  compared item by item like the other role stats, and listed as their own
  change since the Variations delta has no row for them. A missile's flight
  range counts as its optimal. This surfaces Sharpshooter, Trajectory
  Analysis and Motion Prediction; missile application (explosion radius and
  velocity) is still not ranked. Tracking is shown as EVE's own turret
  tracking figure, without a unit.
- **Out of scope here: suggesting T2 modules.** What to train still only
  tries +1 to one skill on the fit as it stands, so it never says "train
  Large Hybrid Turret V and Large Railgun Specialization I for 425mm
  Railgun II", nor offers a specialization skill that only boosts the T2
  variant. That needs a module-swap evaluation path and its own ticket.
