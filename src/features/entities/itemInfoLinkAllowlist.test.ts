import { describe, it, expect } from 'vitest';

/**
 * Item names open Show info only where the row/card has no primary action of
 * its own (DESIGN.md §6c "A row's primary action beats name links inside it",
 * "Item names"). A new `ItemInfoLink` use must be reviewed against that rule
 * and added here; a row with `onRowClick`/`rowClickable`/`expandableRow`
 * keeps a plain name. Market-context pages use `MarketItemLink` instead.
 */
const REVIEWED = new Set<string>([
  'src/features/character/assetBrowserRows.tsx',
  'src/features/character/ContractDetailModal.tsx',
  'src/features/character/JournalDescriptionCell.tsx',
  'src/features/contracts/PublicContractDetailModal.tsx',
  'src/features/corp/CorpBoardRow.tsx',
  'src/features/corp/CorpRoster.tsx',
  'src/features/corp/CorpTransactionsPanel.tsx',
  'src/features/fittings/FittingFightersPanel.tsx',
  'src/features/fittings/FittingModuleList.tsx',
  'src/features/fittings/FittingPreviewPanels.tsx',
  'src/features/fittings/FittingRackList.tsx',
  'src/features/fittings/ImplantFinder.tsx',
  'src/features/fittings/ImplantSetPicker.tsx',
  'src/features/industry/ActiveJobsPanel.tsx',
  'src/features/industry/MaterialsTable.tsx',
  'src/features/industry/ProductionLogPanel.tsx',
  'src/features/market/OrderHistoryPanel.tsx',
  'src/features/market/TransactionsPanel.tsx',
  'src/features/market/UsedInSection.tsx',
  'src/features/skills/ImplantChip.tsx',
  'src/features/travel/PilotKillActivity.tsx',
  'src/features/travel/ZkillStatsSection.tsx',
  'src/routes/Clones.tsx',
]);

const sources = import.meta.glob<string>(['/src/**/*.tsx', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('ItemInfoLink uses', () => {
  it('are all reviewed against the primary-action rule', () => {
    const used = Object.entries(sources)
      .filter(([, source]) => /<ItemInfoLink[\s>]/.test(source))
      .map(([path]) => path.replace(/^\//, ''))
      .sort();
    expect(used).toEqual([...REVIEWED].sort());
  });
});
