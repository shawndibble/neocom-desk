# Scope decisions (round 30) — a plan's times match the in-game queue

_Recorded 2026-09-02._

- **A part-trained level is charged for what is left of it, not for the whole
  level.** `computeSchedule` previously costed every step as a full level, so
  a plan opening on the skill the Character was training re-charged SP
  already paid for and read hours longer than the in-game queue for the same
  entry. The credit is `remainingSpForLevel`, and it applies only to the
  level actually in progress — `currentSp` is clamped into that level's own
  band, so no later level of the same skill is discounted.
- **Training Progress is a snapshot, not a live ticker.** It is interpolated
  once per load, in `applyTrainingProgress`, from the queue as of that
  moment. The alternative — a ticking clock the plan recomputes against —
  would make every number in the editor move while being read, for a
  precision nobody planning months of training needs. It is folded in
  alongside the existing completed-queue correction (round 4's issue #40
  work): that pass raises finished _levels_, this one raises the _SP_ inside
  the level still running, and neither is a widening of the other.
- **The credit is opt-in at the engine boundary**, an optional
  `ScheduleOptions.trainedSkills`. `placeRemaps` deliberately does not pass
  it: it takes its no-remap baseline from `computeSchedule` but costs its
  remap branches from `(rank, level)` alone, so crediting one side only would
  make the baseline artificially cheap and shrink reported savings toward a
  false "no remap improves this plan". A uniform overstatement on both sides
  cancels out of a difference, which is all that verdict reports.
- **The plan summary discloses a What-If Booster on the total.** Its
  arithmetic was never wrong — a +12 accelerator adds exactly `12 + 12/2 = 18`
  SP/min, around a third of a typical rate — but the headline training time is
  the number users check against the in-game queue, and it read a third fast
  with nothing on it to say why. `EntryList`'s per-row Booster mark already
  covered the rows; this covers the total. Shown only while the Booster is
  live, since `computeSchedule` ignores an expired one and disclosing it
  would be its own small untruth.
