# Scope decisions — Split plan jobs across Characters, not copies (issue #3988)

_Recorded 2026-10-20 · issue #3988._

- **A Build Plan's jobs are spread across Characters, never across copies of a blueprint.** One job per node stays one job (per-job ME rounding, job fees and material totals are unchanged); each job goes to the Character who finishes it first among those with its blueprint in reach, timed with that Character's own skills. Splitting a node's runs over several owned copies, wave planning and new pages are out of scope.
- **In reach means the Character owns the blueprint, or a corp-owned copy counts.** Corp-owned copies (plan's Corp Assets toggle on, corp blueprints readable) are in reach of every Character. A job nobody listed owns (an assumed, unowned blueprint) stays with the plan Character, so no job is dropped.
- **Unknown slot data for any Character silences the whole line.** Never a schedule that ignores a Character, never a false "0 free". A single-Character plan renders exactly as before; lanes appear in the expanded line only when two or more Characters get jobs.
