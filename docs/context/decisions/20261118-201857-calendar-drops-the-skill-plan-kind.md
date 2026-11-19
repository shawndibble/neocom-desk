# Scope decisions — Calendar drops the Skill plan kind

_Recorded 2026-11-18. Supersedes `20260923-213632-skill-plan-steps-on-the-calendar`._

- **The Calendar shows only the Skill queue.** The Skill plan kind, its per-Character plan picker, the `calendarSkillPlanByCharacter` setting, the "Projected" tag, dashed ticker segment and CSV "Projected" column went with it. A projection beyond the queue duplicated what the queue row already says and read as a second, near-identical skill kind. The stored setting is left in Dexie, unread.
- **Shared moon pops take the freed sand, `#e0d0a8`.** The old slate violet sat in the same hue as the Skill queue lavender. Sand is ΔE 23.9 (CIE76) from the nearest other clock kind (skyhook raid), 42 from the status tones; contrast 12.67 / 11.90 / 11.10 on bg / panel / panel-2. The chart palettes that borrowed `--color-kind-skill-plan` now borrow `--color-kind-shared-moon-pop`, same value.
