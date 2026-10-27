# Scope decisions — Kills and losses widget reads every tracked Character from zKillboard's first page (issue #3580)

_Recorded 2026-10-11 · issue #3580._

- **All-characters fan-out.** The Kills and losses widget reads every tracked Character's killboard (two at a time) and the builder narrows to the header Character, or counts all of them (a killmail two of your Characters share counts once) when scoped to All. It sums across Characters, so it never falls back to the header Character.
- **First page only.** Each list is zKillboard's first page (200 newest). Rate limiting is the existing pilot-list cache (ten minutes, shared with Pilot Lookup), not paging; a range the page does not reach says how many days it covers. Paging back for a full 90 days was ruled out as too many requests per refresh for a public service.
- **Hash-only entries.** Entries with no inline time are not counted; a list made only of them is a failed read, never "none".
