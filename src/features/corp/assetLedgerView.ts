import type {
  ClassifiedAsset,
  LedgerCell,
  LedgerPlacement,
  LedgerStack,
  LedgerState,
  LocationLedger,
} from '@/engine/corp/assetLedger';
import type { HangarDivisionNumber } from '@/engine/corp/assetDivisions';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import { tabForState, type CorpAssetTab } from './corpAssetsTabs';
import type { Translate } from '@/lib/translate';

const STATE_KEY: Readonly<Record<LedgerState, string>> = {
  offices: 'corp.assets.state.offices',
  deliveries: 'corp.assets.state.deliveries',
  inSpace: 'corp.assets.state.inSpace',
  fuelBay: 'corp.assets.state.fuelBay',
  impounded: 'corp.assets.state.impounded',
  assetSafety: 'corp.assets.state.assetSafety',
  lockdown: 'corp.assets.state.lockdown',
  capsuleerDeliveries: 'corp.assets.state.capsuleerDeliveries',
  other: 'corp.assets.state.other',
};

export interface LedgerLabels {
  typeName(typeId: number): string;
  placeName(locationId: number | null): string;
  shortPlaceName(locationId: number | null): string | null;
  divisionName(division: number): string;
  stateLabel(state: LedgerState): string;
}

export function makeLedgerLabels(input: {
  t: Translate;
  typeNames: ReadonlyMap<number, string>;
  locationNames: ReadonlyMap<number, string>;
  divisionNames: ReadonlyMap<number, string | null>;
}): LedgerLabels {
  const { t, typeNames, locationNames, divisionNames } = input;
  return {
    typeName: (typeId) => typeNames.get(typeId) ?? t('assets.myShips.unknownType', { id: typeId }),
    placeName: (locationId) =>
      locationId === null
        ? t('corp.assets.unknownPlace')
        : (locationNames.get(locationId) ?? t('corp.assets.unknownLocation', { locationId })),
    shortPlaceName: (locationId) => {
      const name = locationId === null ? undefined : locationNames.get(locationId);
      if (name === undefined) return null;
      if (locationId !== null && locationId >= UPWELL_STRUCTURE_ID_FLOOR) return name;
      return name.split(' - ')[0] ?? name;
    },
    divisionName: (division) =>
      divisionNames.get(division) ?? t('corp.vitals.division', { division }),
    stateLabel: (state) => t(STATE_KEY[state]),
  };
}

export function placementLabel(
  placement: Pick<LedgerPlacement, 'state' | 'locationId' | 'division'>,
  labels: LedgerLabels,
  full = false
): string {
  const place = full
    ? labels.shortPlaceName(placement.locationId) === null
      ? null
      : labels.placeName(placement.locationId)
    : labels.shortPlaceName(placement.locationId);
  const what =
    placement.state === 'offices' && placement.division !== null
      ? labels.divisionName(placement.division)
      : labels.stateLabel(placement.state);
  return place === null ? what : `${place} · ${what}`;
}

export function placementLabels(
  placements: readonly Pick<LedgerPlacement, 'state' | 'locationId' | 'division'>[],
  labels: LedgerLabels
): string[] {
  const idsByShort = new Map<string, Set<number | null>>();
  for (const p of placements) {
    const short = labels.shortPlaceName(p.locationId);
    if (short === null) continue;
    const ids = idsByShort.get(short) ?? new Set();
    ids.add(p.locationId);
    idsByShort.set(short, ids);
  }
  return placements.map((p) => {
    const short = labels.shortPlaceName(p.locationId);
    return placementLabel(p, labels, short !== null && (idsByShort.get(short)?.size ?? 0) > 1);
  });
}

export type PlacementTone = 'neutral' | 'warning' | 'danger';

export function placementTone(state: LedgerState): PlacementTone {
  if (state === 'deliveries') return 'warning';
  if (state === 'impounded' || state === 'assetSafety') return 'danger';
  return 'neutral';
}

export function stackPathText(stack: LedgerStack, labels: LedgerLabels): string {
  const where =
    stack.state === 'offices' && stack.division !== null
      ? labels.divisionName(stack.division)
      : labels.stateLabel(stack.state);
  return [
    ...(stack.locationId === null ? [] : [labels.placeName(stack.locationId)]),
    where,
    ...stack.path.map((entry) => labels.typeName(entry.typeId)),
  ].join(' › ');
}

export interface ClassifiedFilter {
  query: string;
  kind: ((asset: { typeId: number; isBlueprintCopy?: boolean }) => boolean) | null;
  onlyTypeIds: ReadonlySet<number> | null;
  typeName: (typeId: number) => string;
}

