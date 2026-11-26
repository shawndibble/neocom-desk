import {
  effectivePopSharing,
  type EffectivePopSharing,
  type PopSharingDoc,
} from '../../../functions/src/popSharing';
import type { MoonOwnerFeeder } from './moonOwners';

export interface SharingMoonRow {
  moonId: number;
  structureId: number;
  ownerCorporationId?: number;
  ownerOptedOut: boolean;
  effective: EffectivePopSharing;
}

interface MoonPull {
  moonId: number;
  structureId: number;
  startedAt: string;
  sourceCorporationId?: number;
}

const HANDLED: ReadonlySet<MoonOwnerFeeder['status']> = new Set(['active', 'pending-removal']);
export const isHandled = (f: { status?: MoonOwnerFeeder['status'] }): boolean =>
  f.status === undefined || HANDLED.has(f.status);

export function sharingMoons(
  extractions: readonly MoonPull[],
  feeders: readonly {
    corporationId: number;
    status?: MoonOwnerFeeder['status'];
    popSharingOptOut?: unknown;
  }[],
  doc: PopSharingDoc
): SharingMoonRow[] {
  const latest = new Map<number, MoonPull>();
  for (const x of extractions) {
    const seen = latest.get(x.moonId);
    if (!seen || x.startedAt > seen.startedAt) latest.set(x.moonId, x);
  }
  const optedOut = new Set(
    feeders.filter((f) => f.popSharingOptOut !== undefined).map((f) => f.corporationId)
  );
  const gone = new Set(feeders.filter((f) => !isHandled(f)).map((f) => f.corporationId));
  return [...latest.values()]
    .filter((x) => x.sourceCorporationId === undefined || !gone.has(x.sourceCorporationId))
    .sort((a, b) => a.moonId - b.moonId)
    .map((x) => {
      const ownerOptedOut =
        x.sourceCorporationId !== undefined && optedOut.has(x.sourceCorporationId);
      return {
        moonId: x.moonId,
        structureId: x.structureId,
        ...(x.sourceCorporationId === undefined
          ? {}
          : { ownerCorporationId: x.sourceCorporationId }),
        ownerOptedOut,
        effective: effectivePopSharing(doc, x.moonId, { ownerOptedOut }),
      };
    });
}

export interface UnplacedRefinery {
  structureId: number;
  ownerCorporationId?: number;
  ownerOptedOut: boolean;
}

interface KnownOwnerRefineries {
  corporationId: number;
  status?: MoonOwnerFeeder['status'];
  popSharingOptOut?: unknown;
  refineryLabels?: Readonly<Record<string, unknown>>;
  refinerySystems?: Readonly<Record<string, unknown>>;
  refineryStructures?: Readonly<Record<string, unknown>>;
}

export function unplacedRefineries(
  extractions: readonly Pick<MoonPull, 'structureId'>[],
  feeders: readonly KnownOwnerRefineries[],
  ownRefineryIds: readonly number[]
): UnplacedRefinery[] {
  const placed = new Set(extractions.map((x) => x.structureId));
  const found = new Map<number, UnplacedRefinery>();
  for (const id of ownRefineryIds)
    if (!placed.has(id)) found.set(id, { structureId: id, ownerOptedOut: false });
  for (const f of feeders) {
    if (!isHandled(f)) continue;
    const ids = [f.refineryLabels, f.refinerySystems, f.refineryStructures].flatMap((r) =>
      Object.keys(r ?? {}).map(Number)
    );
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id <= 0 || placed.has(id) || found.has(id)) continue;
      found.set(id, {
        structureId: id,
        ownerCorporationId: f.corporationId,
        ownerOptedOut: f.popSharingOptOut !== undefined,
      });
    }
  }
  return [...found.values()].sort(
    (a, b) =>
      (a.ownerCorporationId ?? 0) - (b.ownerCorporationId ?? 0) || a.structureId - b.structureId
  );
}
