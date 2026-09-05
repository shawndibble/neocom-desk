/**
 * `/corp/assets` — every item the corporation owns, division-first (issue
 * #330).
 *
 * Round 41 (CONTEXT.md) ruled out reusing the personal Assets page for this:
 * `engine/assetTree.ts` has no level between a station and a container, a
 * division has no `item_id` for `assetPath.ts` to key a URL on, and Assets'
 * device-local owner switch cannot carry a corp deep link the way its URL
 * state expects. So this is its own surface, with its own axis — the seven
 * hangar divisions, not a station/container tree with divisions buried in
 * `location_flag`.
 *
 * **Director-only, and the whole page rather than a panel**, for the same
 * reason `/corp/members` is: `canReadAssets` (`engine/corpRoles.ts`) answers
 * to `Director` alone, so anyone else following an Assets tab would land on
 * an explanation instead of a division list. The `unknown`/`ready` split and
 * the mount-on-`ready` reasoning live in `useCorpRouteGate`, shared with
 * `/corp` and `/corp/members`.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  Disclosure,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpSubNav } from '@/features/corp/CorpSubNav';
import { loadCorporationId } from '@/features/corp/boardData';
import {
  EMPTY_CORP_ASSET_LABELS,
  loadCorporationAssets,
  loadCorpAssetLabels,
  toCorpAssetInputs,
  type CorpAssetLabels,
} from '@/features/corp/assets';
import { loadCorporationDivisions } from '@/features/corp/wallet';
import { hangarDivisions } from '@/features/corp/divisions';
import {
  groupCorpAssets,
  type CorpAssetGroup,
  type CorpAssetGroupId,
  type CorpAssetRow,
} from '@/engine/corp/assetDivisions';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

interface AssetsSnapshot {
  corporationId: number | null;
  /**
   * `null` means the assets read itself did not come back — offline,
   * uncached, or a 403 the role gate swallowed — and is distinct from a
   * corporation that was read successfully and genuinely owns nothing. The
   * view tells those two apart (a load failure vs. an honestly empty
   * corporation) rather than collapsing both into the same empty state.
   */
  groups: CorpAssetGroup[] | null;
  /** Division number -> the corp's own name for it, or null if unnamed/unresolved. */
  divisionNames: ReadonlyMap<number, string | null>;
  labels: CorpAssetLabels;
  /** The page cap was hit or a page was missing — corp holdings are the likelier of the two lists to hit it. */
  truncated: boolean;
  /** How many assets the truncated read actually returned — the count `corp.assets.fetchTruncatedNotice` reports. */
  assetsShown: number;
  /** Oldest `fetchedAt` across the reads — the badge speaks for the whole view. */
  fetchedAt: Date | null;
  /** Captured in the loader: `Date.now()` in render is impure. */
  loadedAt: number;
}

const EMPTY_SNAPSHOT: AssetsSnapshot = {
  corporationId: null,
  groups: null,
  divisionNames: new Map(),
  labels: EMPTY_CORP_ASSET_LABELS,
  truncated: false,
  assetsShown: 0,
  fetchedAt: null,
  loadedAt: 0,
};

async function loadAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<AssetsSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  const loadedAt = Date.now();
  if (corporationId === null || signal.cancelled) {
    return { ...EMPTY_SNAPSHOT, corporationId, loadedAt };
  }

  const [assetsResult, divisionsResult] = await Promise.all([
    loadCorporationAssets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId),
  ]);

  // A character switch mid-load: skip the label fan-out for a snapshot about
  // to be discarded rather than spending it on nothing.
  if (signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId, loadedAt };

  const assets = assetsResult.cached?.data ?? null;
  const groups = assets === null ? null : groupCorpAssets(toCorpAssetInputs(assets));
  const divisionNames = new Map(
    hangarDivisions(divisionsResult.cached?.data ?? null).map((d) => [d.division, d.name])
  );
  const labels =
    assets === null ? EMPTY_CORP_ASSET_LABELS : await loadCorpAssetLabels(characterId, assets);
  const truncated = assetsResult.cached?.truncated ?? false;
  const assetsShown = assets?.length ?? 0;

  const fetchedAts = [assetsResult, divisionsResult]
    .map((result) => result.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  const fetchedAt =
    fetchedAts.length === 0
      ? null
      : fetchedAts.reduce((oldest, date) => (date < oldest ? date : oldest));

  return {
    corporationId,
    groups,
    divisionNames,
    labels,
    truncated,
    assetsShown,
    fetchedAt,
    loadedAt,
  };
}

