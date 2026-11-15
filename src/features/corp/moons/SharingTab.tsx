/**
 * The Moons page's Sharing tab (issue #6222): the book's Pop Sharing switch and Sharing
 * default on top, every moon the book handles below (its own refineries and its moon
 * owners'), each row opening its overrides. Settings only: later tickets publish the Shared
 * Pops. Book editors change them; read-only officers see them.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  LoadFailedState,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { Pill } from '@/components/ui/Pill';
import { resolveRate } from '@/engine/corpTaxBook/rates';
import { sharingMoons, type SharingMoonRow } from '@/engine/corpTaxBook/sharingMoons';
import { utcDay } from '@/engine/localDay';
import { loadMyCommunitiesCached } from '@/features/communities/communityStore';
import type { PopSharingSettings } from '../../../../functions/src/popSharing';
import { callableErrorText } from './feederErrorText';
import { AudienceName, PopSharingDialog, type CommunityChoice } from './PopSharingDialog';
import { PlaceCell } from './sectionParts';
import { useBook } from './useBook';
import { usePopSharing } from './usePopSharing';

const k = 'corpTaxBook.moons.sharing';

function Audiences({ settings }: { settings: PopSharingSettings }) {
  const { t } = useTranslation();
  if (settings.audiences.length === 0) return <>{t(`${k}.audience.none`)}</>;
  return (
    <>
      {settings.audiences.map((a, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <AudienceName audience={a} />
        </span>
      ))}
    </>
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

export function SharingTab() {
  const { t } = useTranslation();
  const { view, data, settings, names, canEdit, edit, characterId, corporationId, openSettings } =
    useBook();
  const { load, reload } = usePopSharing(characterId, corporationId);
  const [communities, setCommunities] = useState<CommunityChoice[]>([]);
  const [editing, setEditing] = useState<'default' | SharingMoonRow | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    loadMyCommunitiesCached(characterId).then(
      (list) =>
        !cancelled && setCommunities(list.map((c) => ({ communityId: c.id, name: c.name }))),
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [canEdit, characterId]);

  const bookRatePct = useMemo(
    () =>
      resolveRate(settings.rates, {
        date: utcDay(),
        minerId: '',
        moonId: undefined,
        recordKey: '',
        isGuest: false,
      })?.pct ?? null,
    [settings.rates]
  );
  const doc = load.state === 'ready' ? load.doc : null;
  const rows = useMemo(
    () => (doc ? sharingMoons(view.extractions, data.feeders ?? [], doc) : []),
    [doc, view.extractions, data.feeders]
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
          <PlaceCell
            refinery={names.refinery(row.structureId)}
            undockable={names.undockable?.(row.structureId)}
            moon={names.moon(row.moonId)}
            accent
          />
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
              {openSettings && (
                <button
                  type="button"
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={() => openSettings('access')}
                >
                  {t(`${k}.openSyncSettings`)}
                </button>
              )}
            </p>
          )}
          {switchError && <InlineError>{switchError}</InlineError>}
          <h3 className="pt-1 text-xs font-semibold tracking-widest text-text-dim uppercase">
            {t(`${k}.default`)}
          </h3>
          <SettingsSummary settings={doc.defaults} bookRatePct={bookRatePct} />
        </div>
      </Panel>
      <Panel title={t(`${k}.moons`)} padded={false}>
        {rows.length === 0 ? (
          <EmptyState title={t(`${k}.noMoons`)} />
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              label={t(`${k}.moons`)}
              columns={columns}
              rows={rows}
              rowKey={(row) => String(row.moonId)}
              onRowClick={(row) => setEditing(row)}
              defaultSort={{ columnId: 'moon', direction: 'asc' }}
              mobileSort
              stackColumns={2}
              stackSummary={t(`${k}.moonsSummary`, { count: rows.length })}
            />
          </div>
        )}
      </Panel>
      {editing === 'default' && (
        <PopSharingDialog
          title={t(`${k}.editDefault`)}
          settings={doc.defaults}
          communities={communities}
          bookRatePct={bookRatePct}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
          onSave={(patch) => save({ action: 'setPopSharing', defaults: patch })}
        />
      )}
      {editingMoon && (
        <PopSharingDialog
          title={t(`${k}.editMoon`, { moon: names.moon(editingMoon.moonId) })}
          settings={editingMoon.effective.settings}
          override={doc.moons[String(editingMoon.moonId)] ?? {}}
          communities={communities}
          bookRatePct={bookRatePct}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
          onSave={(patch) =>
            save({ action: 'setPopSharingMoon', moonId: editingMoon.moonId, override: patch })
          }
        />
      )}
    </div>
  );
}
