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
8. Mockup stories are excluded from the manifest (`!manifest`) and from coverage (`src/mockups/**` in `vite.config.ts`). They still render in `src/stories.test.tsx`, so a broken mockup fails CI.
9. Delete the mockup story and its folder when the ticket closes; git history keeps it.

## Mockup screenshots

PNG exports of the chosen mockups for ready tickets. Delete a folder (and its row) when its issue closes; git history keeps it. The originals are private Claude artifacts that other accounts cannot read. Read the PNGs from the repo.

| Folder | Issue | Chosen |
|---|---|---|
| [lp-store-search](lp-store-search/README.md) | Issue #2873 | option B, one box for item or corporation |
| [wallet-balance-trend](wallet-balance-trend/README.md) | worked example | story `mockups-wallet--proposed`, today vs proposed |
| [stock-targets](stock-targets/index.html) | Issue #3521 | revised: Market › Stock, one list per market (station picked), listed vs hangar; HTML, not PNGs |
| [wallet-journal-all-characters](wallet-journal-all-characters/README.md) | Issues #3908, #3914, #3915 | revised: side panel that filters the Journal, hideable daily chart, phone day-grouped list |
| [fitting-can-fly-by-character](fitting-can-fly-by-character/README.md) | Issue #3910 | revised: Your Characters section in the stats column, chips + search + closest-first table |
| [open-orders-work-through](open-orders-work-through/README.md) | Issue #3991 | work-through controls inside the current row, summary line counter |
| [market-history-trading-profit](market-history-trading-profit/README.md) | Issue #3995 | strip Margin + Broker fees, By item / By day, All characters filter |
| [plan-slot-schedule](plan-slot-schedule/README.md) | Issue #3985 | slot line "Uses N slots · done by", Show plan expands in-line |
| [plan-order-book-depth](plan-order-book-depth/README.md) | Issue #3993 | Price cell "best · avg for N", Calculation Breakdown levels |
| [price-vs-90d](price-vs-90d/README.md) | Issue #3994 | vs 90d column in Opportunities, amber plan note |
| [blueprint-acquisition-invent](blueprint-acquisition-invent/README.md) | Issue #3990 | Invent section, one tier per decryptor |
| [contracts-below-market](contracts-below-market/README.md) | Issue #3989 | Below market chip, one row per contract |
| [overview-market-industry-widgets](overview-market-industry-widgets/README.md) | Issues #3985, #3989, #3991, #3994, #3995 | Overview widget changes and two new widgets |

First draft mockup; sample data. The ticket's Agent Brief text wins over the picture where they differ.
