# Scope decisions — Planet richness override narrows a colony's advice (issue #2685)

_Recorded 2026-10-06 · issue #2685._

- **A saved richness pick narrows the resources a built colony is advised on.** Before #2618 the picks only fed the unbuilt-planet cards, an accepted drop; built colonies never read them. They now narrow the candidate P0s of that colony's rebuild advice (`colonyStopTierAdvice`) and its Plan-solver rates (`plannerColonies`), so Plan, Map and Colonies agree: all three read one live query in `usePiAdviceInputs`.
- **Absent, empty or unusable picks mean no narrowing.** A pick naming no resource the planet type yields (stale typeID) falls back to every resource, so existing saved overrides take effect with no migration and never leave a colony with nothing to advise on. Picks on a planet with no colony stay stored and inert.
- **The editor is the Map drawer at `?planet=<id>`**, optional, linked from the Colonies row. A product link drops the param: one drawer at a time.
- **Not narrowed:** the recipe ranking (per planet type, not per planet) and the Planet finder's nearby planets. Revisit if players ask.
