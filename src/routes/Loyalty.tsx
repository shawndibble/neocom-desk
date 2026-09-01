import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  Panel,
  ReauthBanner,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import type { CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

interface Snapshot {
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  loyaltyNeedsReauth: boolean;
  corporationNames: Map<number, string>;
}

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

async function loadLoyaltySnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: loyaltyResult, needsReauth: loyaltyNeedsReauth } =
    await loadCharacterLoyaltyPoints(characterId);
  // Already superseded: skip the name lookup, its result would be discarded.
  const corporationIds = signal.cancelled
    ? []
    : (loyaltyResult?.data ?? []).map((entry) => entry.corporation_id);
  const corporationNames = await resolveNames(corporationIds);
  return { loyaltyResult, loyaltyNeedsReauth, corporationNames };
}

/** Loyalty: which corporations the character holds LP with, and how much. */
export function Loyalty() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadLoyaltySnapshot);

  const loyaltyResult = data?.loyaltyResult ?? null;
  const loyaltyNeedsReauth = data?.loyaltyNeedsReauth ?? false;
  const corporationNames = data?.corporationNames ?? NO_NAMES;

  const balances = useMemo(() => loyaltyResult?.data ?? [], [loyaltyResult]);

  const columns = useMemo<DataTableColumn<CharacterLoyaltyPoints>[]>(
    () => [
      {
        id: 'corporation',
        header: t('loyalty.corporation'),
        render: (entry) => corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`,
        sortValue: (entry) =>
          corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`,
      },
      {
        id: 'points',
        header: t('loyalty.points'),
        align: 'right',
        className: 'tabular-nums font-semibold',
        render: (entry) => entry.loyalty_points.toLocaleString(),
        sortValue: (entry) => entry.loyalty_points,
      },
    ],
    [t, corporationNames]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('loyalty.title')}</h1>
        <div className="flex items-center gap-2">
          {loyaltyResult && <DataAgeBadge date={loyaltyResult.fetchedAt} />}
          <Button size="sm" onClick={refresh} disabled={loading}>
            {t('loyalty.refresh')}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : loyaltyNeedsReauth ? (
        <ReauthBanner
          title={t('loyalty.reauthTitle')}
          hint={t('loyalty.reauthHint')}
          actionLabel={t('loyalty.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !loyaltyResult || balances.length === 0 ? (
        <EmptyState title={t('loyalty.emptyTitle')} hint={t('loyalty.emptyHint')} />
      ) : (
        <Panel padded={false}>
          {loyaltyResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          <DataTable
            label={t('loyalty.title')}
            columns={columns}
            rows={balances}
            rowKey={(entry) => entry.corporation_id}
            defaultSort={{ columnId: 'points', direction: 'desc' }}
          />
        </Panel>
      )}
    </div>
  );
}
