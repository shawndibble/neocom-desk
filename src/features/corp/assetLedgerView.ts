/**
 * Presentation helpers for the Corp assets ledger (issue #4671): turns the
 * pure ledger (`engine/corp/assetLedger.ts`) into what the page prints, using
 * the page's resolved names. Pure, so the wording rules are testable without
 * the page.
 */
import type {
  ClassifiedAsset,
  LedgerCell,
  LedgerPlacement,
  LedgerStack,
  LedgerState,
  LocationLedger,
} from '@/engine/corp/assetLedger';
import type { HangarDivisionNumber } from '@/engine/corp/assetDivisions';
import { tabForState, type CorpAssetTab } from './corpAssetsTabs';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const STATE_KEY: Readonly<Record<LedgerState, string>> = {
  offices: 'corp.assets.state.offices',
  deliveries: 'corp.assets.state.deliveries',
  inSpace: 'corp.assets.state.inSpace',
  impounded: 'corp.assets.state.impounded',
  assetSafety: 'corp.assets.state.assetSafety',
  lockdown: 'corp.assets.state.lockdown',
  capsuleerDeliveries: 'corp.assets.state.capsuleerDeliveries',
  other: 'corp.assets.state.other',
};

export interface LedgerLabels {
  typeName(typeId: number): string;
  /** The full name of an office, structure or system, else "Location #id". */
  placeName(locationId: number | null): string;
  /** The name's first segment ("Efa" of "Efa - Hangar Keep"), for a chip; null when unresolved. */
  shortPlaceName(locationId: number | null): string | null;
  /** The corp's own name for a hangar division, else "Division n". */
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
    typeName: (typeId) => typeNames.get(typeId) ?? `Type #${typeId}`,
    placeName: (locationId) =>
      locationId === null
        ? t('corp.assets.unknownPlace')
        : (locationNames.get(locationId) ?? t('corp.assets.unknownLocation', { locationId })),
    shortPlaceName: (locationId) => {
      const name = locationId === null ? undefined : locationNames.get(locationId);
      return name === undefined ? null : (name.split(' - ')[0] ?? name);
    },
    divisionName: (division) =>
      divisionNames.get(division) ?? t('corp.vitals.division', { division }),
    stateLabel: (state) => t(STATE_KEY[state]),
  };
}

/** A placement's chip text, "Efa · Ships", without its ×quantity. */
export function placementLabel(
  placement: Pick<LedgerPlacement, 'state' | 'locationId' | 'division'>,
  labels: LedgerLabels
): string {
  const place = labels.shortPlaceName(placement.locationId);
  const what =
    placement.state === 'offices' && placement.division !== null
      ? labels.divisionName(placement.division)
      : labels.stateLabel(placement.state);
  return place === null ? what : `${place} · ${what}`;
}

export type PlacementTone = 'neutral' | 'warning' | 'danger';

/** Amber for waiting deliveries, red for what needs recovering. */
export function placementTone(state: LedgerState): PlacementTone {
  if (state === 'deliveries') return 'warning';
  if (state === 'impounded' || state === 'assetSafety') return 'danger';
  return 'neutral';
}

/** A stack's full path for the expanded row: "Efa VII - Hangar › Ships › Container". */
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
  /** Lower-cased search text; empty matches everything. */
  query: string;
  categoryId: number | null;
  categoryOf: (typeId: number) => number | null;
  /** When set, only these types (the Below target filter). */
  onlyTypeIds: ReadonlySet<number> | null;
  typeName: (typeId: number) => string;
}

/**
 * The search, Category and Below target filters, applied to the classified
 * stacks so both views (by item, by location) narrow the same way. Location
 * and division filters are the ledger's own (`LedgerFilter`).
 */
export function filterClassified(
  items: readonly ClassifiedAsset[],
  filter: ClassifiedFilter
): ClassifiedAsset[] {
  const { query, categoryId, categoryOf, onlyTypeIds, typeName } = filter;
  if (query === '' && categoryId === null && onlyTypeIds === null) return [...items];
  return items.filter((item) => {
    const typeId = item.input.typeId;
    if (onlyTypeIds !== null && !onlyTypeIds.has(typeId)) return false;
    if (categoryId !== null && categoryOf(typeId) !== categoryId) return false;
    return query === '' || typeName(typeId).toLowerCase().includes(query);
  });
}

export interface LocationRow {
  key: string;
  groupKey: string;
  groupLabel: string;
  /** Totals over the group's rows, for its header. */
  groupItems: number;
  groupValue: number;
  /** An office with nothing in any division. */
  groupEmpty: boolean;
  label: string;
  kind: 'division' | 'deliveries' | 'place';
  state: LedgerState;
  locationId: number | null;
  division: HangarDivisionNumber | null;
  cell: LedgerCell;
}

/**
 * Flattens the by-location ledger into table rows for one tab: an office's
 * seven divisions (and its Corp deliveries) become the rows of the office's
 * group, and on All each non-office place is a group of its own. `loc` and
 * `div` narrow the rows exactly as they narrow the by-item view.
 */
export function buildLocationRows(
  ledger: LocationLedger,
  options: {
    tab: CorpAssetTab;
    locationId: number | null;
    division: HangarDivisionNumber | null;
    labels: LedgerLabels;
  }
): LocationRow[] {
  const { tab, locationId, division, labels } = options;
  const groups: LocationRow[][] = [];

  for (const office of ledger.offices) {
    if (locationId !== null && office.locationId !== locationId) continue;
    const groupKey = `office:${office.locationId}`;
    const groupLabel = labels.placeName(office.locationId);
    const rows: LocationRow[] = [];
    if (tab === 'all' || tab === 'offices') {
      for (const cell of office.divisions) {
        if (division !== null && cell.division !== division) continue;
        rows.push({
          key: `${groupKey}:d${cell.division}`,
          groupKey,
          groupLabel,
          groupItems: 0,
          groupValue: 0,
          groupEmpty: office.isEmpty,
          label: labels.divisionName(cell.division),
          kind: 'division',
          state: 'offices',
          locationId: office.locationId,
          division: cell.division,
          cell,
        });
      }
    }
    if ((tab === 'all' || tab === 'deliveries') && division === null) {
      rows.push({
        key: `${groupKey}:deliveries`,
        groupKey,
        groupLabel,
        groupItems: 0,
        groupValue: 0,
        groupEmpty: office.isEmpty,
        label: labels.stateLabel('deliveries'),
        kind: 'deliveries',
        state: 'deliveries',
        locationId: office.locationId,
        division: null,
        cell: office.deliveries,
      });
    }
    // An office with no row for this tab says nothing; a tab with no items still lists the office's empty rows only under Offices.
    if (rows.length > 0 && (tab !== 'deliveries' || office.deliveries.itemCount > 0)) {
      groups.push(rows);
    }
  }

  if (division === null) {
    for (const place of ledger.others) {
      if (tab !== 'all' && tabForState(place.state) !== tab) continue;
      if (locationId !== null && place.locationId !== locationId) continue;
      const groupKey = `place:${place.state}:${place.locationId ?? ''}`;
      const where = labels.stateLabel(place.state);
      const placeName = place.locationId === null ? null : labels.shortPlaceName(place.locationId);
      const label = placeName === null ? where : `${placeName} · ${where}`;
      groups.push([
        {
          key: groupKey,
          groupKey,
          groupLabel: label,
          groupItems: 0,
          groupValue: 0,
          groupEmpty: false,
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
