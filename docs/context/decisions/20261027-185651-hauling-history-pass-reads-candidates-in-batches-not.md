# Scope decisions — Hauling history pass reads candidates in batches, not an up-front slice of 80 (issue #5326)

_Recorded 2026-10-27 · issue #5326._

- **The history pass reads pass-1 candidates in rank order, 20 at a time, until 40 (`MAX_BOOK_CANDIDATES`) pass or the list runs out.** An up-front slice to 80 by `priceScore` (trip ISK) filled with dear, thin items that history then dropped, so a broad category returned almost nothing while liquid items below rank 80 were never checked. Rules out a fixed pre-history slice.
- **Safety cap: 400 history reads per list-mode scan (`MAX_HISTORY_READS`).** History is one cached ESI request per type per region, run at `SCAN_CONCURRENCY` 4; 400 bounds the worst case at about 5x the old 80 (ADR 0003). Progress reports against the real total, `min(candidates, 400)`.
- **`capped` is true only when candidates were left unlooked-at**: the read cap or the 40-item book cap stopped the scan with candidates unread, or more than 40 passed history. Exhausting the list first leaves it false. Instant mode skips history, shortlists the top 40 by `priceScore`, and is capped when more than 40 pass pass 1; only its footer wording changes.
- **Caps stay overall, not per lane,** as for Any hub.
