# Shared code: use it before writing your own

Before writing a helper, grep for it (`grep -rn "function <name>" src`) and check
this table. A private copy of something below is a defect; the 2026-10 DRY sweep
removed over 50 of them (`isRecord`, `chunk`, `utcDay`, `DAY_MS`, `Translate`).
Add a row here when you add a shared helper.

UI primitives are not listed: `npm run ui:catalog` (see `docs/DESIGN.md`).

| Need                                                        | Use                                                                                                                     | Not                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Narrow `unknown` to an object / finite number               | `isRecord`, `isPlainRecord` (rejects arrays), `isFiniteNumber` — `src/engine/guards.ts`                                 | a local `isRecord`/`isObject`/`isNum`             |
| Split an array into batches                                 | `chunk` — `src/lib/chunk.ts`                                                                                            | a local `chunk`/`chunks`, `slice(i, i + n)` loops |
| Time constants                                              | `MINUTE_MS`, `HOUR_MS`, `DAY_MS` — `src/lib/age.ts`                                                                     | `86_400_000` literals, a local `DAY_MS`           |
| UTC (EVE) `YYYY-MM-DD` of a timestamp, shift a UTC date     | `utcDay`, `shiftUtcDate` — `src/engine/localDay.ts`                                                                     | `new Date(ms).toISOString().slice(0, 10)`         |
| Local calendar day boundaries                               | `localMidnight`, `dayStart`, `nextDay`, `cellOf` — `src/engine/localDay.ts`                                             | `ms % 86_400_000` (wrong for an hour around DST)  |
| "How long ago" / durations                                  | `src/lib/age.ts`, `src/lib/duration.ts` (i18next plural keys)                                                           | hand-built "3h ago" strings                       |
| Clamp, sum, median                                          | `clamp`, `sum`, `median` — `src/engine/math.ts`; 0–100 percent in `src/lib/clampPct.ts`                                 | inline `Math.max(0, Math.min(...))`               |
| The `t` function passed into pure text builders             | `Translate` — `src/lib/translate.ts`                                                                                    | a per-file `type Translate`                       |
| Class-name joining                                          | `cx` — `src/lib/cx.ts`                                                                                                  | template-string class concatenation               |
| CSV / XLSX export                                           | `src/lib/csv.ts`, `src/lib/exportSheets.ts` (formula-injection guard included)                                          | hand-joined CSV                                   |
| A clock that re-renders on an interval                      | `useTicker(intervalMs)` (shared timer, pauses when hidden), `useNow` — `src/lib/ticker.ts`, `useNow.ts`                 | a component-local `setInterval`                   |
| Debounce, media queries, URL state, synced settings         | `useDebouncedValue`, `useMediaQuery`, `useUrlParams`/`useUrlFilter`/`useUrlSort`, `createSyncedSetting` — `src/lib/`    | re-implementing them                              |
| Bounded-concurrency async work against ESI                  | `src/lib/concurrency.ts`, `src/lib/asyncPool.ts`, `src/esi/budget.ts`                                                   | `Promise.all` over unbounded input; p-limit       |
| Fuzzy item-name search                                      | `src/lib/fuzzySearch.ts`                                                                                                | a new Levenshtein                                 |
| Test data: characters, grants, deferred promises, ESI cache | `src/test/seed.ts`, `src/test/deferred.ts`, `src/esi/cacheFixtures.ts`                                                  | per-file `seedCharacter`/`seedGrant`              |
| A test on a given viewport (a `matchMedia` stub)            | `stubViewport(query \| predicate)`, `fakeMediaQueryList` — `src/test/viewport.ts`; name every query the component reads | a hand-cast `as unknown as MediaQueryList`        |
| An e2e spec's phone / desktop viewport                      | `PHONE`, `DESKTOP` — `e2e/support/testBase.ts`                                                                          | a per-spec `const PHONE`/`const DESKTOP`          |

## Cloud Functions (`functions/src`)

`firebase.json` deploys `functions/` alone, so a `../src` import cannot resolve
at runtime — hence a mirrored copy, not an import. `src/functionsParity.test.ts`
asserts the copies agree, so a change to one side that skips the other fails
there. Mirrored so far: the guards below, and `esiClient.ts`'s compatibility
date and User-Agent against `src/esi/`.

| Need                                  | Use                                                                                                             | Not                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Narrow `unknown` to an object         | `functions/src/guards.ts` — the same three names as `src/engine/guards.ts`                                      | a local `isRecord`; importing `src/engine`           |
| Anything an ESI call puts on the wire | `esiHeaders(accessToken?)`, `ESI_ROOT`/`ESI_BASE`, `isBudgetLow`, `retryAfterMs` — `functions/src/esiClient.ts` | spelling out `X-Compatibility-Date` / `X-User-Agent` |
| A Firestore-emulator suite's set-up   | `emulatorSuite`, `emulatorDb`, `clearEmulator` — `functions/src/testSupport/emulator.ts`                        | a per-file `runnable` probe and `clearEmulator`      |

Two carve-outs, both marked in their own docblocks: `costIndicesSnapshot.ts` and
`r2Client.ts` take no relative _runtime_ imports, because
`functions/scripts/backfill-cost-indices.mjs` loads them under Node type
stripping, where `./guards.js` resolves to nothing. They inline what they need.
`Retry-After` has two readers on purpose: `esiClient.retryAfterMs` for ESI, and
`workbenchFits.parseRetryAfterMs` (HTTP-date form, capped) for the other syncs.

