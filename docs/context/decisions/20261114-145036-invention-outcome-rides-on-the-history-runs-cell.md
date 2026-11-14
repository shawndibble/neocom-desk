# Scope decisions — Invention outcome rides on the History runs cell (issue #6166)

_Recorded 2026-11-14 · issue #6166._

- **A delivered invention job's History runs cell reads its result ("3 of 5 succeeded") in place of the bare run count, not in a column of its own.** A column would be blank on every other activity's row, and the phone card keeps an empty cell's label, so every non-invention card would carry a bare "Succeeded" line. On the runs cell it shows on the card's existing Runs line.
- **No failure tone at 0.** A miss is a normal invention outcome, so "0 of 5 succeeded" reads like any other count.
- **A job ESI returned without `successful_runs` shows nothing**, never "0 of N": a missing count is unknown, not zero (`inventionOutcome`).
- **Corp jobs get the field typed only.** History is personal jobs only (decision 20261007-164750), so there is no corp surface to show it on.
- **Ruled out by the hostile review, not deferred:** a pooled realized success rate, a realized-vs-expected comparison, and a realized cost per copy. A job record carries no decryptor, skill levels or datacores, so none can be computed honestly.
