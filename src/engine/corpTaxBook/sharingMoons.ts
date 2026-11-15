/**
 * The Sharing tab's rows (issue #6222): every moon the book handles, its own refineries and
 * its moon owners' alike, each with its effective Pop Sharing settings. The resolver is the
 * server's own (`functions/src/popSharing.ts`), so the tab and the published pops never differ.
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
