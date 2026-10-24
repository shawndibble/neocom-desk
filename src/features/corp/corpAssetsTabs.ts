/**
 * The `/corp/assets` state tabs (issue #4671, ADR 0015): the tab is the path
 * segment and the bare path is All, so the Corp overview widget can link to
 * `/corp/assets/impounded` and to `/corp/assets` itself.
 *
 * Not a `definePageTabs` page: that registry redirects the bare base path to a
 * default tab, and All has to live at `/corp/assets`. Any other segment (the
 * old division/container drill-down URLs) is `null` here, and the page sends
 * it to `/corp/assets` with its query string.
 */
import type { LedgerState, LedgerTab } from '@/engine/corp/assetLedger';

/** A tab the page can show; `other` (the never-dropped fallback) has none and only appears under All. */
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

/** The tab a `/corp/assets/*` wildcard names, or null for an unknown path. */
export function corpAssetTabFromPath(wildcard: string): CorpAssetTab | null {
  const segment = wildcard.replace(/^\/+|\/+$/g, '');
  return CORP_ASSET_TABS.find((tab) => SEGMENT[tab] === segment) ?? null;
}

export function corpAssetTabPath(tab: CorpAssetTab): string {
  return tab === 'all' ? '/corp/assets' : `/corp/assets/${SEGMENT[tab]}`;
}

/** The tab a ledger state is listed under (`other` only shows under All). */
export function tabForState(state: LedgerState): CorpAssetTab {
  return state === 'other' ? 'all' : state;
}
