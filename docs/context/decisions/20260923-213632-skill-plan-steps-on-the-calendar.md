# Scope decisions — Skill Plan steps on the Calendar (issue #1405)

_Recorded 2026-09-23 · issue #1405._

- **The Calendar projects one Skill Plan per Character, as a seventh Clock Kind.** Each remaining step is one row on the day the schedule says it lands; no cap, volume goes through the kind filter. Choosing another plan replaces the first. A step the live queue already carries appears once, as the queue row.
- **The choice is a device-local setting, not the synced target-plan store.** `calendarSkillPlanByCharacter` (plan id per Character), picked under the kind filter. It is a view preference for one page; `sync.targetSkillPlan` means "the plan I am working toward" and is not the same question. A stale or foreign id reads as "no plan chosen", not as a silent fallback to another plan.
- **Projected is a property of the kind, not of a row.** A hollow dot on the map, a dashed segment on the Day Ticker, the word "Projected" on the rail, and "(projected)" in each day's accessible name — never colour alone. No severity tone: the board has none any more.
- **The board keeps three plan states apart.** No plan chosen: kind not readable, "Choose a plan". Costed with nothing left: readable, zero. `schedule.error`: not readable, with the reason. The plan is costed by `schedulePlan` (`features/skills/planner/planSchedule.ts`), the same call the plan editor makes, so the two quote one date.
- **No CSV column.** The Calendar's CSV exports raw ESI calendar events, not board items, so there is nothing to mark projected.
- **New token `--color-kind-skill-plan` is `#e0d0a8` (sand).** Minimum ΔE (CIE76) 36 against accent, success, warning, danger and the six existing kinds; contrast 12.67 / 11.90 / 11.10 on bg / panel / panel-2.
