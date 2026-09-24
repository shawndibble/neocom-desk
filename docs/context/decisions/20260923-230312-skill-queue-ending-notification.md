# Scope decisions — Skill Queue Ending notification (issue #1410)

_Recorded 2026-09-23 · issue #1410._

- **No "Skill Plan step completed" event.** A Skill Plan step only completes
  when its corresponding in-game skill-queue entry finishes — a Skill Plan is
  a user-editable _intent_ (`CONTEXT.md`'s **Skill Plan**), not a thing ESI
  tracks progress against on its own — and that queue-entry completion is
  already announced by **Skill Level Complete**
  (`diffSkillLevelComplete`/`characterNotTraining` in
  `src/engine/notificationDiffs.ts`). A distinct "plan step completed" event
  would fire for the exact same real-world instant a pilot already gets told
  about, doubling every alert for anyone who happens to be training toward a
  plan. **Skill Queue Ending** itself is not this either: it warns ahead of
  the queue's tail entry finishing (a lead-time nudge to top the queue up), it
  does not report a completion.
- **Lead time rides the same shape as `planetaryExtractorExpiring`'s
  `thresholdMs`.** `SkillQueueEntrySnapshot.endingLeadMs` is baked in per
  entry at poll time (`pollDomains.ts`'s `skillQueueDomain.load()`), optional
  on the type so a baseline persisted before this shipped still validates —
  `diffSkillQueueEnding` reads a missing value as "not previously observed",
  matching `ColonyExtractorSnapshot.installTimeMs`'s precedent, rather than
  requiring a migration.
- **Push wording hedges, like the two planetary lead-time events.** Topping
  up the skill queue from the EVE client — the very action this warning
  exists to prompt — is exactly the kind of "in-game action taken while the
  app is closed" that `engine/projection.ts`'s `projectionWording` hedges
  for, even though it does not use ESI itself to fire (ESI carries no write
  endpoint for the skill queue at all). `skillLevelComplete`/
  `characterNotTraining` stay assertive because nothing about their own copy
  becomes a false claim if the queue is topped up first — "training complete"
  and "not training" are still true statements about what already happened
  by the time either fires; "your queue is about to run dry" is not, once the
  pilot has already fixed it.
