# Market › History: trading profit

Source: `src/mockups/MarketHistoryTradingProfit.stories.tsx` (`mockups-markethistorytradingprofit--proposed`, `--proposed-by-day`, `--proposed-phone`). Sample data; the ticket text wins over the picture.

New components: `TradingProfitFigures` (Margin and Broker fees in the strip), `ArchiveCoverageNote` ("since 4 Oct"). The Character filter is the existing `CharacterFilterControl`, new to this page (History has none today). Everything else is `src/components/ui` primitives and the page's own strip markup.

"Today" is the same page rebuilt with the sample fills (`--today`): no seeded History page story exists.

| | 1440 | 390 |
|---|---|---|
| Today (`--today`) | ![](today-1440.png) | ![](today-390.png) |
| Proposed | ![](proposed-1440.png) | ![](proposed-390.png) |

The By item / By day rollup this mockup first proposed was removed from History (#4050); the pictures were re-taken without it.