## Dates and times

No date library, on purpose. EVE time is UTC with no DST, so UTC arithmetic via
`utcDay`/`shiftUtcDate` is exact. Calendar-day logic for the user's own zone
goes through `src/engine/localDay.ts`, which zeroes `Date` fields instead of
dividing by `86_400_000`, so DST changes cannot skew it. Display formatting uses
`Intl.DateTimeFormat` with `timeZone`, so the platform's tz database supplies the
world's rules. Reach for a library (or `Temporal` once baseline) only for
something `Intl` plus those helpers cannot express, such as recurring-event
expansion across zones, and record the reason in `docs/context/decisions/`.

## Packages

Prefer what is installed (`radix-ui`, `@tanstack/react-virtual`, `@dnd-kit/*`,
`@use-gesture/react`, `dexie`, `zustand`, `fflate`, `react-markdown`) over a new
dependency. This is a PWA, so bundle size counts. Check an installed package
before adding one, and record a new dependency's reason in the PR.

## Known remainders

Not yet migrated; move them to the shared helper when you touch the file.

- `new Date(ms).toISOString().slice(0, 10)` copies of `utcDay` (for example `src/backup/io.ts`, `src/engine/corpTaxBook/{billable,statements,verifyView}.ts`, `src/features/corp/moons/*`).
- Raw `86_400_000` literals and a local `DAY` in `corp/deadlines.ts`, `market/orderBook.ts`, `netWorth/snapshot.ts`, `ExtractionTimeline.tsx` and others.
- `src/features/miningTax/paymentLinks.ts` exports a different `utcDay(date: string): number`; do not mistake it for the shared one.
- Hand-built spinner and inline-error wrappers (96 and 83 sites) where a `Spinner` size option and an `InlineError` primitive do not exist yet.
- Hand-cast `matchMedia` stubs in 35 test files that `stubViewport` would replace: `src/components/ui/*.test.tsx` (7), the market panels, and the route tests (`Calendar`, `Contacts`, `ContactsStandings`, `Contracts`, `Mail`, `Market`, `Overview`, `Wallet`, `SkillPlans`, `LoyaltyStore`, `IndustryPlanPage`). `Layout.test.tsx` matches every query in one place and `prefers-reduced-motion` in another, and `InstallPrompt.test.tsx` matches every query; the predicate form of `stubViewport` covers all three.
- `{ width: 390, height: 844 }` is still written out inline in 27 e2e specs (9 of them PI) and `{ width: 1280, height: 800 }` in 7. The sweep moved the specs that had named the size as a constant; these never did, so a grep for `const PHONE` does not find them. Four PI specs (`piColonies`, `piPhoneLayout`, `planetaryIndustryFindBest`, `planetaryIndustryNarrow`) do name it and are left alone while those pages are overhauled.
- `e2e/support/controlHeights.ts` exports `CONTROL_ROW_WIDTHS = [1280, 390]`, and `playwright.config.ts` sets `viewport: { width: 1280, height: 800 }` as the suite default: a third and fourth spelling of the same two widths. Folding them together means moving `PHONE`/`DESKTOP` to a module of their own, because the config cannot import `testBase.ts` (it calls `base.extend` at import time), and that is its own pass.
- `src/app/loginFlow.dom.test.ts` writes a token row with no `scopes` field at all, which `seedGrant` cannot express; its raw `db.tokens.put` is deliberate.
- Raw character/token writes `seed.ts` would cover, not yet migrated: `src/lib/persistStorage.test.ts`, `src/auth/session.dom.test.ts` (`seedCharacterInCorp`) and `src/routes/CommunityJoin.test.tsx` (`seedCharacters`).
- `structures.test.ts`, `miningTax/ledger.test.ts` and `miningTax/snapshot.test.ts` each wrap `seedCharacter` only to pin `{ ownerHash: 'oh', addedAt: 0 }` — three copies of one override. Nothing reads either field in those tests, so those wrappers can go the way `roster.test.ts`'s did; left for whoever next touches the files.
- `src/lib/pageTabs.test.ts` has its own `stubViewport(wide: boolean)` and cannot use the shared one: it runs in the `node` project, where there is no `window` for `vi.spyOn` to attach to, so it stubs the whole global. Rename it if you touch the file; don't migrate it.
- `seedGrant`'s default `expiresAt` is `Date.now() + 60_000`, exactly `auth/session.ts`'s `EXPIRY_BUFFER_MS`, so a grant seeded with the default always reads as due for refresh. No test depends on that today (the ones that reach `getValidAccessToken` inject `getToken`), and the fixtures that were seeded clear of it pass an explicit `expiresAt`. Raising the default is its own change.
- `stubViewport` matches by string equality, so naming one query leaves the others false — `stubViewport(PHONE_QUERY)` does not make the `max-width` `NARROW_QUERY` match, even though a real phone is narrow. Pass a predicate naming every query the component reads. The better shape is a helper taking a width and answering each `(min|max)-width:` query against it; doing that before the remaining 35 files migrate is cheaper than after, and would turn these calls into `stubViewport(390)`.
