# Neocom Desk feature inventory

Goal: know what exists so we know what to improve. Written from code, not memory. Each file has a summary table, Purpose and user goal (with a Mobbin brief for redesign reference), controls, persistence/sync, scopes, states, formulas, Interview Q&A, Observed gaps, Improvement ideas.

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

## Page goals and Mobbin fit

Each file's "Purpose and user goal" section ranks the pilot's top jobs, names what belongs above the fold, and ends with a Mobbin brief: analog apps, screen queries and what Mobbin can't cover. Start a redesign there. Claims without a source sit under each section's **Unconfirmed** line for the owner to correct. Phone evidence is `DEFAULT_MOBILE_TABS` (`src/lib/mobileTabs.ts`) plus phone decisions and issues; `mobileTab: true` alone proves little, since nearly every page has it.

Mobbin fit: **high** = mostly generic patterns; **low** = mostly EVE-specific views, take reference from EVE tools and the client instead. planetary-industry has no section: its overhaul has its own spec in `docs/design/pi-tabs/`.

| File                      | Top job                                                       | Device, cadence                              | Mobbin fit                   |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------- | ---------------------------- |
| overview                  | What is on a clock, and what runs out first                   | both; landing page, every session            | high                         |
| alerts                    | What fired while I was away, worst first                      | both; when the bell shows a count            | high                         |
| notifications             | Will I be told before things run out, for every Character     | both, push lands on phone; set once          | high                         |
| calendar                  | What happens next for this Character, and when                | both; before a session                       | medium-high                  |
| command-palette           | Take me to X                                                  | mostly desk keyboard                         | high                         |
| app-shell                 | Go to a page, as the right Character                          | both; every session                          | high                         |
| auth-login                | What will this do for me, and is it safe to log in            | both; once per Character                     | high                         |
| characters                | Which alt needs attention; switch to it                       | both; per session                            | medium                       |
| settings                  | Set my defaults once for every device                         | both; occasional                             | high                         |
| sync-backup               | Is my work synced; move to or wipe a device                   | both; rare                                   | medium                       |
| share-links               | Sender: copy a link; recipient: what did they send me         | at the moment of sharing or opening          | medium                       |
| entities-share            | Who or what is this name (Show Info)                          | mid-task, often                              | medium                       |
| clones                    | Which clone should I wear for this queue                      | both; when the queue changes                 | low-medium                   |
| employment-history        | Which corps has this Character been in, and for how long      | occasional                                   | high                         |
| skills                    | When does my plan finish, and how do I get there faster       | phone glance at queue, desk for plan editing | medium                       |
| ships                     | Can I fly hull X, and how long until I can                    | desk; occasional                             | low                          |
| fittings                  | Can I fly this fit, and how does it perform                   | desk to edit, phone to look up; occasional   | low-medium                   |
| mining                    | What did I mine and what's it worth; what does each Payee owe | desk bookkeeping; after mining or billing    | high (Tax), medium           |
| mining-survey             | How much of the field is left, and the ETA                    | both; during an op                           | medium                       |
| contacts                  | What standing do I have with this name; do my alts agree      | desk; occasional                             | medium-high                  |
| mail                      | What's unread, on which Character                             | both; when mail arrives                      | high                         |
| wallet                    | Net worth and its trend; then where the ISK went              | both; wallet alert opens Journal             | high                         |
| assets                    | Where is item X, on which Character                           | both; on demand                              | medium                       |
| contracts                 | Cheapest public listing of an item; courier pay per jump      | both; contract alerts open History           | medium                       |
| market                    | Which of my orders need me; price one item or a pile          | both; default phone tab, alert-driven        | medium                       |
| corp                      | Next corp deadline or fuel running out                        | likely desk; fuel alert opens `/corp`        | medium                       |
| industry-plans            | Is this build profitable: build or buy                        | both; default phone tab                      | low                          |
| industry-records-sourcing | Which jobs are done; what to build next                       | both; job-complete alert opens Industry      | medium                       |
| travel                    | What happened along my route in the last hour                 | both; per trip                               | medium                       |
| pilot-lookup              | Am I in danger (D-Scan), who is in Local                      | both; several times a play session           | low-medium                   |
| help-faq                  | Which keys and pastes work; what do you store                 | both; occasional                             | high                         |
| styleguide-notfound       | Developer: check a token or cue; pilot: leave a dead URL      | desk (styleguide); any device (404)          | low (styleguide), high (404) |

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
