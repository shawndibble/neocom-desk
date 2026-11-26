import { ME_MAX, TE_MAX } from '@/engine/industry/efficiency';
import type { MaterialSourcing, MaterialSourcingMap } from '@/engine/industry/types';

export interface BuildPlanSeed {
  me: number;
  te: number;
  runs: number;
}

const BLUEPRINT_PRICE_KEY = 'bpPrice';

const SEED_KEYS = ['me', 'te', 'runs', BLUEPRINT_PRICE_KEY] as const;

type ParamReader = Pick<URLSearchParams, 'get'>;

function parseSeedNumber(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

export function parsePlanSeed(params: ParamReader): BuildPlanSeed | null {
  const me = parseSeedNumber(params.get('me'), 0, ME_MAX);
  const te = parseSeedNumber(params.get('te'), 0, TE_MAX);
  const runs = parseSeedNumber(params.get('runs'), 1, Number.MAX_SAFE_INTEGER);
  if (me === null || te === null || runs === null) return null;
  return { me, te, runs };
}

export function applyPlanSeed(params: URLSearchParams, seed: BuildPlanSeed | null): void {
  if (!seed) return;
  params.set('me', String(seed.me));
  params.set('te', String(seed.te));
  params.set('runs', String(seed.runs));
}

export function clearPlanSeed(params: URLSearchParams): void {
  for (const key of SEED_KEYS) params.delete(key);
}

export function seedFromContractItem(item: {
  is_blueprint_copy?: boolean;
  material_efficiency?: number;
  time_efficiency?: number;
  runs?: number;
}): BuildPlanSeed | null {
  if (!item.is_blueprint_copy) return null;
  const { material_efficiency: me, time_efficiency: te, runs } = item;
  if (me === undefined || te === undefined || runs === undefined) return null;
  return { me, te, runs };
}

export function seedFromOfferRow(row: {
  isBlueprintCopy?: boolean;
  me?: number;
  te?: number;
  runs?: number;
}): BuildPlanSeed | null {
  if (!row.isBlueprintCopy) return null;
  const { me, te, runs } = row;
  if (me === undefined || te === undefined || runs === undefined) return null;
  return { me, te, runs };
}

export function matchesPlanSeed(plan: BuildPlanSeed, seed: BuildPlanSeed): boolean {
  return plan.me === seed.me && plan.te === seed.te && plan.runs === seed.runs;
}

export function parseBlueprintPriceSeed(params: ParamReader): number | null {
  const raw = params.get(BLUEPRINT_PRICE_KEY);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function applyBlueprintPriceSeed(params: URLSearchParams, price: number | null): void {
  if (price === null) return;
  params.set(BLUEPRINT_PRICE_KEY, String(price));
}

export function blueprintPriceSourcing(price: number): MaterialSourcing {
  return { acquisitionTierOverride: { me: 0, te: 0 }, overridePrice: price };
}

export function hasBlueprintPricePick(plan: {
  blueprintTypeID: number;
  materialSourcing?: MaterialSourcingMap;
}): boolean {
  const sourcing = plan.materialSourcing?.[plan.blueprintTypeID];
  const tier = sourcing?.acquisitionTierOverride;
  return tier?.me === 0 && tier.te === 0 && sourcing?.overridePrice !== undefined;
}
