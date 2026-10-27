# Scope decisions — Ship Tree ladder filters: fly state in the toolbar, Mastery behind the funnel (issue #4921)

_Recorded 2026-10-23 · issue #4921._

- **The ladder gets filters; the map doesn't.** The ladder is where a pilot scans for what to train next (the gaps, or every hull at Mastery III). The map is the in-game picture and keeps every hull on it.
- **Fly state is a `SegmentedControl` in the `FilterBar`'s actions, not behind the funnel.** All / Can fly / Can't fly is the axis flipped most, and its counts are the answer to "how big are my gaps" before any tap. It departs from §4b's "every filter behind the funnel", as Owned Blueprints' kind filter does. The counts are the faction's own split: no other filter changes them, so picking a Mastery tier never makes Can't fly read 0. It replaces the "Only ones I can fly" checkbox.
- **Mastery is a multi-pick of None and I–V behind the funnel, each tier with its count.** None is a hull the pilot can fly without Mastery I. Mastery is a can-fly property, so the pick is ignored (and the chips disabled with the reason) under Can't fly, and while the Mastery data hasn't loaded, when every tier would read None. Only the Mastery pick counts towards the funnel's badge.
- **Faction chips count matches while filtered, and a faction with none dims but stays.** Hiding it would shift the bar on every filter change and could remove the faction being read. "None at Mastery III here" is itself an answer.
- **A filter change opens every section; Expand all and Collapse all still work after it.** A match in a collapsed sub-class would otherwise hide. They are off while searching, as on Skills, because a search already opens everything.
- **Class headers read "n of total" over the class's own hulls while filtered**, the same scope as the unfiltered "flyable/total", so a parent's count never double-counts its sub-classes.
- **A faction with no matches lists the factions that have some, plus Clear filters**, rather than a bare "no matches".
- **No active-filters chip line.** The selected tab and the funnel's badge already say what's filtered; a second chip for the same state read as noise in the mockup.
- **Fly state and Mastery live in the URL with the faction, as one param group** (ADR 0015), so a switch to another faction from the empty state keeps the filter.
