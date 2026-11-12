# Scope decisions — Corp kills gains a Table view, one row per corporation (issue #6100)

_Recorded 2026-11-12 · issue #6100._

- **Corp kills offers Number and Table; the Table is one row per corporation (kills, losses, ISK efficiency).** On All my corporations every row must name its corporation, and a Number has no rows. On one corporation the Table is that corporation's one row, with no Corporation column. Still no Chart: zKillboard's stats are all-time totals with no series.
- **All my corporations for Corp kills reads every player corporation a Character's corp gate settled for; NPC corporations are left out.** The read is public zKillboard, so no role is asked, and an NPC corporation has no killboard (the widget already says so for one).
- **Summed ISK efficiency is weighed by ISK (destroyed over destroyed plus lost, all corporations together), never an average of percentages.** A quiet holding corporation with one loss must not drag the main corporation's figure.
