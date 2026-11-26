import { loadEveFitXmlEntry, type FittingXmlDocument } from '@/engine/import/eveFitXml';
import { toLoadOutcome, type LoadedFitting, type LoadOutcome } from '@/engine/fittings/load';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadTypes } from '@/sde/loadSde';

export interface FittingXmlListItem {
  name: string;
  hullName: string | null;
  load: LoadOutcome;
}

export type FittingXmlOpenAction = { kind: 'open'; loaded: LoadedFitting } | { kind: 'list' };

export function resolveFittingXmlOpenAction(items: FittingXmlListItem[]): FittingXmlOpenAction {
  const only = items.length === 1 ? items[0]!.load : null;
  return only?.kind === 'fitting' ? { kind: 'open', loaded: only } : { kind: 'list' };
}

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
