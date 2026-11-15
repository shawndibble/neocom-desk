/**
 * The Sharing tab's rows (issue #6222): every moon the book handles, its own refineries and
 * its moon owners' alike, each with its effective Pop Sharing settings. The resolver is the
 * server's own (`functions/src/popSharing.ts`), so the tab and the published pops never differ.
 *
 * A moon is known from any Extraction the book holds, past or cancelled included, so a refinery
 * between cycles keeps its row. A refinery with no Extraction yet has no known moon: it is listed
 * apart (`unplacedRefineries`, #6240) until its first one syncs.
 */
import {
  effectivePopSharing,
  type EffectivePopSharing,
  type PopSharingDoc,
} from '../../../functions/src/popSharing';

export interface SharingMoonRow {
  moonId: number;
  /** The refinery of the moon's latest Extraction. */
  structureId: number;
  /** The moon owner whose moon it is; absent is the book's own corporation. */
  ownerCorporationId?: number;
  /** That moon owner turned Pop Sharing off: the settings stay, inert. */
  ownerOptedOut: boolean;
  effective: EffectivePopSharing;
}

interface MoonPull {
  moonId: number;
  structureId: number;
  startedAt: string;
  sourceCorporationId?: number;
}

/** One row per moon, in moon id order. */
export function sharingMoons(
  extractions: readonly MoonPull[],
  feeders: readonly { corporationId: number; popSharingOptOut?: unknown }[],
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
  return [...latest.values()]
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

/** A refinery the book knows with no Extraction yet: its moon is not known, so it has no row. */
export interface UnplacedRefinery {
  structureId: number;
  /** The moon owner whose refinery it is; absent is the book's own corporation. */
  ownerCorporationId?: number;
  ownerOptedOut: boolean;
}

interface KnownOwnerRefineries {
  corporationId: number;
  status?: string;
  popSharingOptOut?: unknown;
  refineryLabels?: Readonly<Record<string, unknown>>;
  refinerySystems?: Readonly<Record<string, unknown>>;
  refineryStructures?: Readonly<Record<string, unknown>>;
}

/** A moon owner the book still handles; one removed or gone has no refineries here. */
const HANDLED = new Set(['active', 'pending-removal']);

/**
 * The refineries the book knows that no Extraction places at a moon yet (#6240): its own (the
 * mining observers the Automatic sync read) and each handled moon owner's (its record's refinery
 * labels, systems and structure reads). Own first, then by refinery id.
 */
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
    if (f.status !== undefined && !HANDLED.has(f.status)) continue;
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
