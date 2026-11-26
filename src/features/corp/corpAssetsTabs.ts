import type { LedgerState, LedgerTab } from '@/engine/corp/assetLedger';

export type CorpAssetTab = Exclude<LedgerTab, 'other'>;

export const CORP_ASSET_TABS: readonly CorpAssetTab[] = [
  'all',
  'offices',
  'deliveries',
  'inSpace',
  'fuelBay',
  'impounded',
  'assetSafety',
  'lockdown',
  'capsuleerDeliveries',
];

const SEGMENT: Readonly<Record<CorpAssetTab, string>> = {
  all: '',
  offices: 'offices',
  deliveries: 'deliveries',
  inSpace: 'in-space',
  fuelBay: 'fuel-bay',
  impounded: 'impounded',
  assetSafety: 'safety',
  lockdown: 'lockdown',
  capsuleerDeliveries: 'capsuleer-deliveries',
};

export function corpAssetTabFromPath(wildcard: string): CorpAssetTab | null {
  const segment = wildcard.replace(/^\/+|\/+$/g, '');
  return CORP_ASSET_TABS.find((tab) => SEGMENT[tab] === segment) ?? null;
}

export function corpAssetTabPath(tab: CorpAssetTab): string {
  return tab === 'all' ? '/corp/assets' : `/corp/assets/${SEGMENT[tab]}`;
}

export function tabForState(state: LedgerState): CorpAssetTab {
  return state === 'other' ? 'all' : state;
}

export type CorpAssetsPageTab = CorpAssetTab | 'move';

const MOVE_SEGMENT = 'move';

export function corpAssetsPageTabFromPath(wildcard: string): CorpAssetsPageTab | null {
  return wildcard.replace(/^\/+|\/+$/g, '') === MOVE_SEGMENT
    ? 'move'
    : corpAssetTabFromPath(wildcard);
}

export function corpAssetsPageTabPath(tab: CorpAssetsPageTab): string {
  return tab === 'move' ? `/corp/assets/${MOVE_SEGMENT}` : corpAssetTabPath(tab);
}
