/**
 * Build Opportunities' "All owned" view (issue #2335): every blueprint the
 * selected Character(s) — and optionally their corporation — own, as a
 * browsable library. Unlike `buildOpportunityCandidates`, nothing is dropped:
 * reactions, blueprints the SDE catalog doesn't know, and ones Opportunities
 * can't price all get a row. ISK/hour is looked up from the ranked rows where
 * Opportunities has one.
 */
import type { CharacterAsset, CharacterBlueprint } from '@/esi/endpoints';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';

export type BlueprintKind = 'bpo' | 'bpc';
export type OwnedBlueprintActivity = 'manufacturing' | 'reaction';

export type OwnedBlueprintOwner =
  { kind: 'character'; characterId: number; name: string } | { kind: 'corporation' };

export interface OwnedBlueprintRow {
  /** `${characterId}:${item_id}` — the same id an Opportunities candidate has — or `corp:${item_id}`. */
  id: string;
  owner: OwnedBlueprintOwner;
  blueprint: CharacterBlueprint;
  /** The blueprint's own type name (not its product's). */
  name: string;
  kind: BlueprintKind;
  /** Null when the SDE catalog doesn't know the blueprint. */
  activity: OwnedBlueprintActivity | null;
  catalogEntry: BlueprintCatalogEntry | null;
  /** Only when Opportunities could rank and price it. */
  iskPerHour: number | null;
}

/** One owner's identity across rows: the Character's id, or the corporation's. */
export function ownedBlueprintOwnerKey(row: OwnedBlueprintRow): string {
  return row.owner.kind === 'character' ? String(row.owner.characterId) : 'corp';
}

/** ESI: `runs` is -1 for an original — the same rule the ranked view and CSV use. */
export function blueprintKind(blueprint: CharacterBlueprint): BlueprintKind {
  return blueprint.runs === -1 ? 'bpo' : 'bpc';
}

/** ESI's -1/-2 mark a singleton; a positive `quantity` is a stack of originals. */
export function ownedBlueprintQuantity(blueprint: CharacterBlueprint): number {
  return blueprint.quantity > 0 ? blueprint.quantity : 1;
}

/**
 * Each sortable field's value, at module scope so `DataTable`'s sort memo sees
 * stable functions (see `OpportunitiesPanel`) — shared by the desktop table
 * and `MobileOwnedBlueprintList`'s sort menu.
 */
export const OWNED_BLUEPRINT_SORT_VALUE = {
  blueprint: (row: OwnedBlueprintRow) => row.name,
  kind: (row: OwnedBlueprintRow) => row.kind,
  me: (row: OwnedBlueprintRow) => row.blueprint.material_efficiency,
  te: (row: OwnedBlueprintRow) => row.blueprint.time_efficiency,
  // A BPO's -1 is unlimited: the largest, not the smallest.
  runs: (row: OwnedBlueprintRow) =>
    row.kind === 'bpo' ? Number.MAX_SAFE_INTEGER : row.blueprint.runs,
  quantity: (row: OwnedBlueprintRow) => ownedBlueprintQuantity(row.blueprint),
  owner: (row: OwnedBlueprintRow) => (row.owner.kind === 'character' ? row.owner.name : ''),
  iskPerHour: (row: OwnedBlueprintRow) => row.iskPerHour ?? undefined,
};

export interface BuildOwnedBlueprintRowsInput {
  ownedByCharacter: ReadonlyMap<number, readonly CharacterBlueprint[]>;
  characterNames: ReadonlyMap<number, string>;
  /** Empty unless the corp toggle is on and the Character can read corp blueprints. */
  corpBlueprints: readonly CharacterBlueprint[];
  catalog: BlueprintCatalog;
  /** Keyed by row id — Opportunities' `candidate.id`. */
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

/**
 * Flags ESI gives an item sitting directly in a station or structure, where
 * `location_id` is that place. Any other flag (a container, a ship bay, a
 * corp office's `CorpSAG*` division) means `location_id` is another item's id.
 */
const PLACE_FLAGS = new Set(['Hangar', 'Deliveries', 'AssetSafety', 'CorpDeliveries']);

export type BlueprintPlacement = { kind: 'place'; locationId: number } | { kind: 'container' };

/**
 * Where a blueprint physically sits. A blueprint in a container carries the
 * container's item id as its `location_id`, so walk the owner's cached assets
 * up to the first non-item location (the station/structure). When the chain
 * can't be followed — the container isn't in the cached assets, or the chain
 * cycles — it is simply "in a container".
 */
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
