# Scope decisions — Alpha clone state is a per-character setting that flags, not removes, capped levels (issue #1233)

_Recorded 2026-09-22 · issue #1233._

- **Per Character, default Omega, synced.** An Alpha is Alpha in every plan it
  opens, so it is not a per-plan lens like What-If Implants. Omega is the
  default because it is what every plan was costed at before the setting
  existed; a Character nobody touched keeps quoting the same times.
- **Halve the rate, never double the answer.** The rate is halved inside
  `trainingRate`, so a Booster's wall-clock window covers half the SP on an
  Alpha. Doubling finished durations would be wrong whenever a Booster is live.
- **Capped levels are flagged, not removed.** The plan is still the pilot's,
  and it is right the moment they go Omega. Removing rows would also rewrite a
  synced plan from a view setting.
- **Caps come from the SDE**, `chrCloneGradeSkills` (all four clone grades
  identical as of 2026-09-22), baked into `skills.json` as `alphaMaxLevel` —
  never a hand-typed list.
- **Deferred: suggesting Alpha from the live queue.** The ticket's optional
  "head of the ESI queue trains at about half the predicted rate" hint is not
  built; the setting is manual only.
