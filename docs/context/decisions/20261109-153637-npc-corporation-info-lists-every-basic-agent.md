# Scope decisions — NPC corporation info lists every basic agent (issue #6040)

_Recorded 2026-11-09 · issue #6040._

- **The corporation info modal lists every basic agent, not only those with a personal standing.** Grouped by level (5 to 1), nearest first within a level (unknown distance last, then division and name); the nearest 3 per level show, with "Show all N" for the rest. A row shows system (security), jumps, a Locator mark and whether the pilot's effective standings open that agent (omitted while skills are unknown, per `20261028-140005-*`); an agent with a standing row keeps showing it. No separate LP Store list: the modal already opens from there. Storyline, FW, research and epic-arc agents stay out (not in the agent file).
