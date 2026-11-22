# Mockups

## Workflow: a mockup is a story

Hand-written HTML and copied token CSS are not the default. A mockup is a page-level Storybook story built from the real components, so it looks like what will ship.

1. Look up primitives: `npm run ui:catalog` (list) and `npm run ui:catalog <Name>` (props, story ids). Read `docs/DESIGN.md` §6c.
2. Create `src/mockups/<Page>.stories.tsx`. Title `mockups/<Page>`, `tags: ['!manifest']` (keeps it out of `/manifests/components.json`; `src/mockups/mockups.test.ts` enforces both). Add `@summary` to each story.
3. Render the real page: `parameters: { shell: { path: '/wallet/balance' } }` puts it in the real shell with fixtures from `src/storybook/sampleData.ts`. Add proposed pieces in `render`. Example: `src/mockups/Wallet.stories.tsx`.
4. Anything that is not an existing primitive: wrap it in `<NewComponent name="X">` (`src/mockups/NewComponent.tsx`). The dashed "New component: X" label shows in the screenshot. List every such component in the story's JSDoc description, under "New components in this mockup".
5. Phone variant: a second story with `globals: { viewport: { value: 'mobile1', isRotated: false } }`.
6. Screenshots: `npm run ui:shot -- mockups-<page>--<story>` (1440 and 390 by default; PNGs land in `.cache/ui-shot/`). Today: `npm run ui:shot -- pages-<page>--<story>` from the real page story, or an e2e-seeded page if no page story exists.
7. Publish: copy the PNGs to `docs/design/mockups/<name>/` with a README that shows today vs proposed in a table (see `wallet-balance-trend/`). Link that README from the ticket.
8. Mockup stories are excluded from the manifest (`!manifest`) and from coverage (`src/mockups/**` in `vite.config.ts`). They are not smoke-rendered (`src/storybook/smoke/*.test.tsx` skips them: a mockup is a throwaway); typecheck and `src/mockups/mockups.test.ts` still run on them.
9. Delete the mockup story and its folder when the ticket closes; git history keeps it.

## Mockup screenshots

PNG exports of the chosen mockups for ready tickets. Delete a folder (and its row) when its issue closes; git history keeps it. The originals are private Claude artifacts that other accounts cannot read. Read the PNGs from the repo.

| Folder | Issue | Chosen |
|---|---|---|
| [wallet-balance-trend](wallet-balance-trend/README.md) | worked example | story `mockups-wallet--proposed`, today vs proposed |
| [corp-tax-book](corp-tax-book/README.md) | Issue #4056 (UI: #4063, #4064, #4065, #4066) | Final: A's drill-down pages, C's timeline + Needs you + bill run (now Late notices), B's mail preview (dialog) and guest page, queue chip with % badge on phone, personal tab = today's Tax tab + corp states |
| [collector-books](collector-books/README.md) | Spec #4504 (UI: #4512, #4513, #4514, #4520) | List A (sortable Moon owners table) for the accounting corporation, Page B (plain statement first) for the moon owner |
| [fittings-restock](fittings-restock/README.md) | Issue #4550 | Appraisal's card title becomes a source select (Paste / From my Fittings); Fittings with hull-count steppers; Send to Build Group… in the actions menu; Appraise and Clear inline on phone |
| [queue-remap-advice](queue-remap-advice/README.md) | Issue #4701 | Optimize queue at the foot of the Attributes card (full width, under the remap budget): one press makes a plan from the queue with the optimizer's Remap Markers and opens it, Undo toast; empty queue aria-disabled, already optimal makes no plan |
| [compare-trade-hubs](compare-trade-hubs/README.md) | Issue #4696 (build: #4697) | Desktop as proposed (items × hubs, best sell over best buy, LOWEST/HIGHEST words, jumps in headers); table at every width (phone scrolls sideways, item pinned, "Hubs" label); own hub highlighted |
| [srp](srp/README.md) | Epic #4608 (mockups #4847; build #4848-#4856) | Member filing with lost-ships list, officer queue (approve, reject with reason, override, Mark paid), Director settings with Hull Rules, `corpSrp` widget; phone uses dense cards |
| [moons-add-my-corps](moons-add-my-corps/README.md) | Grilling session (no issue yet) | Add my other corps: picker, one confirm with How far back, guided sign-in, status list with Yours pills, Hidden corps |
| [moon-mining-at-scale](moon-mining-at-scale/README.md) | Review request (no issue yet) | Officer pages for one heavy miner across 57 pops: pops folded by month with bill and owed in each header, payments that filter the pops they cleared, per-pop and per-moon tax adjustments, bulk bills and reminders |
| [fittings-doctrine](fittings-doctrine/README.md) | Issue #6202 | Doctrine rows in the Fittings Start list with a Doctrine tag; an older fit's re-save note in the preview, or on the row on a phone |
| [mining-tax-resolve](mining-tax-resolve/README.md) | Review request (no issue yet) | Not chosen yet: A (inline button + menu) or B (one Resolve dialog per problem); five outcomes split by who has to agree, a quiet line after answering, left-the-corp notice, officer won't-pay card and tax contact setting |
| [lp-store-spend-my-lp](lp-store-spend-my-lp/README.md) | Issue #6199 | Spend my LP button beside the offers list's actions; the plan opens above the offers: headline, offer × N table, stop line naming the floor or wallet, LP left |
| [extraction-autofracture-bar](extraction-autofracture-bar/README.md) | Issue #6297 | Extractions timeline: today's green bar runs Ready to Expired as one bar, laser tick for early fracture, tooltip with Ready / Auto-fracture / Expired dates and time left |
| [moon-owner-archive](moon-owner-archive/README.md) | Issue #6298 | Chosen: miner name is an accent link (A); refinery name opens its page, pencil kept; Archive on the refinery page only (A); Archived section with Restore; offer rule R3 (ESI gone or 60 days idle); mining at an archived refinery restores it |
| [moons-all-moons](moons-all-moons/README.md) | Issue #6299 | Chosen: Moons tab with a flat sortable list (A); opened moon is a table of Extractions (A), a row opens `/corp/moons/extractions/:id`; moon names in other lists link to the moon page |
| [review-member](review-member/README.md) | Owner request (no issue yet) | Not chosen yet: roster autocomplete for Review a member (no-match, already-waiting, picked states), role suggestions, result step with a sent-on-purpose in-game mail and preview, waiting queue rows with mail state and menu, request page before the member shares, the member's page top |
| [moons-settings-and-layout](moons-settings-and-layout/README.md) | Issue #6304 | Chosen by the agent: Sharing is a fifth Moon settings tab (scrolls in the modal, saves apart); Moons page keeps its layout, six tabs |
| [payee-one-per-entity](payee-one-per-entity/README.md) | Issue #6308 | Chosen by the agent: one Manage Payees row per recipient with "Used by N characters"; differing terms shown as one "Use … for all" button per distinct terms |
| [vetting-raw-data](vetting-raw-data/README.md) | Issue #6341 | Chosen by the agent: Data we read on the report (one row per source); a page per review with source tabs, a character switcher, filters and one windowed table (all rows, no cap); flagged rows and flags link both ways; empty and no-match are two states; consent says rows are kept after Send |
| [phone-status-strip](phone-status-strip/README.md) | Issue #6560 | Chosen by the agent: re-login, role notice and sync error as rows of one shell strip; actions wrap under the words on a phone |

First draft mockup; sample data. The ticket's Agent Brief text wins over the picture where they differ.
