# Scope decisions — Price History orders per day divides by calendar days, not traded days (issue #5870)

_Recorded 2026-11-02 · issue #5870._

- **Price History's "Orders / day" divides by the range's calendar days, not the days that traded.** ESI omits a day nothing traded, so averaging over the returned days made a thin market look busy (8 orders on 7 of 90 days showed 1.14 a day, not 0.09). A market with a trade every day reads the same as before. A market newer than the range divides by the days since its first trade, so it is not diluted by days before it existed. Rules out averaging over returned points anywhere a per-day figure is shown.
- **It does not reuse `averageDailyOrders`.** That helper (market-wide scan) always divides by a fixed 30-day window with no range or new-market clamp; stretching it to take both would change the scan's contract for no gain. The two share the rule (an omitted day is zero) and differ only in the window.
- **The moving-average line is untouched.** Windowing it by calendar days instead of trading days needs its own decision beside `20260910-091729`.
