# Scope decisions — Skills Compare is a drawer over Trained, not a page

_Recorded 2026-10-14._

- **Skills Compare is a drawer, not a page or a tab.** Every other compare in the app (Market Compare, Fitting Compare's picker, Build Plan Compare) opens over what you were looking at; a tab of its own made Compare read as a destination nobody browses to. It opens from "Compare with…" in the Skills › Trained header, a right slide-over on desktop and a full-height sheet on a phone. `/skills/compare` redirects to `/skills/trained` and carries its `ids`, `comparisonId` and `baseline` so the drawer opens on the old selection.
- **The comparison has a baseline.** One selected Character (default: the active one) is the **Baseline Character**; every other column shows its level plus `+n` / `−n` / `missing` / `same` against it. Absolute numbers across three columns were the hard part to read. Rules out a per-cell "who is ahead" tint as the only signal.
- **"Differing only" is on by default**, with the rows everyone agrees on collapsed behind one "N skills identical" line. The old toggle stays so a full list is one click away.
- **Skills are banded by group with a net lead or deficit per Character**, replacing the Group column and its toggle.
- **Saved comparisons survive**, as a small "Saved" menu inside the drawer (device-local, unchanged storage). Rules out a separate saved-comparisons list on the page.
- **Rules out:** SP or training-time columns, comparing against a Skill Plan or a Fitting's requirements here (both still live elsewhere), and a radar chart.
