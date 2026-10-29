# Shared code: use it before writing your own

Before writing a helper, grep for it (`grep -rn "function <name>" src`) and check
this table. A private copy of something below is a defect; the 2026-10 DRY sweep
removed over 50 of them (`isRecord`, `chunk`, `utcDay`, `DAY_MS`, `Translate`).
Add a row here when you add a shared helper.

UI primitives are not listed: `npm run ui:catalog` (see `docs/DESIGN.md`).

| Need                                                        | Use                                                                                                                     | Not                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Narrow `unknown` to an object / finite number               | `isRecord`, `isPlainRecord` (rejects arrays), `isFiniteNumber` — `src/engine/guards.ts`                                 | a local `isRecord`/`isObject`/`isNum`                                        |
| Split an array into batches                                 | `chunk` — `src/lib/chunk.ts`                                                                                            | a local `chunk`/`chunks`, `slice(i, i + n)` loops                            |
| Time constants                                              | `MINUTE_MS`, `HOUR_MS`, `DAY_MS` — `src/lib/age.ts`                                                                     | `86_400_000` literals, a local `DAY_MS`                                      |
| UTC (EVE) `YYYY-MM-DD` of a timestamp, shift a UTC date     | `utcDay`, `shiftUtcDate` — `src/engine/localDay.ts`                                                                     | `new Date(ms).toISOString().slice(0, 10)`                                    |
| Local calendar day boundaries                               | `localMidnight`, `dayStart`, `nextDay`, `cellOf` — `src/engine/localDay.ts`                                             | `ms % 86_400_000` (wrong for an hour around DST)                             |
| "How long ago" / durations                                  | `src/lib/age.ts`, `src/lib/duration.ts` (i18next plural keys)                                                           | hand-built "3h ago" strings                                                  |
| Clamp, sum, median                                          | `clamp`, `sum`, `median` — `src/engine/math.ts`; 0–100 percent in `src/lib/clampPct.ts`                                 | inline `Math.max(0, Math.min(...))`                                          |
| The `t` function passed into pure text builders             | `Translate` — `src/lib/translate.ts`                                                                                    | a per-file `type Translate`                                                  |
| Class-name joining                                          | `cx` — `src/lib/cx.ts`                                                                                                  | template-string class concatenation                                          |
| CSV / XLSX export                                           | `src/lib/csv.ts`, `src/lib/exportSheets.ts` (formula-injection guard included)                                          | hand-joined CSV                                                              |
| A clock that re-renders on an interval                      | `useTicker(intervalMs)` (shared timer, pauses when hidden), `useNow` — `src/lib/ticker.ts`, `useNow.ts`                 | a component-local `setInterval`                                              |
| Debounce, media queries, URL state, synced settings         | `useDebouncedValue`, `useMediaQuery`, `useUrlParams`/`useUrlFilter`/`useUrlSort`, `createSyncedSetting` — `src/lib/`    | re-implementing them                                                         |
| Bounded-concurrency async work against ESI                  | `src/lib/concurrency.ts`, `src/lib/asyncPool.ts`, `src/esi/budget.ts`                                                   | `Promise.all` over unbounded input; p-limit                                  |
| Fuzzy item-name search                                      | `src/lib/fuzzySearch.ts`                                                                                                | a new Levenshtein                                                            |
| Test data: characters, grants, deferred promises, ESI cache | `src/test/seed.ts`, `src/test/deferred.ts`, `src/esi/cacheFixtures.ts`                                                  | per-file `seedCharacter`/`seedGrant`                                         |
| A test on a given viewport (a `matchMedia` stub)            | `stubViewport(query \| predicate)`, `fakeMediaQueryList` — `src/test/viewport.ts`; name every query the component reads | a hand-cast `as unknown as MediaQueryList`                                   |
| A test file that mocks HTTP with MSW                        | `mswServer(...handlers)` — `src/test/msw.ts` (listens, resets after each test, closes; unmocked requests fail)          | a hand-built `setupServer` + `beforeAll`/`afterEach`/`afterAll`              |
| A component test that needs a Router but no `<Routes>`      | `renderInRouter(ui)` — `src/test/render.tsx` (a `MemoryRouter` wrapper, so `rerender` keeps it)                         | a per-file `const render = (ui) => rtlRender(ui, { wrapper: MemoryRouter })` |
| An e2e spec's phone / desktop viewport                      | `PHONE`, `DESKTOP` — `e2e/support/testBase.ts`                                                                          | a per-spec `const PHONE`/`const DESKTOP`                                     |
| Why a Fitting Share Code failed to decode                   | `ShareDecodeError` — `src/engine/fittings/fittingShare.ts`                                                              | a per-hook `type ShareDecodeError`                                           |

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

