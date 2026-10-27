# Scope decisions — What to train offers any level of a skill, not only the next

_Recorded 2026-09-30._

- **Each suggestion has a level picker; the changes and the training time follow the level picked.** Skills are still ranked at their next level (one calculation each, as before). Any other level is worked out on demand when the pilot picks it, so the ranking never pays for five levels of every skill.
- **Levels the pilot has are not offered. Levels the target Skill Plan already trains are listed but grayed out and cannot be picked.** A plan trains a skill level by level, so "planned" means everything up to its highest level for that skill, derived prerequisite rows included. The picker starts on the first level neither trained nor planned.
- **Changes compare the fit now against the fit at the picked level**, so they count every level on the way. **Train is the time for every level up to the picked one**, including levels already in the plan, since the pilot cannot have the picked level without them.
- **Add to plan adds one entry at the picked level.** The Skill Plan's own normalizer fills in the levels below it and any missing prerequisites, as it does for any entry; Undo removes exactly that entry.
- **A skill with every level in a plan has no picker.** The row names the plan instead, as a link that opens it, and shows what the whole skill would give.
- **"incl. prerequisites" opens a card** listing the skills the level needs trained first, each with its time, as the Mastery card lists a hull's. It is read-only: Add to plan already pulls the prerequisites in.
- **A Skill Plan button beside Rank by opens the target plan**, or the Skill Plans page when the Character has none yet.
