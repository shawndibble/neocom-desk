import { loadEveFitXmlEntry, type FittingXmlDocument } from '@/engine/import/eveFitXml';
import { toLoadOutcome, type LoadedFitting, type LoadOutcome } from '@/engine/fittings/load';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypes } from '@/sde/loadSde';

/** One `<fitting>` entry from a Loaded EVE fittings-XML file, resolved but not yet opened. */
export interface FittingXmlListItem {
  name: string;
  hullName: string | null;
  /** What opening it would Load; a `failed` one (its hull didn't resolve) can't be opened. */
  load: LoadOutcome;
}

export type FittingXmlOpenAction = { kind: 'open'; loaded: LoadedFitting } | { kind: 'list' };

/** A single-fit export opens directly; anything else — a multi-fit file, or a single entry whose hull didn't resolve — needs the picker list instead. */
export function resolveFittingXmlOpenAction(items: FittingXmlListItem[]): FittingXmlOpenAction {
  const only = items.length === 1 ? items[0]!.load : null;
  return only?.kind === 'fitting' ? { kind: 'open', loaded: only } : { kind: 'list' };
}

/**
 * Resolves a Loaded fittings-XML document's `<fitting>` entries against the
 * type catalog — display data for the picker list, nothing opened yet. A
 * hull that doesn't resolve becomes a `failed` row rather than
 * dropping the entry, so a malformed fit in a multi-fit file surfaces its
 * own reason without taking the rest of the file down with it.
 */
export async function resolveFittingXmlDocument(
  document: FittingXmlDocument
): Promise<FittingXmlListItem[]> {
  const [typeByName, types] = await Promise.all([loadItemNameMap(), loadTypes()]);
  return document.entries.map((entry) => {
    const result = loadEveFitXmlEntry(entry, typeByName);
    const hullTypeId = result.hullTypeId;
    const resolvedHullName =
      hullTypeId === null ? null : (types[String(hullTypeId)]?.name ?? `Type ${hullTypeId}`);
    const name = entry.name.trim() !== '' ? entry.name : (resolvedHullName ?? entry.shipTypeName);
    return { name, hullName: resolvedHullName, load: toLoadOutcome(result, name, 'file') };
  });
}
