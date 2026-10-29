/**
 * Corporation Projects as a buyer in Build Opportunities (issue #4786): the
 * pure maths between ESI's project reads and a row. A manufacture project pays
 * a fixed reward per unit, up to a per-Character cap and while its pool lasts.
 * Nothing here fetches; the loader and the pricing hook feed it.
 */

import { isRecord } from '../guards';

/** The parts of a project detail read this module looks at (`getCorporationProject`). */
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
  /** One key per project type. Read defensively: ESI adds kinds without notice. */
  configuration: unknown;
}

/** An open manufacture project of one item, as the Character sees it. */
export interface CorpManufactureProject {
  id: string;
  name: string;
  typeId: number;
  /** ISK paid per contributed unit. */
  rewardEach: number;
  poolInitial: number;
  poolRemaining: number;
  /** The most units one Character may contribute. */
  cap: number;
  /** Units this Character has already contributed. */
  contributed: number;
  /** ISO end date; null for a project with none. */
  expires: string | null;
}

/**
 * The one item a manufacture project asks for. A project naming a market group,
 * several types or no item has nothing single to price, so it reads as none.
 */
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

/**
 * A project detail as a manufacture row, or null for every project this view
 * does not show: another kind, an item that cannot be priced, or one with no
 * contribution terms or reward pool to work from. Never throws.
 */
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

/**
 * Units the Character can still be paid for: the cap minus what they have
 * contributed, held to what the pool can still pay out. Never negative.
 */
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

/** Whole hours until `expires`; 0 once it has passed, null for a project with no end. */
export function hoursLeft(expires: string | null, now: Date): number | null {
  if (expires === null) return null;
  const ms = new Date(expires).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 3_600_000));
}

/** Profit at the remaining cap: the reward on every unit, less its build cost and the blueprint copy. */
export function profitAtCap(p: {
  rewardEach: number;
  /** Materials and job fee for one unit. */
  unitCost: number;
  units: number;
  /** ISK for the blueprint copy this has to buy; 0 when owned, shared or unavailable. */
  copyPrice: number;
}): number {
  return (p.rewardEach - p.unitCost) * p.units - p.copyPrice;
}

/** Where the blueprint for a project's item comes from, in the words a row shows. */
export type BlueprintSource =
  | { kind: 'owned'; detail: { original: boolean; me: number; te: number } }
  | { kind: 'community'; memberName: string }
  | { kind: 'copy'; price: number }
  | { kind: 'assumed' };

/**
 * The Blueprint Acquisition row a plan priced (`MaterialCostLine` with an
 * `acquisitionTier`), narrowed to what classification reads.
 */
export interface AcquisitionRowInput {
  unitPrice: number | null;
  quantity?: number;
  acquisitionTier: { community?: { memberName: string; stale?: boolean } };
}

/**
 * Classifies the blueprint: the Character's own beats everything; otherwise
 * the priced acquisition row says whether a Community offer (free) or a bought
 * copy covers it. With no offer for sale the copy is assumed and priced at 0.
 */
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
