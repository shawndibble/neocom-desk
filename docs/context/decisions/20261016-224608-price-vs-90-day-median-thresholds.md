# Scope decisions — Price vs 90-day median: thresholds (issue #3994)

_Recorded 2026-10-16 · issue #3994._

- **"vs 90d" compares like with like: the latest full day's region daily average against the median of the region's daily averages over the last 90 days**, in the hub's region. Hub sell min against a region average would read high on every wide-spread item. Today's partial day never counts.
- **Blank when the item traded on fewer than 30 of the last 90 days** (`VS_MEDIAN_MIN_TRADED_DAYS`). ESI history omits no-trade days, so a median of a handful of days is noise.
- **The latest full day may be up to 2 days old** (`VS_MEDIAN_MAX_LATEST_AGE_DAYS`). ESI publishes yesterday only after its daily rollover; demanding yesterday exactly blanked every row for part of each UTC day. Older than that, the item stopped trading and the figure is blank.
- **Amber from +20%** (`PRICE_SPIKE_PCT`), judged on the whole percent shown, so "+20%" is never plain. Not a setting. The plan page's note appears only at that threshold; dips get no note.
- **Shown on both Build Opportunities tables, their phone cards, the plan's qualifier line and the Overview Price watch table.** No below-median scanner and no recovery-time estimate.
- **On Market-Wide the column starts unticked in the Columns menu; on Ranked it always shows.** Market-Wide already drops columns that would push Plan off-screen at 1024px, and one more did. Ranked is where owned-blueprint builders look first.
