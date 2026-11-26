import type { CharacterAsset, CharacterBlueprint } from '@/esi/endpoints';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';

export type BlueprintKind = 'bpo' | 'bpc';
export type OwnedBlueprintActivity = 'manufacturing' | 'reaction';

export type OwnedBlueprintOwner =
  { kind: 'character'; characterId: number; name: string } | { kind: 'corporation' };

export interface OwnedBlueprintRow {
  id: string;
  owner: OwnedBlueprintOwner;
  blueprint: CharacterBlueprint;
  name: string;
  kind: BlueprintKind;
  activity: OwnedBlueprintActivity | null;
  catalogEntry: BlueprintCatalogEntry | null;
  iskPerHour: number | null;
}

export function ownedBlueprintOwnerKey(row: OwnedBlueprintRow): string {
  return row.owner.kind === 'character' ? String(row.owner.characterId) : 'corp';
}

export function blueprintKind(blueprint: CharacterBlueprint): BlueprintKind {
  return blueprint.runs === -1 ? 'bpo' : 'bpc';
}

export function ownedBlueprintQuantity(blueprint: CharacterBlueprint): number {
  return blueprint.quantity > 0 ? blueprint.quantity : 1;
}

export const OWNED_BLUEPRINT_SORT_VALUE = {
  blueprint: (row: OwnedBlueprintRow) => row.name,
  kind: (row: OwnedBlueprintRow) => row.kind,
  me: (row: OwnedBlueprintRow) => row.blueprint.material_efficiency,
  te: (row: OwnedBlueprintRow) => row.blueprint.time_efficiency,
  runs: (row: OwnedBlueprintRow) =>
    row.kind === 'bpo' ? Number.MAX_SAFE_INTEGER : row.blueprint.runs,
  quantity: (row: OwnedBlueprintRow) => ownedBlueprintQuantity(row.blueprint),
  owner: (row: OwnedBlueprintRow) => (row.owner.kind === 'character' ? row.owner.name : ''),
  iskPerHour: (row: OwnedBlueprintRow) => row.iskPerHour ?? undefined,
};

export interface BuildOwnedBlueprintRowsInput {
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  characterNames: ReadonlyMap<number, string>;
  corpBlueprints: readonly CharacterBlueprint[];
  catalog: BlueprintCatalog;
  iskPerHourById: ReadonlyMap<string, number | null>;
}

export function buildOwnedBlueprintRows({
  ownedByCharacter,
  characterNames,
  corpBlueprints,
  catalog,
  iskPerHourById,
}: BuildOwnedBlueprintRowsInput): OwnedBlueprintRow[] {
  const toRow = (
    id: string,
    owner: OwnedBlueprintOwner,
    blueprint: CharacterBlueprint
  ): OwnedBlueprintRow => {
    const catalogEntry = catalog.byBlueprintTypeID.get(blueprint.type_id) ?? null;
    return {
      id,
      owner,
      blueprint,
      name: nameForType(catalog, blueprint.type_id),
      kind: blueprintKind(blueprint),
      activity: catalogEntry?.blueprint.activity ?? null,
      catalogEntry,
      iskPerHour: iskPerHourById.get(id) ?? null,
    };
  };
  const rows: OwnedBlueprintRow[] = [];
  for (const [characterId, blueprints] of ownedByCharacter) {
    const owner: OwnedBlueprintOwner = {
      kind: 'character',
      characterId,
      name: characterNames.get(characterId) ?? '',
    };
    for (const blueprint of blueprints) {
      rows.push(toRow(`${characterId}:${blueprint.item_id}`, owner, blueprint));
    }
  }
  const corp: OwnedBlueprintOwner = { kind: 'corporation' };
  for (const blueprint of corpBlueprints) {
    rows.push(toRow(`corp:${blueprint.item_id}`, corp, blueprint));
  }
  return rows;
}

export interface OwnedBlueprintFilter {
  kind: 'all' | BlueprintKind;
  activity: 'all' | OwnedBlueprintActivity;
  search: string;
}

export function filterOwnedBlueprints(
  rows: readonly OwnedBlueprintRow[],
  filter: OwnedBlueprintFilter
): OwnedBlueprintRow[] {
  const query = filter.search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.kind === 'all' || row.kind === filter.kind) &&
      (filter.activity === 'all' || row.activity === filter.activity) &&
      (query === '' ||
        row.name.toLowerCase().includes(query) ||
        (row.catalogEntry?.productNameLower.includes(query) ?? false))
  );
}

const PLACE_FLAGS = new Set(['Hangar', 'Deliveries', 'AssetSafety', 'CorpDeliveries']);

export type BlueprintPlacement = { kind: 'place'; locationId: number } | { kind: 'container' };

export function resolveBlueprintPlacement(
  blueprint: Pick<CharacterBlueprint, 'location_id' | 'location_flag'>,
  assetsByItemId: ReadonlyMap<number, Pick<CharacterAsset, 'location_id' | 'location_type'>>
): BlueprintPlacement {
  let current = assetsByItemId.get(blueprint.location_id);
  if (!current) {
    return PLACE_FLAGS.has(blueprint.location_flag)
      ? { kind: 'place', locationId: blueprint.location_id }
      : { kind: 'container' };
  }
  const seen = new Set<number>([blueprint.location_id]);
  while (current.location_type === 'item') {
    if (seen.has(current.location_id)) return { kind: 'container' };
    seen.add(current.location_id);
    const parent = assetsByItemId.get(current.location_id);
    if (!parent) return { kind: 'container' };
    current = parent;
  }
  return { kind: 'place', locationId: current.location_id };
}
