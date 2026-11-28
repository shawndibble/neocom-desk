import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  DataTable,
  Eyebrow,
  EmptyState,
  LoadFailedState,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import { resolveRate } from '@/engine/corpTaxBook/rates';
import {
  sharingMoons,
  unplacedRefineries,
  type SharingMoonRow,
  type UnplacedRefinery,
} from '@/engine/corpTaxBook/sharingMoons';
import { utcDay } from '@/engine/localDay';
import { loadMyCommunitiesCached } from '@/features/communities/communityStore';
import { callableErrorText } from './feederErrorText';
import { audienceKey, type PopSharingSettings } from '../../../../functions/src/popSharing';
import { getCorporationPublicInfo } from '@/esi/endpoints/corp';
import { AudienceName, PopSharingDialog, type CommunityChoice } from './PopSharingDialog';
import { PlaceCell } from './sectionParts';
import { popShareMark } from '@/engine/corpTaxBook/popShareMarks';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { PopShareIcon } from './PopShareIcon';
import { useBook } from './useBook';
import { usePopSharing, usePopSharingCommunities } from './usePopSharing';
import type { PopSharingCommunityStatus } from '../taxBook/popSharingClient';
import { TableScroll } from '@/components/ui/TableScroll';

const k = 'corpTaxBook.moons.sharing';

const CommunityStatus = createContext<Record<string, PopSharingCommunityStatus>>({});

function Audiences({ settings }: { settings: PopSharingSettings }) {
  const { t } = useTranslation();
  const status = useContext(CommunityStatus);
  if (settings.audiences.length === 0) return <>{t(`${k}.audience.none`)}</>;
  return (
    <>
      {settings.audiences.map((a, i) => {
        const s = a.kind === 'community' ? status[a.communityId] : undefined;
        return (
          <span key={audienceKey(a)}>
            {i > 0 && ', '}
            <AudienceName audience={a} />
            {s && (s.blocked || !s.officer) && (
              <>
                {' '}
                <Pill tone="warning">
                  {t(s.blocked ? `${k}.communityBlocked` : `${k}.noOfficer`)}
                </Pill>
              </>
            )}
          </span>
        );
      })}
    </>
  );
}