/** `location_flag`s a personal asset list never sees, each with a fixed label. */
const FLAG_LABEL_KEY: Readonly<Record<Exclude<CorpAssetGroupId, number>, string>> = {
  officeFolder: 'corp.assets.flag.officeFolder',
  corpDeliveries: 'corp.assets.flag.corpDeliveries',
  impounded: 'corp.assets.flag.impounded',
  assetSafety: 'corp.assets.flag.assetSafety',
  other: 'corp.assets.flag.other',
};

function groupLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  id: CorpAssetGroupId,
  divisionNames: ReadonlyMap<number, string | null>
): string {
  if (typeof id === 'number') {
    return divisionNames.get(id) ?? t('corp.vitals.division', { division: id });
  }
  return t(FLAG_LABEL_KEY[id]);
}

interface CorpAssetGroupSectionProps {
  group: CorpAssetGroup;
  label: string;
  labels: CorpAssetLabels;
  expanded: boolean;
  onToggle: () => void;
}

function CorpAssetGroupSection({
  group,
  label,
  labels,
  expanded,
  onToggle,
}: CorpAssetGroupSectionProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<CorpAssetRow>[]>(
    () => [
      {
        id: 'item',
        header: t('corp.assets.columnItem'),
        primary: true,
        render: (row) => labels.types.get(row.typeId) ?? `#${row.typeId}`,
        sortValue: (row) => labels.types.get(row.typeId) ?? `#${row.typeId}`,
      },
      {
        id: 'quantity',
        header: t('corp.assets.columnQuantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (row) => row.quantity.toLocaleString(),
        sortValue: (row) => row.quantity,
      },
      {
        id: 'location',
        header: t('corp.assets.columnLocation'),
        render: (row) => labels.locations.get(row.locationId) ?? `#${row.locationId}`,
        sortValue: (row) => labels.locations.get(row.locationId) ?? `#${row.locationId}`,
      },
    ],
    [t, labels]
  );

  return (
    <Disclosure
      label={label}
      trailing={t('corp.assets.itemCount', { count: group.rows.length })}
      expanded={expanded}
      onToggle={onToggle}
    >
      {group.rows.length === 0 ? (
        <p className="px-3 py-2 text-text-dim">{t('corp.assets.divisionEmpty')}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={group.rows}
          rowKey={(row) => row.itemId}
          label={t('corp.assets.tableLabel', { group: label })}
          defaultSort={{ columnId: 'item', direction: 'asc' }}
        />
      )}
    </Disclosure>
  );
}

/** Mounted only once Corp Access is `ready` — see the `/corp` loader note. */
function CorpAssetsView() {
  const { t } = useTranslation();
  const snapshot = useRouteSnapshot<AssetsSnapshot>(loadAssetsSnapshot, undefined, {
    // Keeps the asset list on screen during a manual refresh (issue #418).
    staleWhileRevalidate: true,
  });
  const data = snapshot.data;
  const [expanded, setExpanded] = useState<ReadonlySet<CorpAssetGroupId>>(new Set());

  const toggle = (id: CorpAssetGroupId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasAnyAssets = (data?.groups ?? []).some((group) => group.rows.length > 0);

  if (!snapshot.hydrated) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('corp.assets.title')}
        meta={
          data?.fetchedAt ? (
            <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('corp.assets.refresh')}
            onClick={snapshot.refresh}
            disabled={snapshot.loading}
          />
        }
      />
      <CorpSubNav />

      {snapshot.loading && data === null ? (
        <Spinner />
      ) : data === null || data.groups === null ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !hasAnyAssets ? (
        <EmptyState title={t('corp.assets.empty')} hint={t('corp.assets.emptyHint')} />
      ) : (
        <div className="space-y-2">
          {data.truncated && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} —{' '}
              {t('corp.assets.fetchTruncatedNotice', { shown: data.assetsShown })}
            </p>
          )}
          <Panel padded={false}>
            <div className="divide-y divide-line">
              {data.groups.map((group) => (
                <CorpAssetGroupSection
                  key={String(group.id)}
                  group={group}
                  label={groupLabel(t, group.id, data.divisionNames)}
                  labels={data.labels}
                  expanded={expanded.has(group.id)}
                  onToggle={() => toggle(group.id)}
                />
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

export function CorpAssets() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadAssets);

  if (gate.status === 'loading') return <Spinner />;

  if (gate.status === 'denied') {
    return (
      <div className="space-y-4">
        <PageHeader title={t('corp.assets.title')} />
        <EmptyState title={t('corp.assets.noAccessTitle')} hint={t('corp.assets.noAccessHint')} />
      </div>
    );
  }

  return <CorpAssetsView />;
}
