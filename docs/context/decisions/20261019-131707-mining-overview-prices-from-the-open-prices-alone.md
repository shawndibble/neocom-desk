# Scope decisions — Mining Overview prices from the Open Prices alone

_Recorded 2026-10-19. Builds on 20261019-091155-mining-prices-read-the-open-prices;
supersedes the Overview half of its "Tiers" bullet._

- **A mined-day basis prices a day from that day's Open Price, nothing else.**
  The day's closing Jita 4-4 best buy or best sell, on the chosen side. A
  region-wide day stands in only where an object still holds that old shape
  (until #4293). Today and yesterday fall back to today's live price until the
  end-of-day job publishes them; an older day with no price stays unpriced
  (Partial). The ESI daily-average tier is gone. It blended buy and sell
  trades, so a station day with no buy order priced the "Jita buy" basis on
  the wrong side of the book. The Overview no longer reads ESI market history
  at all.
- **No price-source tags.** With one source, the Overview's Saved / Historical
  / Daily avg / Live tags, the coloured rate-chart bars and their legend, and
  the "N of M days use saved prices" line said nothing a pilot could act on.
  The table, chart and CSV report only Full / Partial pricing. The row detail's
  "How this is priced" names the chosen Value basis and buyback rate in place
  of a fixed "Jita average".
- **The per-browser `jitaPriceSnapshots` table is dropped** (Dexie v27). It
  saved today's live book on each Overview load, so a day's "saved" price was
  whatever the book was at the last load. The Open Prices hold the day's close
  for every day, whoever was online. Mining Tax stops merging it too. Its
  `saved` / `historical` / `live` / `live-sell` tiers stay, because Corp Tax
  Book Statements store those source values.