function UnplacedRefineries({ refineries }: { refineries: readonly UnplacedRefinery[] }) {
  const { t } = useTranslation();
  const { names } = useBook();
  return (
    <section className="space-y-2 border-t border-line p-3">
      <Eyebrow as="h3">{t(`${k}.unplaced.title`)}</Eyebrow>
      <p className="text-sm text-text-dim">{t(`${k}.unplaced.hint`)}</p>
      <ul className="space-y-1.5 text-sm">
        {refineries.map((r) => (
          <li key={r.structureId} className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <PlaceCell
                refinery={names.refinery(r.structureId)}
                undockable={names.undockable?.(r.structureId)}
                moon={undefined}
              />
              {r.ownerOptedOut && <Pill tone="warning">{t(`${k}.ownerOptedOut`)}</Pill>}
            </span>
            {r.ownerCorporationId !== undefined && (
              <span className="block text-xs text-text-dim">
                {names.corporation(r.ownerCorporationId)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SettingsSummary({
  settings,
  bookRatePct,
}: {
  settings: PopSharingSettings;
  bookRatePct: number | null;
}) {
  const { t } = useTranslation();
  const rate =
    settings.ratePct !== null
      ? `${settings.ratePct}%`
      : bookRatePct === null
        ? t(`${k}.bookRate`)
        : t(`${k}.bookRatePct`, { pct: bookRatePct });
  const lines: [string, ReactNode][] = [
    [t(`${k}.fields.audiences`), <Audiences key="a" settings={settings} />],
    [t(`${k}.fields.popTime`), t(`${k}.popTime.${settings.popTime}`)],
    [t(`${k}.fields.ore`), t(settings.showOre ? `${k}.oreShown` : `${k}.oreHidden`)],
    [t(`${k}.fields.rate`), rate],
    [t(`${k}.fields.notes`), settings.notes || '—'],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {lines.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-text-dim">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const NO_COMMUNITIES: CommunityChoice[] = [];

export function SharingTab({ onOpenSyncSettings }: { onOpenSyncSettings: () => void }) {
  const { t } = useTranslation();
  const { view, data, settings, names, canEdit, edit, characterId, corporationId } = useBook();
  const { load, reload } = usePopSharing(characterId, corporationId);
  const communityStatus = usePopSharingCommunities(characterId, corporationId, load);
  const highlightedMoonId = useHighlightParam();
  const [editing, setEditing] = useState<'default' | SharingMoonRow | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const loadCommunities = useCallback(
    () =>
      loadMyCommunitiesCached(characterId).then((list) =>
        list.map((c): CommunityChoice => ({ communityId: c.id, name: c.name }))
      ),
    [characterId]
  );
  const communities =
    useKeyedLoad(String(characterId), loadCommunities, !canEdit).data ?? NO_COMMUNITIES;

  const loadNoAlliance = useCallback(
    () =>
      getCorporationPublicInfo(corporationId).then((r) =>
        r.data ? r.data.alliance_id === undefined : false
      ),
    [corporationId]
  );
  const noAlliance = useKeyedLoad(String(corporationId), loadNoAlliance).data ?? false;

  const bookRateAt = useCallback(
    (row?: SharingMoonRow) =>
      resolveRate(settings.rates, {
        date: utcDay(),
        minerId: '',
        moonId: row?.moonId,
        structureId: row?.structureId,
        feederId: row?.ownerCorporationId,
        recordKey: '',
        isGuest: false,
      })?.pct ?? null,
    [settings.rates]
  );
  const bookRatePct = useMemo(() => bookRateAt(), [bookRateAt]);
  const doc = load.state === 'ready' ? load.doc : null;
  const rows = useMemo(
    () => (doc ? sharingMoons(view.extractions, data.feeders ?? [], doc) : []),
    [doc, view.extractions, data.feeders]
  );
  const unplaced = useMemo(
    () =>
      unplacedRefineries(
        view.extractions,
        data.feeders ?? [],
        data.scheduledSync?.refineryIds ?? []
      ),
    [view.extractions, data.feeders, data.scheduledSync]
  );

  if (load.state === 'loading')
    return (
      <div className="flex justify-center p-8">
        <Spinner label={t('common.loading')} />
      </div>
    );
  if (load.state === 'failed' || !doc)
    return <LoadFailedState title={t(`${k}.loadFailed`)} onRetry={reload} />;

  const syncOn = data.scheduledSync?.status === 'active';
  const save = async (action: Record<string, unknown> & { action: string }) => {
    try {
      await edit(action);
    } finally {
      reload();
    }
  };
  const toggle = async (enabled: boolean) => {
    setSwitching(true);
    setSwitchError(null);
    try {
      await save({ action: 'setPopSharing', enabled });
    } catch (e) {
      setSwitchError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
    } finally {
      setSwitching(false);
    }
  };

  const columns: DataTableColumn<SharingMoonRow>[] = [
    {
      id: 'moon',
      header: t('corpTaxBook.moons.cols.moon'),
      primary: true,
      render: (row) => (
        <>
          <span className="flex min-w-0 items-center gap-1.5">
            <PlaceCell
              refinery={names.refinery(row.structureId)}
              undockable={names.undockable?.(row.structureId)}
              moon={names.moon(row.moonId)}
              accent
            />
            <PopShareIcon mark={popShareMark(row)} />
          </span>
          {row.ownerCorporationId !== undefined && (
            <span className="block text-xs text-text-dim">
              {names.corporation(row.ownerCorporationId)}
            </span>
          )}
        </>
      ),
      sortValue: (row) => names.refinery(row.structureId),
    },
    {
      id: 'audiences',
      header: t(`${k}.fields.audiences`),
      render: (row) =>
        row.ownerOptedOut ? (
          <Pill tone="warning">{t(`${k}.ownerOptedOut`)}</Pill>
        ) : (
          <Audiences settings={row.effective.settings} />
        ),
    },
    {
      id: 'popTime',
      header: t(`${k}.fields.popTime`),
      render: (row) => t(`${k}.popTime.${row.effective.settings.popTime}`),
    },
    {
      id: 'overrides',
      header: t(`${k}.cols.overrides`),
      render: (row) =>
        row.effective.overridden.length === 0
          ? t(`${k}.followsDefault`)
          : t(`${k}.overrides`, { count: row.effective.overridden.length }),
      sortValue: (row) => row.effective.overridden.length,
    },
  ];

  const editingMoon = editing !== null && editing !== 'default' ? editing : null;
  return (
    <CommunityStatus.Provider value={communityStatus}>
      <div className="space-y-4">
        <Panel
          title={t(`${k}.title`)}
          actions={
            canEdit ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing('default')}>
                {t(`${k}.editDefault`)}
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-text-dim">{t(`${k}.intro`)}</p>
            <p className="text-sm text-text-dim">{t(`${k}.savesAlone`)}</p>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox
                checked={doc.enabled}
                disabled={!canEdit || switching || (!doc.enabled && !syncOn)}
                onChange={(e) => void toggle(e.target.checked)}
              />
              {t(`${k}.enabled`)}
            </label>
            {!syncOn && (
              <p className="text-sm text-warning">
                {t(doc.enabled ? `${k}.syncStopped` : `${k}.needsSync`)}{' '}
                <button type="button" className={inlineLinkClassName} onClick={onOpenSyncSettings}>
                  {t(`${k}.openSyncSettings`)}
                </button>
              </p>
            )}
            {switchError && <InlineError>{switchError}</InlineError>}
            <Eyebrow as="h3" className="pt-1">
              {t(`${k}.default`)}
            </Eyebrow>
            <SettingsSummary settings={doc.defaults} bookRatePct={bookRatePct} />
          </div>
        </Panel>
        <Panel title={t(`${k}.moons`)} padded={false}>
          {rows.length === 0 && unplaced.length === 0 && <EmptyState title={t(`${k}.noMoons`)} />}
          {rows.length > 0 && (
            <TableScroll>
              <DataTable
                label={t(`${k}.moons`)}
                columns={columns}
                rows={rows}
                rowKey={(row) => String(row.moonId)}
                onRowClick={(row) => setEditing(row)}
                highlightRowKey={highlightedMoonId === null ? null : String(highlightedMoonId)}
                defaultSort={{ columnId: 'moon', direction: 'asc' }}
                mobileSort
                stackColumns={2}
                stackSummary={t(`${k}.moonsSummary`, { count: rows.length })}
              />
            </TableScroll>
          )}
          {unplaced.length > 0 && <UnplacedRefineries refineries={unplaced} />}
        </Panel>
        {editing === 'default' && (
          <PopSharingDialog
            title={t(`${k}.editDefault`)}
            settings={doc.defaults}
            communities={communities}
            bookRatePct={bookRatePct}
            canEdit={canEdit}
            noAlliance={noAlliance}
            onClose={() => setEditing(null)}
            onSave={(patch) => save({ action: 'setPopSharing', defaults: patch })}
          />
        )}
        {editingMoon && (
          <PopSharingDialog
            title={t(`${k}.editMoon`, { moon: names.moon(editingMoon.moonId) })}
            settings={editingMoon.effective.settings}
            defaults={doc.defaults}
            override={doc.moons[String(editingMoon.moonId)] ?? {}}
            communities={communities}
            bookRatePct={bookRateAt(editingMoon)}
            canEdit={canEdit}
            noAlliance={noAlliance}
            onClose={() => setEditing(null)}
            onSave={(patch) =>
              save({ action: 'setPopSharingMoon', moonId: editingMoon.moonId, ...patch })
            }
          />
        )}
      </div>
    </CommunityStatus.Provider>
  );
}
