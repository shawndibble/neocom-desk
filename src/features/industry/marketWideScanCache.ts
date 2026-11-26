import type { BlueprintSource } from '@/engine/industry/blueprintObtainability';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { ResolvedStandings } from '@/engine/market/standings';
import { HUB_PRICE_TTL_MS } from '@/market/prices';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';
import type { MarketWideResultRow } from './marketWideOpportunities';

export interface MarketWideScanInputs {
  hubId: string;
  tiers: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  sources: ReadonlySet<string>;
  characterIds: readonly number[];
  assumedMe: number;
  assumedTe: number;
  research: readonly { blueprintTypeID: number; me: number; te: number }[];
  modifiers: CharacterModifiers;
  standing: ResolvedStandings | undefined;
  facilityDefaults: unknown;
  lpValue: number;
  planSettings: unknown;
  pricePercent?: number;
}

export function marketWideScanKey(inputs: MarketWideScanInputs): string {
  return JSON.stringify([
    inputs.hubId,
    [...inputs.tiers].sort(),
    [...inputs.categories].sort(),
    [...inputs.sources].sort(),
    [...inputs.characterIds].sort((a, b) => a - b),
    inputs.assumedMe,
    inputs.assumedTe,
    inputs.research.map(({ blueprintTypeID, me, te }) => `${blueprintTypeID}:${me}:${te}`).sort(),
    inputs.modifiers,
    inputs.standing ?? null,
    inputs.facilityDefaults,
    inputs.lpValue,
    inputs.planSettings,
    inputs.pricePercent ?? DEFAULT_PRICE_PERCENT,
  ]);
}

export interface MarketWideScanEntry {
  rows: MarketWideResultRow[];
  fetchedAt: number;
  unavailableSources: BlueprintSource[];
}

const scans = new Map<string, MarketWideScanEntry>();

export function readMarketWideScan(
  key: string,
  now: number = Date.now()
): MarketWideScanEntry | undefined {
  const entry = scans.get(key);
  if (!entry) return undefined;
  if (now - entry.fetchedAt >= HUB_PRICE_TTL_MS) {
    scans.delete(key);
    return undefined;
  }
  return entry;
}

export function writeMarketWideScan(key: string, entry: MarketWideScanEntry): void {
  scans.set(key, entry);
}

export function clearMarketWideScanCache(): void {
  scans.clear();
}
