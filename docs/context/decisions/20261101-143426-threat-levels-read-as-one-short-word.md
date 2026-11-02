# Scope decisions — Threat levels read as one short word

_Recorded 2026-11-01._

- **The Threat badge shows one short word: Dangerous, Active, Low, Quiet.** A badge sits beside a pilot's name in every Local row, so "Low threat" and "No recent kills" were too long. The full wording ("Low threat", "No recent kills") is the screen-reader label and the verdict band's heading on a pilot's profile. Amends the level names in `20261008-181210`.
- **"Inactive" is now "Quiet".** A pilot found in Local is logged in, so "inactive" claimed something the data cannot say. The level still means only that zKillboard shows no kill in 90 days and no recent loss. The internal level key stays `inactive`; only the words changed.
- **No tooltip on the list badge.** A `Tooltip` per row would add a tab stop to every row (§6c). A sighted reader gets the full wording on the profile band; a screen reader gets it on every badge.
