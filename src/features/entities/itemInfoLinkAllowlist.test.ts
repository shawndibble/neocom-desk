import { describe, it, expect } from 'vitest';

const REVIEWED = new Set<string>([
  'src/features/abyssal/AbyssalItemDetail.tsx',
  'src/features/assets/assetBrowserRows.tsx',
  'src/features/character/CloneCard.tsx',
  'src/features/character/ContractDetailModal.tsx',
  'src/features/character/JournalDescriptionCell.tsx',
  'src/features/character/MailBodyView.tsx',
  'src/features/character/walletTransactionColumns.tsx',
  'src/features/communities/SharedBlueprintTable.tsx',
  'src/features/contracts/PublicContractDetailModal.tsx',
  'src/features/corp/CorpAssetContents.tsx',
  'src/features/corp/useRosterColumns.tsx',
  'src/features/fittings/AbyssalRunPlanner.tsx',
  'src/features/fittings/FittingFightersPanel.tsx',
  'src/features/fittings/FittingModuleList.tsx',
  'src/features/fittings/FittingPreviewPanels.tsx',
  'src/features/fittings/RackListParts.tsx',
  'src/features/fittings/ImplantFinder.tsx',
  'src/features/fittings/ImplantSetPicker.tsx',
  'src/features/industry/activeJobColumns.tsx',
  'src/features/industry/MaterialsTable.tsx',
  'src/features/industry/ProductionLogPanel.tsx',
  'src/features/market/HaulingItemDetail.tsx',
  'src/features/market/MadeFromSection.tsx',
  'src/features/market/UsedInSection.tsx',
  'src/features/skills/SkillRequirementsList.tsx',
  'src/features/travel/PilotShips.tsx',
  'src/features/travel/ZkillStatsSection.tsx',
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
