import { isRecord } from '../guards';
import { HOUR_MS } from '@/lib/age';

export interface ProjectDetailInput {
  id: string;
  name: string;
  state: string;
  progress: { current: number; desired: number };
  reward?: { initial: number; remaining: number };
  details: { expires?: string };
  contribution?: {
    participation_limit: number;
    reward_per_contribution: number;
    submission_limit: number;
    submission_multiplier: number;
  };
  configuration: unknown;
}

export interface CorpManufactureProject {
  id: string;
  name: string;
  typeId: number;
  rewardEach: number;
  poolInitial: number;
  poolRemaining: number;
  cap: number;
  contributed: number;
  expires: string | null;
}

function manufactureTypeId(configuration: unknown): number | null {
  if (!isRecord(configuration)) return null;
  const manufacture = configuration['manufacture_item'];
  if (!isRecord(manufacture)) return null;
  const items = manufacture['items'];
  if (!Array.isArray(items) || items.length !== 1) return null;
  const item: unknown = items[0];
  if (!isRecord(item)) return null;
  const typeId = item['type_id'];
  return typeof typeId === 'number' ? typeId : null;
}

export function toManufactureProject(
  detail: ProjectDetailInput,
  contributed: number
): CorpManufactureProject | null {
  const typeId = manufactureTypeId(detail.configuration);
  if (typeId === null || !detail.contribution || !detail.reward) return null;
  return {
    id: detail.id,
    name: detail.name,
    typeId,
    rewardEach: detail.contribution.reward_per_contribution,
    poolInitial: detail.reward.initial,
    poolRemaining: detail.reward.remaining,
    cap: detail.contribution.participation_limit,
    contributed,
    expires: detail.details.expires ?? null,
  };
}

export function remainingUnits(p: {
  rewardEach: number;
  cap: number;
  contributed: number;
  poolRemaining: number;
}): number {
  if (p.rewardEach <= 0) return 0;
  const poolUnits = Math.floor(p.poolRemaining / p.rewardEach);
  return Math.max(0, Math.min(p.cap - p.contributed, poolUnits));
}

export function hoursLeft(expires: string | null, now: Date): number | null {
  if (expires === null) return null;
  const ms = new Date(expires).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / HOUR_MS));
}

export function profitAtCap(p: {
  rewardEach: number;
  unitCost: number;
  units: number;
  copyPrice: number;
}): number {
  return (p.rewardEach - p.unitCost) * p.units - p.copyPrice;
}

export type BlueprintSource =
  | { kind: 'owned'; detail: { original: boolean; me: number; te: number } }
  | { kind: 'community'; memberName: string }
  | { kind: 'copy'; price: number }
  | { kind: 'assumed' };

export interface AcquisitionRowInput {
  unitPrice: number | null;
  quantity?: number;
  acquisitionTier: { community?: { memberName: string; stale?: boolean } };
}

export function blueprintSourceOf(p: {
  owned: { runs: number; me: number; te: number } | null;
  row: AcquisitionRowInput | undefined;
}): BlueprintSource {
  if (p.owned) {
    return {
      kind: 'owned',
      detail: { original: p.owned.runs === -1, me: p.owned.me, te: p.owned.te },
    };
  }
  const row = p.row;
  if (row?.acquisitionTier.community) {
    return { kind: 'community', memberName: row.acquisitionTier.community.memberName };
  }
  if (row && row.unitPrice !== null) {
    return { kind: 'copy', price: row.unitPrice * (row.quantity ?? 1) };
  }
  return { kind: 'assumed' };
}