- `new Date(...).toISOString().slice(0, 10)` in test files and fixtures (about a dozen), and the one in `src/features/miningTax/sessionContinuation.ts` (`nextEveDate`), which takes a `YYYY-MM-DD` string and steps it with `setUTCDate`: that is `shiftUtcDate(date, 1)`, not `utcDay`. `src/features/pi` is left alone while it is overhauled.
- Raw `86_400_000`/`3_600_000`/`60_000` literals and local `DAY`/`HOUR` constants in about 100 test files (`const HOUR = 3_600_000; const DAY = 24 * HOUR;`), the compound spellings `24 * 60 * 60 * 1000` / `5 * 60 * 1000` in source and tests, and `src/features/pi`. `src/engine/pi/chain.ts`'s `60_000` is an ISK value, not a duration. `seedGrant`/`auth/session.ts` keep their `60_000` (see below).
- `src/features/miningTax/paymentLinks.ts` exports a different `utcDay(date: string): number`; do not mistake it for the shared one.
- Hand-cast `matchMedia` stubs that stay: `src/features/pi/map/PlanMap.test.tsx` (PI pages are being overhauled), and `src/sync/webPushSupport.test.ts`, which opts into jsdom with a docblock in the `node` project, where `vitest.setup.dom.ts` never runs, so there is no `window.matchMedia` for `vi.spyOn` to attach to (the same reason as `pageTabs.test.ts` below), and `src/app/pageTabs.test.ts`, which stubs the whole `window` global with `vi.stubGlobal` for the same reason.
- `{ width: 390, height: 844 }` and `{ width: 1280, height: 800 }` are still written out inline in the PI e2e specs (`piAccountPlan`, `piColonies`, `piEsiError`, `piMapWhatIfShift`, `piNearestHub`, `piNoScope`, `piPhoneLayout`, `piPricesDown`, `piQuestionUrl`, `piRichness`, `planetaryIndustryFindBest`, `planetaryIndustryMap`, `planetaryIndustryNarrow`), left alone while those pages are overhauled. Every other spec uses `PHONE`/`DESKTOP`.
- `e2e/support/controlHeights.ts` exports `CONTROL_ROW_WIDTHS = [1280, 390]`, and `playwright.config.ts` sets `viewport: { width: 1280, height: 800 }` as the suite default: a third and fourth spelling of the same two widths. Folding them together means moving `PHONE`/`DESKTOP` to a module of their own, because the config cannot import `testBase.ts` (it calls `base.extend` at import time), and that is its own pass.
- `src/app/loginFlow.dom.test.ts` writes a token row with no `scopes` field at all, which `seedGrant` cannot express; its raw `db.tokens.put` is deliberate.
- `src/lib/pageTabs.test.ts` has its own `stubViewport(wide: boolean)` and cannot use the shared one: it runs in the `node` project, where there is no `window` for `vi.spyOn` to attach to, so it stubs the whole global. Rename it if you touch the file; don't migrate it.
- `seedGrant`'s default `expiresAt` is `Date.now() + 60_000`, exactly `auth/session.ts`'s `EXPIRY_BUFFER_MS`, so a grant seeded with the default always reads as due for refresh. No test depends on that today (the ones that reach `getValidAccessToken` inject `getToken`), and the fixtures that were seeded clear of it pass an explicit `expiresAt`. Raising the default is its own change.
- `stubViewport` matches by string equality, so naming one query leaves the others false — `stubViewport(PHONE_QUERY)` does not make the `max-width` `NARROW_QUERY` match, even though a real phone is narrow. Pass a predicate naming every query the component reads. The better shape is a helper taking a width and answering each `(min|max)-width:` query against it; it would turn the roughly 60 call sites across the migrated test files into `stubViewport(390)`.
