# Scope decisions — Reorder treats Plan Milestones as hard deadlines (issue #2826)

_Recorded 2026-10-07 · issue #2826._

- **Reorder, Shortest first and Optimize for me treat each Plan Milestone as a hard deadline.** A milestone's anchor step plus every in-plan step it transitively needs finishes before later milestones and before everything no milestone needs. Milestones are ordered by their anchor's current schedule position (drag to change); no new field. Priority and attribute-pair grouping only interleave within a deadline segment. Reached/orphaned milestones are ignored. Rules out a per-skill ship tag.
