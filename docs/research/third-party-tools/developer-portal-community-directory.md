# EVE developer portal community directory

Source: https://developers.eveonline.com/docs/community/ (Services and Libraries lists), surveyed 2026-10-10. Most READMEs were thin or 404, so feature lists come from each tool's own site or general knowledge. Statuses were checked against `origin/main`.

Skipped on purpose: killboards (zKillboard, EVE-KILL, nKillboard, Socket.Kill), corp/alliance management (Alliance Auth, SeAT, Neucore, EVE-SRP workflow), shared wormhole mappers (Wanderer, WormholeSystems, SMT, Upwell.gg) and every ESI/SSO/SDE library. They need a shared backend or aren't personal-desk features.

## Already covered: do not re-propose

| Tool idea                                               | Where we already do it                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Moon / ore scan paste -> ore value (Fuzzwork moon scan) | Mining Survey (`/mining/survey`): paste a Survey Scanner copy, rocks valued at compressed buy at the pilot's hub. `mining-survey.md` |
| "Where is this item used" (Fuzzwork Material Use DB)    | Item Detail "Used in" section. Decision `20260929-171133-item-detail-lists-what-an-item-is-used`                                     |
| Kill/loss lookup per pilot (JitaSpace, zKill explorers) | Pilot Lookup (`/travel/pilot`): zKill all-time stats, newest 25 kills and losses with victim fit, Local/D-Scan list threat badges    |
| Ore/gas mining valuation (Fuzzwork, TradeLooper)        | Mining Survey, Mining yield tracker (gas cloud harvesting counted), moon mining price at compressed Jita buy                         |
| Mail with EVE markup, assets, wallet, orders, contracts | Their own feature pages (JitaSpace, EVE Buddy, Tritanium, EVEOps all overlap)                                                        |
| Net worth chart, CSV export, notifications              | `src/engine/netWorth`, `TableExport`, `docs/features/notifications.md`                                                               |
| Market, LP Store, Appraisal, hauling, route safety      | `docs/features/market.md`, `travel.md` (STARWEB, TradeLooper, Workbench overlap)                                                     |
| D-Scan, fittings (EFT, abyssal weather), reactions, PI  | `fittings.md`, `pilot-lookup.md`, Industry docs (Theorycrafter, EVEShip.fit, Dscan ICU overlap)                                      |
| Command palette entity search                           | `docs/features/command-palette.md` (character/corp by name through ESI search)                                                       |

## Rejected

- **Needs a shared backend** (breaks the no-server model): SRP request workflow, shared wormhole mapper.
- **Needs local file access** (not a web fit): RIFT and EVE Wrench settings copy/backup, live chat-log tailing.
- **PI**: stopped-colony and storage forecasts. The PI tabs have since been rebuilt (Plan, Map, Colonies), so check these against them.
- **No price feed**: abyssal module appraisal (MutaMarket) has no public price source here.
- **Intel chat-log parser** (RIFT), rejected 2026-10-10: RIFT reads the chat logs live and alerts on its own; a paste-only parser here would be a weaker copy of what intel pilots already run.
- **Niche, unverified**: Abyss run log, SRP loss-to-payout calculator, gank-efficiency and ESS raid calculators.

## Candidate gaps

1. **Hide bait orders** (ISK.GG scam filter). Market flags a sell price >= 10x best sell with `BaitFlag` but never hides it. A toggle is missing.
2. **Multi-region price history** (ISK.GG). The Price History tab reads one region only. Band, average and the 7-day moving average already exist; the region comparison does not.
3. **Incursion feed** (TradeLooper). Public ESI `/incursions`. Nothing in `src/` mentions it.
4. ~~Intel chat-log parser~~: rejected, see above.
5. **Stockpile targets** (jEveAssets). Built as Market › Stock (issue #3521): markets the pilot sells at, with listed and hangar counts against targets.

Smaller: ESI `/search` for systems and types in the command palette (palette has no solar-system search, `travel.md`), per-item price overrides in asset valuation, an ore-form (compressed vs raw vs refined) comparison on top of the Mining Survey.
