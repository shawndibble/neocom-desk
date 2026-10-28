# Scope decisions — Improve replaces unflyable modules and Cheaper tolerates 10%

_Recorded 2026-10-28._

- **Every Improve goal replaces a fitted module the pilot cannot fly.** Such a module is always a candidate, and a flyable replacement is accepted even when it scores worse on the goal (only the CPU/powergrid/calibration budget and the spend cap still bind), and is listed ahead of real gains. A fit the pilot cannot fly is worth less than a worse one they can. Rules out a separate "make it flyable" goal.
- **The replacement reaches past the Search settings Reach, in order: a flyable variant, else a flyable module of the same group, else the goal's groups.** Each step only when the one before found nothing, so a plain T1 swap is preferred to a rework.
- **Cheaper may lose up to 10% of damage, tank or speed (was 5%).** A slightly worse module that saves real ISK is the point of the goal. Supersedes the 5% in `20261024-171917-improve-a-goal-driven-swap-search-on-the.md`. Rules out ranking Cheaper by a value formula; the existing Best value sort stays.
