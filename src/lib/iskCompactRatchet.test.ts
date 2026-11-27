import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, '..');
const offenders = tsxFiles(root)
  .filter((path) => {
    if (path.includes('/charts/')) return false;
    const source = readFileSync(path, 'utf8');
    return /formatIskCompact/.test(source) && !/from 'recharts'/.test(source);
  })
  .map((path) => 'src/' + path.slice(root.length + 1));

const ALLOWED = new Set<string>([
  'src/components/ui/IskAmount.tsx',
  'src/features/assets/AssetsList.tsx',
  'src/features/assets/AssetsToolbar.tsx',
  'src/features/assets/useAssetsData.tsx',
  'src/features/bpcContracts/BpcFilterBar.tsx',
  'src/features/bpcContracts/BpoBadge.tsx',
  'src/features/contractSearch/ContractSearchPanel.tsx',
  'src/features/contractSearch/CourierResults.tsx',
  'src/features/corp/srp/DoctrineFitsPanel.tsx',
  'src/features/corp/srp/SrpBulkBar.tsx',
  'src/features/fittings/ImproveSearchStatus.tsx',
  'src/features/fittings/ImproveSelectionSummary.tsx',
  'src/features/fittings/ImproveSettingsPanel.tsx',
  'src/features/industry/corpProjects/CorpProjectCards.tsx',
  'src/features/industry/corpProjects/CorpProjectCells.tsx',
  'src/features/industry/corpProjects/CorpProjectsPanel.tsx',
  'src/features/industry/DepthPriceLine.tsx',
  'src/features/industry/MaterialsPhoneRow.tsx',
  'src/features/industry/MaterialsTable.tsx',
  'src/features/industry/SwapButton.tsx',
  'src/features/interactions/InteractionsList.tsx',
  'src/features/interactions/InteractionsTab.tsx',
  'src/features/loyalty/SpendPlan.tsx',
  'src/features/market/FullIskTotal.tsx',
  'src/features/market/HaulingPanel.tsx',
  'src/features/market/HaulingTripRail.tsx',
  'src/features/market/HubCompareCards.tsx',
  'src/features/market/ItemDetailModal.tsx',
  'src/features/market/MarketOrderBook.tsx',
  'src/features/market/OpenOrdersFilterFields.tsx',
  'src/features/market/QuickbarList.tsx',
  'src/features/market/useAppraisalColumns.tsx',
  'src/features/market/VariationsTable.tsx',
  'src/features/netWorth/WalletWaitingGoal.tsx',
  'src/features/pi/colonies/ColonyRowView.tsx',
  'src/features/pi/goalPlanResults/Headline.tsx',
  'src/features/pi/MakeMorePlan.tsx',
  'src/features/pi/map/ChainTileFigure.tsx',
  'src/features/pi/map/MapBoard.tsx',
  'src/features/pi/map/MapPhone.tsx',
  'src/features/pi/map/PlanMapPieces.tsx',
  'src/features/pi/PlanSlotNudge.tsx',
  'src/features/skills/planner/SkillsToBuyPanel.tsx',
  'src/features/travel/KillLocationModal.tsx',
  'src/features/travel/PilotKillmailsSection.tsx',
  'src/mockups/srpMemberPhone.tsx',
  'src/routes/Characters.tsx',
]);

describe('compact ISK outside charts', () => {
  it('no new file uses formatIskCompact', () => {
    expect(offenders.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it('allowlist lists only files still using it', () => {
    expect([...ALLOWED].filter((f) => !offenders.includes(f))).toEqual([]);
  });
});
