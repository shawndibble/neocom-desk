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
| [wallet-balance-trend](wallet-balance-trend/README.md) | worked example | story `mockups-wallet--proposed`, today vs proposed |
| [corp-tax-book](corp-tax-book/README.md) | Issue #4056 (UI: #4063, #4064, #4065, #4066) | Final: A's drill-down pages, C's timeline + Needs you + Statement run, B's mail preview (dialog) and guest page, queue chip with % badge on phone, personal tab = today's Tax tab + corp states |
| [collector-books](collector-books/README.md) | Spec #4504 (UI: #4512, #4513, #4514, #4520) | List A (sortable Moon owners table) for the accounting corporation, Page B (plain statement first) for the moon owner |
| [corp-projects](corp-projects/README.md) | Issue #4530 | Industry › Projects as the fifth tab; summary strip, chips, read-only table; grant and empty states |
| [fittings-restock](fittings-restock/README.md) | Issue #4550 | Appraisal's card title becomes a source select (Paste / From my Fittings); Fittings with hull-count steppers; Send to Build Group… in the actions menu; Appraise and Clear inline on phone |
| [queue-remap-advice](queue-remap-advice/README.md) | Issue #4701 | Optimize queue at the foot of the Attributes card (full width, under the remap budget): one press makes a plan from the queue with the optimizer's Remap Markers and opens it, Undo toast; empty queue aria-disabled, already optimal makes no plan |

First draft mockup; sample data. The ticket's Agent Brief text wins over the picture where they differ.
