# Neocom Desk feature inventory

Goal: know what exists so we know what to improve. Written from code, not memory. Each file has a summary table, controls, persistence/sync, scopes, states, formulas, Interview Q&A, Observed gaps, Improvement ideas.

Part indexes: [A](README-A.md) · [B](README-B.md) · [C](README-C.md).

## Areas

| Area           | Files                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Account, shell | auth-login, characters, app-shell, settings, sync-backup, share-links, entities-share |
| Home, feed     | overview, alerts, notifications, command-palette, calendar                            |
| Character      | clones, employment-history, skills, ships, fittings, mining, contacts, mail           |
| Economy        | wallet, assets, contracts, market                                                     |
| Industry       | industry-plans, industry-records-sourcing, planetary-industry                         |
| Corp           | corp                                                                                  |
| Exploration    | travel, pilot-lookup                                                                  |
| Support        | help-faq, styleguide-notfound                                                         |

alerts.md (A) and notifications.md (C) overlap. share-links.md (A) and entities-share.md (C) overlap. Read both.

## Cross-cutting gaps (from all three passes)

1. **Silent scope/failure states.** Revoked scope often shows an empty state, not a re-login banner (Wallet Journal, Mining payments, Ships mastery; LP Store is route-gated, so not silent). Dead grant bounces to `/characters` with no message.
2. **Destructive actions unsafe.** Delete plan: no confirm/undo. Delete run: no confirm. Alerts "Dismiss all" hits filter-hidden rows. Clear cache / Reset view prefs: no confirm. Fittings Save to EVE can leave both copies.
3. **Hidden caps.** Wallet names 5 txn pages, palette 6 rows (no show-more), calendar 50 events, ranked auto-recalc only up to 10 blueprints, hauling scan 80/40, Pilot Lookup 25 kills. None shown to user. (Assets 25 pages, BPC table 200 rows and remap optimizer 2 do show a notice.)
4. **Cross-Character reach is partial.** Wallet chart/Journal active Character only. Assets reach alts only in search. Palette reads caches only. Overview Mining tax card spans all Characters; corp runway uses division 1 only.
5. **CSV ignores view state.** Assets (drill, filters, sort), Calendar (kind, day filters), Members (no Roles column).
6. **Copy/code drift.** Settings hint says device-only but feed prefs sync. Copy says Overview, feed lives on `/alerts`. Permission count 13 vs 15. Mining Tax reads ESI's 30-day ledger while Overview keeps 90 days. Decision says ten-minute poll, code is 5 min. Contacts row menu promised, not shipped. Help/FAQ thin on Wallet, Assets, Contracts.
7. **View state local-only.** PI Find best toggles, Compare Set, pasted Appraisal list, Ship Tree URL (`?faction=` only), oversized fittings (no `?f=`), saved skill comparisons. Pilot Lookup ignores `?pilot=` for the search box.
8. **Phone/desktop parity.** Price history phone-only in Opportunities. Map has no phone trace. Group page hides Owned on phone. No desktop context menus in Opportunities.
9. **Push limits.** Only 12 of 25 alert events wake a closed app. Push registration failures log to console only.
10. **Stale data unlabeled.** (Contract search shows a snapshot age badge.) Pilot Lookup and Market-Wide have no data-age badge.

Per-area detail and line cites live in each file. Gaps flagged "inferred" or "unverified" in files were not confirmed in code.