export function filterClassified(
  items: readonly ClassifiedAsset[],
  filter: ClassifiedFilter
): ClassifiedAsset[] {
  const { query, kind, onlyTypeIds, typeName } = filter;
  if (query === '' && kind === null && onlyTypeIds === null) return [...items];
  return items.filter((item) => {
    const typeId = item.input.typeId;
    if (onlyTypeIds !== null && !onlyTypeIds.has(typeId)) return false;
    if (kind !== null && !kind(item.input)) return false;
    return query === '' || typeName(typeId).toLowerCase().includes(query);
  });
}

export interface LocationRow {
  key: string;
  groupKey: string;
  groupLabel: string;
  groupItems: number;
  groupValue: number;
  groupEmpty: boolean;
  groupDivisionsInUse: number | null;
  label: string;
  kind: 'division' | 'deliveries' | 'place' | 'empty';
  state: LedgerState;
  locationId: number | null;
  division: HangarDivisionNumber | null;
  cell: LedgerCell;
}

export interface OfficeUsage {
  isEmpty: boolean;
  divisionsInUse: number;
}

export function officeUsage(whole: LocationLedger): Map<number, OfficeUsage> {
  return new Map(
    whole.offices.map((office) => [
      office.locationId,
      {
        isEmpty: office.isEmpty,
        divisionsInUse: office.divisions.filter((d) => d.itemCount > 0).length,
      },
    ])
  );
}

export function buildLocationRows(
  ledger: LocationLedger,
  options: {
    tab: CorpAssetTab;
    locationId: number | null;
    division: HangarDivisionNumber | null;
    labels: LedgerLabels;
    usage: ReadonlyMap<number, OfficeUsage>;
    filtered?: boolean;
  }
): LocationRow[] {
  const { tab, locationId, division, labels, usage, filtered = false } = options;
  const groups: LocationRow[][] = [];

  for (const office of ledger.offices) {
    if (locationId !== null && office.locationId !== locationId) continue;
    const groupKey = `office:${office.locationId}`;
    const groupLabel = labels.placeName(office.locationId);
    const info = usage.get(office.locationId) ?? {
      isEmpty: office.isEmpty,
      divisionsInUse: office.divisions.filter((d) => d.itemCount > 0).length,
    };
    const base = {
      groupKey,
      groupLabel,
      groupItems: 0,
      groupValue: 0,
      groupEmpty: info.isEmpty,
      groupDivisionsInUse: info.divisionsInUse,
      locationId: office.locationId,
    };
    const rows: LocationRow[] = [];
    if (tab === 'all' || tab === 'offices') {
      for (const cell of office.divisions) {
        if (cell.itemCount === 0) continue;
        if (division !== null && cell.division !== division) continue;
        rows.push({
          ...base,
          key: `${groupKey}:d${cell.division}`,
          label: labels.divisionName(cell.division),
          kind: 'division',
          state: 'offices',
          division: cell.division,
          cell,
        });
      }
    }
    if ((tab === 'all' || tab === 'deliveries') && division === null) {
      if (office.deliveries.itemCount > 0) {
        rows.push({
          ...base,
          key: `${groupKey}:deliveries`,
          label: labels.stateLabel('deliveries'),
          kind: 'deliveries',
          state: 'deliveries',
          division: null,
          cell: office.deliveries,
        });
      }
    }
    if (
      rows.length === 0 &&
      info.isEmpty &&
      !filtered &&
      (tab === 'all' || tab === 'offices') &&
      division === null
    ) {
      rows.push({
        ...base,
        key: `${groupKey}:empty`,
        label: labels.placeName(office.locationId),
        kind: 'empty',
        state: 'offices',
        division: null,
        cell: office.deliveries,
      });
    }
    if (rows.length > 0) groups.push(rows);
  }

  if (division === null) {
    for (const place of ledger.others) {
      if (tab !== 'all' && tabForState(place.state) !== tab) continue;
      if (locationId !== null && place.locationId !== locationId) continue;
      const groupKey = `place:${place.state}:${place.locationId ?? ''}`;
      const where = labels.stateLabel(place.state);
      const placeName = place.locationId === null ? null : labels.shortPlaceName(place.locationId);
      groups.push([
        {
          key: groupKey,
          groupKey,
          groupLabel: placeName === null ? where : `${placeName} · ${where}`,
          groupItems: 0,
          groupValue: 0,
          groupEmpty: false,
          groupDivisionsInUse: null,
          label: where,
          kind: 'place',
          state: place.state,
          locationId: place.locationId,
          division: null,
          cell: place,
        },
      ]);
    }
  }

  return groups.flatMap((rows) => {
    const groupItems = rows.reduce((sum, row) => sum + row.cell.itemCount, 0);
    const groupValue = rows.reduce((sum, row) => sum + row.cell.estimatedValue, 0);
    return rows.map((row) => ({ ...row, groupItems, groupValue }));
  });
}
