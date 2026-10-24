# Scope decisions — Skill plan editor ranks roster Characters by time to finish (issue #5006)

_Recorded 2026-10-24 · issue #5006._

- **"Who's closest" lives in the Skill Plan editor only, never in Compare.** Compare stays a skill-level matrix (decision 20261014-082107); the plan list gets nothing.
- **Each Character is timed on their own attributes and implants, without their live queue.** The plan's What-If lens and Remap Markers are ignored, so rows compare like for like; queue-aware timing was cut as a bug source.
- **Finished and unreadable Characters collapse into summary lines.** An unreadable Character is never shown as zero missing.
- **Rosters over five load on demand.** The section starts closed and fetches nothing until opened.
