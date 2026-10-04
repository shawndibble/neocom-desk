import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { HELP_TABS, SETTINGS_TABS } from '@/app/pageTabs';
import { useIsPageIndex, usePageTab } from '@/lib/usePageTab';
import { tabPath } from '@/lib/pageTabs';
import {
  visibleSettingsGroups,
  type SettingsGroup,
  type SettingsSectionId,
} from '@/features/settings/sections';
import { SettingsBackLink, SettingsIndex, SettingsNav } from '@/features/settings/SettingsNav';
import { DevicePanel } from '@/features/settings/DevicePanel';
import { UpdatePanel } from '@/features/settings/UpdatePanel';
import { TravelSettingsPanel } from '@/features/settings/TravelSettingsPanel';
import { useDefaultRoutePreference } from '@/features/route/routeRules';
import { ROUTE_PREFERENCE_LABEL_KEYS } from '@/features/route/routePreferences';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import {
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextInput,
  type DataTableColumn,
  Checkbox,
  Field,
  Fields,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import {
  DEFAULT_MOBILE_TABS,
  MOBILE_TAB_CHOICES,
  MOBILE_TAB_COUNT,
  NAV_LABEL_KEYS,
  sortMobileTabs,
  useMobileTabs,
  type MobileTabPath,
} from '@/lib/mobileTabs';
import { useTimeFormat, useTimeZone, TIME_FORMATS } from '@/lib/timeFormat';
import {
  useCalendarWeekStart,
  CALENDAR_WEEK_START_DAYS,
} from '@/features/character/calendarWeekStart';
import { VIEW_PREFERENCE_KEYS } from '@/lib/viewPreferenceKeys';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import { formatTimestamp } from '@/lib/timestamp';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import { useMiningTaxOreValueMode } from '@/features/miningTax/oreValueMode';
import { useAssumedMe, MIN_ASSUMED_ME, MAX_ASSUMED_ME } from '@/features/industry/assumedMe';
import { useAssumedTe, MIN_ASSUMED_TE, MAX_ASSUMED_TE } from '@/features/industry/assumedTe';
import { useIncludeBlueprintCost } from '@/features/industry/includeBlueprintCost';
import { useExpiringWindowHours, EXPIRING_WINDOW_HOUR_OPTIONS } from '@/features/pi/expiringWindow';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { SP_EXTRACTION_CHUNK_SP } from '@/engine/spExtraction';
import {
  COLLATERAL_RATIO_OPTIONS,
  useCourierCollateralRatio,
} from '@/features/contractSearch/collateralThreshold';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { useDarkThreshold, DARK_AFTER_DAY_OPTIONS } from '@/features/corp/darkThreshold';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import {
  fromStoredCharacterFilterValue,
  toStoredCharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { PermissionsPanel } from '@/features/permissions/PermissionsPanel';
import { db } from '@/db';
import { exportBackupToFile, importBackup, type ImportSummary } from '@/backup/io';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import { useActivityLog, type ActivityLogEntry } from '@/stores/activityLog';
import type { ActivityOutcome } from '@/esi/activityLog';
import {
  activityLogCsvColumns,
  characterCell,
  dataAgeCsvColumns,
  OUTCOME_LABEL_KEYS,
} from './activityLogCsv';

const FONT_SCALE_LABEL_KEYS = {
  0.875: 'settings.fontScaleSmall',
  1: 'settings.fontScaleDefault',
  1.125: 'settings.fontScaleLarge',
  1.25: 'settings.fontScaleExtraLarge',
} as const satisfies Record<FontScale, string>;

const OUTCOME_TONE: Record<ActivityOutcome, string> = {
  success: 'text-success',
  authFailure: 'text-warning',
  error: 'text-danger',
};

/** Transient "it worked" note beside the button that produced it (same pattern as the skill planner's tools pane). */
function ActionConfirmation({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" className="text-xs text-success">
      {message}
    </p>
  );
}

/** Empty until the live query resolves — a lookup miss reads as "unknown", not "no characters". */
function useCharacterNames(): Map<number, string> {
  const characters = useLiveQuery(() => db.characters.toArray());
  return useMemo(
    () => new Map(characters?.map((c) => [c.characterId, c.name]) ?? []),
    [characters]
  );
}

function ActivityLogPanel() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const entries = useActivityLog((state) => state.entries);
  const clearLog = useActivityLog((state) => state.clear);
  const characterNames = useCharacterNames();
  const [clearedConfirm, setClearedConfirm] = useState(false);

  function handleClear() {
    clearLog();
    setClearedConfirm(true);
    setTimeout(() => setClearedConfirm(false), 2000);
  }

  const columns = useMemo<DataTableColumn<ActivityLogEntry>[]>(
    () => [
      {
        id: 'endpoint',
        header: t('activityLog.columnEndpoint'),
        className: 'font-mono text-[0.6875rem] text-text-dim',
        sortValue: (entry) => ENDPOINT_ROUTES[entry.endpointId],
        render: (entry) => ENDPOINT_ROUTES[entry.endpointId],
      },
      {
        id: 'character',
        header: t('activityLog.columnCharacter'),
        sortValue: (entry) => characterCell(entry.characterId, characterNames, t),
        render: (entry) => characterCell(entry.characterId, characterNames, t),
      },
      {
        id: 'time',
        header: t('activityLog.columnTime'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (entry) => entry.timestamp,
        // Full date, not just time-of-day: a session that crosses midnight
        // otherwise makes two entries on different days read as minutes apart.
        render: (entry) => formatTimestamp(new Date(entry.timestamp), timeZone),
      },
      {
        id: 'outcome',
        header: t('activityLog.columnOutcome'),
        className: 'font-semibold',
        cellClassName: (entry) => OUTCOME_TONE[entry.outcome],
        sortValue: (entry) => t(OUTCOME_LABEL_KEYS[entry.outcome]),
        render: (entry) => t(OUTCOME_LABEL_KEYS[entry.outcome]),
      },
    ],
    [t, characterNames, timeZone]
  );
  const csvColumns = useMemo(() => activityLogCsvColumns(t, characterNames), [t, characterNames]);
  const tableExport = useTableExport({
    surface: 'activity-log',
    rows: entries,
    columns: csvColumns,
  });

  return (
    <Panel
      title={t('activityLog.title')}
      actions={
        <>
          <Button size="sm" onClick={handleClear} disabled={entries.length === 0}>
            {t('activityLog.clearLog')}
          </Button>
          {entries.length > 0 && (
            <TableActionsMenu name={t('activityLog.title')} tableExport={tableExport} />
          )}
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-text-dim">{t('activityLog.hint')}</p>
        {clearedConfirm && <ActionConfirmation message={t('activityLog.clearedConfirm')} />}
        {entries.length === 0 ? (
          <EmptyState title={t('activityLog.emptyTitle')} hint={t('activityLog.emptyHint')} />
        ) : (
          <DataTable
            {...tableExport.tableProps}
            columns={columns}
            rows={entries}
            rowKey={(entry) => entry.id}
            label={t('activityLog.title')}
            density="compact"
            mobileSort
          />
        )}
      </div>
    </Panel>
  );
}

/**
 * The most recent *successful* fetch per endpoint/character pair — the
 * `DataAgeBadge` on every view, collected into one list for the surface that
 * replaces it on mobile (docs/context/decisions). A failed call never
 * updated anything, so it's excluded rather than shown as a "last updated".
 *
 * `entries` is most-recent-first (`stores/activityLog.ts`), so keeping only
 * the first entry seen per key already yields the latest one, in order —
 * no separate sort needed.
 */
function latestFetchPerSource(entries: ActivityLogEntry[]): ActivityLogEntry[] {
  const seen = new Map<string, ActivityLogEntry>();
  for (const entry of entries) {
    if (entry.outcome !== 'success') continue;
    const key = `${entry.endpointId}:${entry.characterId ?? 'public'}`;
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()];
}

/** `DataAgeBadge`'s cadence: ages are shown to the minute. */
const RELATIVE_AGE_TICK_MS = 30_000;

/**
 * "N min ago", kept current by the shared ticker. Its own component rather
 * than a `Date.now()` in the column's `render`: `DataTable`'s rows are
 * memoized, so a render-time read would freeze at whatever it said when the
 * row last changed.
 */
function RelativeAge({ timestamp }: { timestamp: number }) {
  const { t } = useTranslation();
  const now = useTicker(RELATIVE_AGE_TICK_MS);
  return formatAge(now - timestamp, t);
}

function DataAgePanel() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const entries = useActivityLog((state) => state.entries);
  const characterNames = useCharacterNames();
  const rows = useMemo(() => latestFetchPerSource(entries), [entries]);

  const columns = useMemo<DataTableColumn<ActivityLogEntry>[]>(
    () => [
      {
        id: 'endpoint',
        header: t('dataAge.columnEndpoint'),
        className: 'font-mono text-[0.6875rem] text-text-dim',
        sortValue: (entry) => ENDPOINT_ROUTES[entry.endpointId],
        render: (entry) => ENDPOINT_ROUTES[entry.endpointId],
      },
      {
        id: 'character',
        header: t('dataAge.columnCharacter'),
        sortValue: (entry) => characterCell(entry.characterId, characterNames, t),
        render: (entry) => characterCell(entry.characterId, characterNames, t),
      },
      {
        id: 'updated',
        header: t('dataAge.columnUpdated'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (entry) => entry.timestamp,
        render: (entry) => (
          <span title={formatTimestamp(new Date(entry.timestamp), timeZone)}>
            <RelativeAge timestamp={entry.timestamp} />
          </span>
        ),
      },
    ],
    [t, characterNames, timeZone]
  );
  const csvColumns = useMemo(() => dataAgeCsvColumns(t, characterNames), [t, characterNames]);
  const tableExport = useTableExport({ surface: 'data-age', rows, columns: csvColumns });

  return (
    <Panel
      title={t('dataAge.title')}
      actions={
        rows.length > 0 && <TableActionsMenu name={t('dataAge.title')} tableExport={tableExport} />
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-text-dim">{t('dataAge.hint')}</p>
        {rows.length === 0 ? (
          <EmptyState title={t('dataAge.emptyTitle')} hint={t('dataAge.emptyHint')} />
        ) : (
          <DataTable
            {...tableExport.tableProps}
            columns={columns}
            rows={rows}
            rowKey={(entry) => entry.id}
            label={t('dataAge.title')}
            density="compact"
            mobileSort
          />
        )}
      </div>
    </Panel>
  );
}

/**
 * Every Character on this device, encrypted under a password and downloaded
 * as a JSON file — the escape hatch for a new device that would otherwise
 * need EVE SSO re-run per alt (issue #789,
 * docs/adr/0014-encrypted-device-backup-for-cross-device-setup.md).
 * No character picker: always every Character, since the whole point is one
 * file that replaces re-login for all of them at once.
 */
function ExportPanel() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');

  const canExport = password.length > 0;

  async function handleExport() {
    setStatus('exporting');
    try {
      await exportBackupToFile(password);
      setPassword('');
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  }

  return (
    <Panel title={t('settings.backup.exportTitle')}>
      <div className="space-y-2">
        <p className="max-w-2xl text-xs text-text-dim">{t('settings.backup.exportHint')}</p>
        <p className="max-w-2xl text-xs text-warning">{t('settings.backup.passwordWarning')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            type="password"
            autoComplete="new-password"
            aria-label={t('settings.backup.passwordLabel')}
            placeholder={t('settings.backup.passwordLabel')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="max-w-xs min-w-0 flex-1 basis-48"
          />
          <Button
            size="sm"
            disabled={!canExport || status === 'exporting'}
            onClick={() => void handleExport()}
          >
            {t('settings.backup.exportButton')}
          </Button>
        </div>
        {status === 'done' && <ActionConfirmation message={t('settings.backup.exportDone')} />}
        {status === 'error' && (
          <p role="alert" className="text-xs text-danger">
            {t('settings.backup.exportError')}
          </p>
        )}
      </div>
    </Panel>
  );
}

/**
 * The counterpart to {@link ExportPanel}. Conflict policy (issue #789, not
 * relitigated here): a Character already on this device is skipped whole —
 * its token and data are untouched — a new Character is written in full.
 */
function ImportPanel() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'importing' | 'error'>('idle');
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleImport() {
    if (!file) return;
    setStatus('importing');
    setSummary(null);
    try {
      const contents = await file.text();
      const result = await importBackup(contents, password);
      setSummary(result);
      setPassword('');
      setFile(null);
      setStatus('idle');
      // A newly-added character's token needs `ensureSignedIn`/`planSync` to
      // run before it's usable, and any imported `sync.` setting is already
      // on disk but not in the zustand store that read it at boot — same gap
      // `ResetViewPreferences` above hits, and the same fix: reload once the
      // pilot has had a moment to read the summary below.
      if (result.addedCharacterIds.length > 0 || result.addedSettingKeys.length > 0) {
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <Panel title={t('settings.backup.importTitle')}>
      <div className="space-y-2">
        <p className="max-w-2xl text-xs text-text-dim">{t('settings.backup.importHint')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          aria-label={t('settings.backup.fileLabel')}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            {t('settings.backup.chooseFile')}
          </Button>
          <span className="min-w-0 truncate text-xs text-text-dim">
            {file ? file.name : t('settings.backup.noFileChosen')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            type="password"
            autoComplete="current-password"
            aria-label={t('settings.backup.passwordLabel')}
            placeholder={t('settings.backup.passwordLabel')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="max-w-xs min-w-0 flex-1 basis-48"
          />
          <Button
            size="sm"
            disabled={!file || password.length === 0 || status === 'importing'}
            onClick={() => void handleImport()}
          >
            {t('settings.backup.importButton')}
          </Button>
        </div>
        {status === 'error' && (
          <p role="alert" className="text-xs text-danger">
            {t('settings.backup.importError')}
          </p>
        )}
        {summary && (
          <p role="status" aria-live="polite" className="text-xs text-success">
            {t('settings.backup.importSummary', {
              added: summary.addedCharacterIds.length,
              skipped: summary.skippedCharacterIds.length,
            })}
            {(summary.addedCharacterIds.length > 0 || summary.addedSettingKeys.length > 0) &&
              ` ${t('settings.backup.importReloading')}`}
          </p>
        )}
      </div>
    </Panel>
  );
}

function DataPanel() {
  const { t } = useTranslation();
  const [clearedConfirm, setClearedConfirm] = useState(false);

  async function handleClearCache() {
    // Blunt on purpose, matching `esi/cachePurge.ts`'s own tier-2 fallback:
    // every character's rows, global reference data included. `esiCache` is
    // 100% re-derivable from ESI, so over-clearing costs a refetch, not data.
    await db.esiCache.clear();
    setClearedConfirm(true);
    setTimeout(() => setClearedConfirm(false), 2000);
  }

  return (
    <Panel title={t('settings.dataTitle')}>
      <div className="space-y-2">
        <p className="max-w-2xl text-xs text-text-dim">{t('settings.dataHint')}</p>
        <Button size="sm" onClick={() => void handleClearCache()}>
          {t('settings.clearCache')}
        </Button>
        {clearedConfirm && <ActionConfirmation message={t('settings.clearCacheConfirm')} />}
        <ResetViewPreferences />
      </div>
    </Panel>
  );
}

/**
 * Undoes the preferences pages remember silently — a pinned sort, a filter, a
 * remembered tab. Those have no control of their own anywhere, by design
 * (a duplicate control on this page is a second thing that can drift from what
 * the page itself shows), which is exactly why there has to be one way back.
 *
 * Scoped to `VIEW_PREFERENCE_KEYS`, never `db.settings.clear()`: that table
 * also holds hand-made character groups, saved skill comparisons, starred
 * characters and ore classifications. Clearing it wholesale would destroy work
 * the pilot did on purpose.
 */
function ResetViewPreferences() {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  async function handleReset() {
    await db.settings.bulkDelete([...VIEW_PREFERENCE_KEYS]);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2000);
    // Every one of these is read through a `createLocalSetting` store that has
    // already hydrated, so the rows are gone but the stores still hold the old
    // values. A reload is the honest way to show the result rather than
    // reaching into fifteen stores from here.
    window.location.reload();
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="max-w-2xl text-xs text-text-dim">{t('settings.resetViewPrefsHint')}</p>
      <Button size="sm" onClick={() => void handleReset()}>
        {t('settings.resetViewPrefs')}
      </Button>
      {confirmed && <ActionConfirmation message={t('settings.resetViewPrefsConfirm')} />}
    </div>
  );
}

/** The line every synced-defaults panel opens with. */
function DefaultsSyncHint() {
  const { t } = useTranslation();
  return <p className="max-w-2xl text-xs text-text-dim">{t('settings.defaultsSyncHint')}</p>;
}

/** A labelled row of preset chips — the shape every threshold control here uses; a `Fields` row. */
function ChipRow<T extends string | number>({
  label,
  hint,
  options,
  selected,
  onSelect,
  labelFor,
}: {
  label: string;
  hint?: string;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <Field label={label} note={hint}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <FilterChip
            key={String(option)}
            label={labelFor(option)}
            selected={selected === option}
            onToggle={() => onSelect(option)}
          />
        ))}
      </div>
    </Field>
  );
}

/**
 * Hydrates a preference store and reports whether it has settled.
 *
 * Every other page reads these stores after its own `hydrate()`; this page is
 * the only one that *writes* them, and it mounts none of those pages. Without
 * this, a cold load of `/settings` — a deep-linkable route — renders every
 * control at its default rather than the stored value. For a packed record
 * that is destructive rather than merely wrong: spreading an unhydrated
 * `{ npcStation, none, null }` over a stored `{ azbel, t2, 5 }` while changing
 * one field silently discards the rig level and the facility tax.
 *
 * `fontScale` and `timeFormat` escape this only because `App.tsx` hydrates
 * them for the whole shell.
 */
function useHydratedStore<T>(store: LocalSettingStore<T>): boolean {
  const hydrated = store((state) => state.hydrated);
  const hydrate = store((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return hydrated;
}

/**
 * Which four links the phone's bottom tab bar holds.
 *
 * Device-local, like the text scale above it and unlike everything in
 * `DefaultsPanel`: this answers for a screen — the one that has a tab bar at
 * all — not for the pilot. Because it cannot leave this device, setting it on a
 * laptop changes nothing on the phone, so `Settings` mounts the panel only
 * below `md` — the breakpoint `Layout` hides the bottom bar at, via the same
 * `useIsNarrow` query, so the panel and the bar cannot drift apart.
 *
 * The chips edit a draft, and the preference is written only when the draft is
 * a full bar of `MOBILE_TAB_COUNT` — a short bar is not a state the nav has.
 * So unpicking one leaves the old bar standing until a replacement is picked,
 * which is also the swap the pilot came to make.
 *
 * Unpicked chips go inert at four rather than silently evicting somebody's
 * choice — with no slots on screen there is no way to say *which* one a fifth
 * pick would replace.
 */
function MobileTabsPanel() {
  const { t } = useTranslation();
  const tabs = useMobileTabs((state) => state.value);
  const setTabs = useMobileTabs((state) => state.setValue);

  // `null` means "no edit in progress", so the panel follows the stored bar
  // until the pilot touches a chip — including when `App`'s hydration lands
  // after this first render, which a mirrored copy would have painted stale.
  const [pending, setPending] = useState<readonly MobileTabPath[] | null>(null);
  const draft = pending ?? tabs;
  const full = draft.length >= MOBILE_TAB_COUNT;

  function toggle(path: MobileTabPath) {
    const next = draft.includes(path)
      ? draft.filter((chosen) => chosen !== path)
      : sortMobileTabs([...draft, path]);
    if (next.length === MOBILE_TAB_COUNT) {
      setPending(null);
      void setTabs(next);
      return;
    }
    setPending(next);
  }

  function reset() {
    setPending(null);
    void setTabs(DEFAULT_MOBILE_TABS);
  }

  return (
    <Panel title={t('settings.mobileTabs.title')}>
      <div className="space-y-2">
        <p className="max-w-2xl text-xs text-text-dim">{t('settings.mobileTabs.hint')}</p>
        <div
          role="group"
          aria-label={t('settings.mobileTabs.group')}
          className="flex flex-wrap gap-2"
        >
          {MOBILE_TAB_CHOICES.map((path) => {
            const selected = draft.includes(path);
            return (
              <FilterChip
                key={path}
                label={t(NAV_LABEL_KEYS[path])}
                selected={selected}
                disabled={!selected && full}
                tooltip={!selected && full ? t('settings.mobileTabs.full') : undefined}
                onToggle={() => toggle(path)}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-text-dim" aria-live="polite">
            {t('settings.mobileTabs.chosen', { count: draft.length, total: MOBILE_TAB_COUNT })}
          </p>
          <Button size="sm" onClick={reset}>
            {t('settings.mobileTabs.reset')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/**
 * What a page assumes when the pilot has not said otherwise. Every control
 * in the Defaults panels below defaults to exactly what the app did before it
 * was settable, so an existing pilot's numbers do not move until they ask
 * them to.
 *
 * All of them sync (`lib/useSyncedSetting.ts`): these answer for the pilot,
 * not for the machine. The text-scale control does not — that one answers for
 * the screen.
 *
 * One panel per Settings section (Industry, Market, Characters), each gating
 * on its own stores: a control that rendered its default first would not
 * merely flicker, a press landing in that window would write the default over
 * what is on disk.
 */
function IndustryDefaultsPanel() {
  const { t } = useTranslation();
  const assumedMe = useAssumedMe((state) => state.value);
  const setAssumedMe = useAssumedMe((state) => state.setValue);
  const assumedTe = useAssumedTe((state) => state.value);
  const setAssumedTe = useAssumedTe((state) => state.setValue);
  const includeBlueprintCost = useIncludeBlueprintCost((state) => state.value);
  const setIncludeBlueprintCost = useIncludeBlueprintCost((state) => state.setValue);

  // Each on its own line, never `a() && b()`: `&&` short-circuits, which would
  // make every hook after the first false one a conditional call.
  const assumedMeHydrated = useHydratedStore(useAssumedMe);
  const assumedTeHydrated = useHydratedStore(useAssumedTe);
  const includeBlueprintCostHydrated = useHydratedStore(useIncludeBlueprintCost);
  const ready = assumedMeHydrated && assumedTeHydrated && includeBlueprintCostHydrated;

  if (!ready) {
    return (
      <Panel title={t('settings.industryDefaultsTitle')}>
        <Spinner />
      </Panel>
    );
  }

  return (
    <Panel title={t('settings.industryDefaultsTitle')}>
      <div className="space-y-4">
        <DefaultsSyncHint />
        <Fields variant="form">
          <Field
            label={t('settings.assumedMeLabel')}
            htmlFor="settings-assumed-me"
            note={t('settings.assumedMeHint')}
          >
            <TextInput
              id="settings-assumed-me"
              type="number"
              min={MIN_ASSUMED_ME}
              max={MAX_ASSUMED_ME}
              step={1}
              value={assumedMe}
              onChange={(event) => {
                const parsed = Math.round(Number(event.target.value));
                if (!Number.isFinite(parsed)) return;
                void setAssumedMe(Math.min(MAX_ASSUMED_ME, Math.max(MIN_ASSUMED_ME, parsed)));
              }}
              className="w-24"
            />
          </Field>

          {/*
            Beside its ME twin rather than merged with it: the two answer
            different questions (material cost, job time), and TE's range is
            0..20 where ME's is 0..10 (issue #634).
          */}
          <Field
            label={t('settings.assumedTeLabel')}
            htmlFor="settings-assumed-te"
            note={t('settings.assumedTeHint')}
          >
            <TextInput
              id="settings-assumed-te"
              type="number"
              min={MIN_ASSUMED_TE}
              max={MAX_ASSUMED_TE}
              step={1}
              value={assumedTe}
              onChange={(event) => {
                const parsed = Math.round(Number(event.target.value));
                if (!Number.isFinite(parsed)) return;
                void setAssumedTe(Math.min(MAX_ASSUMED_TE, Math.max(MIN_ASSUMED_TE, parsed)));
              }}
              className="w-24"
            />
          </Field>

          <Field
            label={t('settings.includeBlueprintCostLabel')}
            htmlFor="settings-include-blueprint-cost"
            inline
            note={t('settings.includeBlueprintCostHint')}
          >
            <Checkbox
              id="settings-include-blueprint-cost"
              checked={includeBlueprintCost}
              onChange={() => void setIncludeBlueprintCost(!includeBlueprintCost)}
            />
          </Field>
        </Fields>
      </div>
    </Panel>
  );
}

/** Beside the Industry defaults because Planetary Industry is an industry page; its own panel because its one control has nothing to do with a build. */
function PiDefaultsPanel() {
  const { t } = useTranslation();
  const expiringHours = useExpiringWindowHours((state) => state.value);
  const setExpiringHours = useExpiringWindowHours((state) => state.setValue);
  const hydrated = useHydratedStore(useExpiringWindowHours);

  return (
    <Panel title={t('settings.piDefaultsTitle')}>
      {hydrated ? (
        <Fields variant="form">
          <ChipRow
            label={t('settings.piExpiringLabel')}
            hint={t('settings.piExpiringHint')}
            options={EXPIRING_WINDOW_HOUR_OPTIONS}
            selected={expiringHours}
            onSelect={(hours) => void setExpiringHours(hours)}
            labelFor={(hours) => t('settings.hours', { count: hours })}
          />
        </Fields>
      ) : (
        <Spinner />
      )}
    </Panel>
  );
}

function MarketDefaultsPanel() {
  const { t } = useTranslation();
  const hub = useMarketHub((state) => state.value);
  const setHub = useMarketHub((state) => state.setValue);
  const hubHydrated = useHydratedStore(useMarketHub);
  const collateralRatio = useCourierCollateralRatio((state) => state.value);
  const setCollateralRatio = useCourierCollateralRatio((state) => state.setValue);
  const collateralHydrated = useHydratedStore(useCourierCollateralRatio);
  const hideAuctions = useBpcHideAuctionsDefault((state) => state.value);
  const setHideAuctions = useBpcHideAuctionsDefault((state) => state.setValue);
  const hideAuctionsHydrated = useHydratedStore(useBpcHideAuctionsDefault);
  const hidePlex = useBpcHidePlexDefault((state) => state.value);
  const setHidePlex = useBpcHidePlexDefault((state) => state.setValue);
  const hidePlexHydrated = useHydratedStore(useBpcHidePlexDefault);
  const hydrated = hubHydrated && collateralHydrated && hideAuctionsHydrated && hidePlexHydrated;

  return (
    <Panel title={t('settings.marketDefaultsTitle')}>
      {hydrated ? (
        <div className="space-y-4">
          <DefaultsSyncHint />
          <Fields variant="form">
            <Field
              label={t('settings.tradeHubLabel')}
              htmlFor="settings-hub"
              note={t('settings.tradeHubHint')}
            >
              <Select value={hub} onValueChange={(value) => void setHub(value as TradeHub['id'])}>
                <SelectTrigger id="settings-hub" aria-label={t('settings.tradeHubLabel')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADE_HUBS.map((tradeHub) => (
                    <SelectItem key={tradeHub.id} value={tradeHub.id}>
                      {tradeHub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <ChipRow
              label={t('settings.courierCollateralLabel')}
              hint={t('settings.courierCollateralHint')}
              options={COLLATERAL_RATIO_OPTIONS}
              selected={collateralRatio}
              onSelect={(ratio) => void setCollateralRatio(ratio)}
              labelFor={(ratio) => t('settings.courierCollateralOption', { count: ratio })}
            />

            <Field
              label={t('settings.bpcHideAuctionsLabel')}
              htmlFor="settings-bpc-hide-auctions"
              inline
            >
              <Checkbox
                id="settings-bpc-hide-auctions"
                checked={hideAuctions}
                onChange={() => void setHideAuctions(!hideAuctions)}
              />
            </Field>
            <Field
              label={t('settings.bpcHidePlexLabel')}
              htmlFor="settings-bpc-hide-plex"
              inline
              note={t('settings.bpcHideHint')}
            >
              <Checkbox
                id="settings-bpc-hide-plex"
                checked={hidePlex}
                onChange={() => void setHidePlex(!hidePlex)}
              />
            </Field>
          </Fields>
        </div>
      ) : (
        <Spinner />
      )}
    </Panel>
  );
}

function MiningTaxDefaultsPanel() {
  const { t } = useTranslation();
  const oreValueMode = useMiningTaxOreValueMode((state) => state.value);
  const setOreValueMode = useMiningTaxOreValueMode((state) => state.setValue);
  const hydrated = useHydratedStore(useMiningTaxOreValueMode);

  return (
    <Panel title={t('settings.miningTaxDefaultsTitle')}>
      {hydrated ? (
        <div className="space-y-4">
          <DefaultsSyncHint />
          <Fields variant="form">
            <Field
              label={t('settings.miningTaxOreValueModeLabel')}
              htmlFor="settings-mining-tax-ore-value-mode"
              inline
              note={t('settings.miningTaxOreValueModeHint')}
            >
              <Checkbox
                id="settings-mining-tax-ore-value-mode"
                checked={oreValueMode}
                onChange={() => void setOreValueMode(!oreValueMode)}
              />
            </Field>
          </Fields>
        </div>
      ) : (
        <Spinner />
      )}
    </Panel>
  );
}

function CharacterDefaultsPanel() {
  const { t } = useTranslation();
  const defaultCharacterFilter = useDefaultCharacterFilter((state) => state.value);
  const setDefaultCharacterFilter = useDefaultCharacterFilter((state) => state.setValue);
  const spExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.value);
  const setSpExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.setValue);
  const spExtractionThreshold = useSpExtractionThresholdSp((state) => state.value);
  const setSpExtractionThreshold = useSpExtractionThresholdSp((state) => state.setValue);

  const defaultCharacterFilterHydrated = useHydratedStore(useDefaultCharacterFilter);
  const spExtractionEnabledHydrated = useHydratedStore(useSpExtractionMonitoringEnabled);
  const spExtractionThresholdHydrated = useHydratedStore(useSpExtractionThresholdSp);
  const ready =
    defaultCharacterFilterHydrated && spExtractionEnabledHydrated && spExtractionThresholdHydrated;

  // Only for the picker's "This character" preview and quick-select — the
  // stored default itself keeps meaning "whichever Character I'm on" even on
  // a device with none active right now (`CharacterFilterControl` already
  // omits that quick-select when this is null).
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  if (!ready) {
    return (
      <Panel title={t('settings.characterDefaultsTitle')}>
        <Spinner />
      </Panel>
    );
  }

  return (
    <Panel title={t('settings.characterDefaultsTitle')}>
      <div className="space-y-4">
        <DefaultsSyncHint />
        <Fields variant="form">
          <Field
            label={t('settings.defaultCharacterFilterLabel')}
            note={t('settings.defaultCharacterFilterHint')}
          >
            <CharacterFilterControl
              activeCharacterId={activeCharacterId}
              value={fromStoredCharacterFilterValue(defaultCharacterFilter)}
              onChange={(next) =>
                void setDefaultCharacterFilter(toStoredCharacterFilterValue(next))
              }
            />
          </Field>

          <Field
            label={t('settings.spExtractionEnabledLabel')}
            htmlFor="settings-sp-extraction-enabled"
            inline
            note={t('settings.spExtractionEnabledHint')}
          >
            <Checkbox
              id="settings-sp-extraction-enabled"
              checked={spExtractionEnabled}
              onChange={() => void setSpExtractionEnabled(!spExtractionEnabled)}
            />
          </Field>
          {spExtractionEnabled && (
            <Field
              label={t('settings.spExtractionThresholdLabel')}
              htmlFor="settings-sp-extraction-threshold"
              note={t('settings.spExtractionThresholdHint')}
            >
              <TextInput
                id="settings-sp-extraction-threshold"
                type="number"
                min={SP_EXTRACTION_CHUNK_SP}
                step={SP_EXTRACTION_CHUNK_SP}
                value={spExtractionThreshold}
                onChange={(event) => {
                  const parsed = Math.round(Number(event.target.value));
                  if (!Number.isFinite(parsed) || parsed <= 0) return;
                  void setSpExtractionThreshold(parsed);
                }}
                className="w-40"
              />
            </Field>
          )}
        </Fields>
      </div>
    </Panel>
  );
}

/**
 * The corp roster's inactivity policy. The rail lists it only for a Character
 * who can actually reach the corp section — a setting for a page you cannot
 * open is noise, and this follows the same hide-rather-than-lock rule the corp
 * nav itself uses.
 */
function CorpDefaultsPanel() {
  const { t } = useTranslation();
  const access = useCorpAccess();
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const setDarkAfterDays = useDarkThreshold((state) => state.setValue);
  const hydrated = useHydratedStore(useDarkThreshold);

  // Reachable by URL even when the rail hides it, so say why it is empty.
  if (access.state !== 'ready') {
    return (
      <Panel title={t('settings.corpDefaultsTitle')}>
        <p className="text-xs text-text-dim">{t('settings.corpUnavailable')}</p>
      </Panel>
    );
  }
  if (!hydrated) {
    return (
      <Panel title={t('settings.corpDefaultsTitle')}>
        <Spinner />
      </Panel>
    );
  }

  return (
    <Panel title={t('settings.corpDefaultsTitle')}>
      <div className="space-y-4">
        <DefaultsSyncHint />
        <Fields variant="form">
          <ChipRow
            label={t('settings.darkThresholdLabel')}
            hint={t('settings.darkThresholdHint')}
            options={DARK_AFTER_DAY_OPTIONS}
            selected={darkAfterDays}
            onSelect={(days) => void setDarkAfterDays(days)}
            labelFor={(days) => t('settings.days', { count: days })}
          />
        </Fields>
      </div>
    </Panel>
  );
}

/**
 * Links that predate the sectioned page: the `?` shortcut and the corp prompt
 * pointed at an anchor on the old General tab. A bookmark of either still
 * lands on the default section (`TabRoute` drops an unknown segment but keeps
 * the hash), and this is what carries it on to where the anchor's content now
 * lives.
 */
const LEGACY_HASH_TARGETS: Readonly<Record<string, string>> = {
  // Shortcuts left Settings for Help (scope decision
  // `20261002-165816-shortcuts-move-to-help-always-on-and-lose`).
  '#shortcuts': tabPath(HELP_TABS, 'shortcuts'),
  '#corp-access': tabPath(SETTINGS_TABS, 'permissions'),
};

/**
 * One line per section for the phone list, from settings already in memory —
 * no network. A section with nothing cheap to say (Permissions, Alerts, Data
 * & storage, Activity Log, FAQ) gets none.
 */
function usePhoneSummaries(): Partial<Record<SettingsSectionId, string>> {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const timeFormat = useTimeFormat((state) => state.value);
  const assumedMe = useAssumedMe((state) => state.value);
  const assumedTe = useAssumedTe((state) => state.value);
  const hub = useMarketHub((state) => state.value);
  const characterFilter = useDefaultCharacterFilter((state) => state.value);
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const avoidedCount = useAvoidedSystems((state) => state.value.length);
  // Only the Travel panel hydrates this otherwise, and the phone list does not mount it.
  useHydratedStore(useAvoidedSystems);
  const routePreference = useDefaultRoutePreference((state) => state.value);
  useHydratedStore(useDefaultRoutePreference);

  return {
    display: t('settings.summary.display', {
      size: t(FONT_SCALE_LABEL_KEYS[scale]),
      format: t(`settings.timeFormat.${timeFormat}`),
    }),
    industry: t('settings.summary.industry', {
      me: assumedMe,
      te: assumedTe,
    }),
    market: TRADE_HUBS.find((tradeHub) => tradeHub.id === hub)?.name,
    characters:
      characterFilter === 'current'
        ? t('settings.summary.charactersCurrent')
        : characterFilter === 'all'
          ? t('settings.summary.charactersAll')
          : t('settings.summary.charactersSome', { count: characterFilter.length }),
    corporation: t('settings.summary.corporation', { count: darkAfterDays }),
    travel: t('settings.summary.travel', {
      preference: t(ROUTE_PREFERENCE_LABEL_KEYS[routePreference]),
      count: avoidedCount,
    }),
  };
}

/** `/settings` on a phone: the grouped list of sections. */
function PhoneSettingsIndex({ groups }: { groups: readonly SettingsGroup[] }) {
  const summaries = usePhoneSummaries();
  return <SettingsIndex groups={groups} summaries={summaries} />;
}

export function Settings() {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const setScale = useFontScale((state) => state.setValue);
  const timeFormat = useTimeFormat((state) => state.value);
  const isNarrow = useIsNarrow();
  const setTimeFormat = useTimeFormat((state) => state.setValue);
  const weekStart = useCalendarWeekStart((state) => state.value);
  const setWeekStart = useCalendarWeekStart((state) => state.setValue);
  // Unlike `fontScale`/`timeFormat`, `App.tsx` does not hydrate this store for
  // the whole shell — it is otherwise only read from within `Calendar.tsx`
  // after that page's own `hydrate()` — so a cold load straight to `/settings`
  // needs its own hydrate here too, or the chip would paint the default until
  // Calendar happened to be visited (see `useHydratedStore`'s doc comment).
  const weekStartHydrated = useHydratedStore(useCalendarWeekStart);
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [section] = usePageTab(SETTINGS_TABS);
  // An old `#shortcuts` link is about to be carried on to where it lives now: skip the list.
  const isIndex = useIsPageIndex(SETTINGS_TABS) && !Object.hasOwn(LEGACY_HASH_TARGETS, hash);
  const corpAccess = useCorpAccess();
  const groups = useMemo(
    () => visibleSettingsGroups({ corp: corpAccess.state === 'ready' }),
    [corpAccess.state]
  );

  useEffect(() => {
    // `hasOwn`: a hash like `#constructor` must not resolve to an inherited member.
    if (!Object.hasOwn(LEGACY_HASH_TARGETS, hash)) return;
    navigate({ pathname: LEGACY_HASH_TARGETS[hash] }, { replace: true });
  }, [hash, navigate]);

  if (isIndex) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader title={t('settings.title')} />
        <PhoneSettingsIndex groups={groups} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('settings.title')} actions={<SettingsBackLink />} />
      <div className="space-y-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6 md:space-y-0">
        <SettingsNav groups={groups} value={section} />
        <div className="min-w-0 space-y-4">
          {section === 'display' && (
            <>
              <Panel title={t('settings.displayTitle')}>
                <Fields variant="form">
                  <Field label={t('settings.fontScaleLabel')} note={t('settings.fontScaleHint')}>
                    <div
                      role="group"
                      aria-label={t('settings.fontScaleLabel')}
                      className="flex flex-wrap gap-2"
                    >
                      {FONT_SCALE_STEPS.map((step) => (
                        <FilterChip
                          key={step}
                          label={t(FONT_SCALE_LABEL_KEYS[step])}
                          selected={scale === step}
                          onToggle={() => void setScale(step)}
                        />
                      ))}
                    </div>
                  </Field>
                  {/*
                  EVE runs on UTC and so does every timer other players quote,
                  which is why one column already rendered it before this was
                  settable. The Calendar grids are deliberately excluded — they
                  bucket events into local-day cells, so converting only the
                  rendered string would file a late-evening event under the wrong
                  day.
                */}
                  <ChipRow
                    label={t('settings.timeFormatLabel')}
                    hint={t('settings.timeFormatHint')}
                    options={TIME_FORMATS}
                    selected={timeFormat}
                    onSelect={(format) => void setTimeFormat(format)}
                    labelFor={(format) => t(`settings.timeFormat.${format}`)}
                  />
                  {weekStartHydrated && (
                    <ChipRow
                      label={t('settings.weekStartLabel')}
                      hint={t('settings.weekStartHint')}
                      options={CALENDAR_WEEK_START_DAYS}
                      selected={weekStart}
                      onSelect={(day) => void setWeekStart(day)}
                      labelFor={(day) => t(`settings.weekStart.${day}`)}
                    />
                  )}
                </Fields>
              </Panel>
              {isNarrow && <MobileTabsPanel />}
            </>
          )}
          {/*
            The Corporation row in here is the only way in to corp access for a
            Character that dismissed the one-time prompt (corp UI is hidden
            rather than locked), which is why `#corp-access` keeps redirecting
            to this section.
          */}
          {section === 'permissions' && <PermissionsPanel />}
          {section === 'industry' && (
            <>
              <IndustryDefaultsPanel />
              <PiDefaultsPanel />
            </>
          )}
          {section === 'market' && <MarketDefaultsPanel />}
          {section === 'miningTax' && <MiningTaxDefaultsPanel />}
          {section === 'characters' && <CharacterDefaultsPanel />}
          {section === 'corporation' && <CorpDefaultsPanel />}
          {section === 'travel' && <TravelSettingsPanel />}
          {/* The Overview feed's "Settings" link targets `/settings/notifications` directly. */}
          {section === 'notifications' && <NotificationsPanel />}
          {/*
            The four short action panels sit two-up from `xl`: one column of
            them left most of each card empty. Export beside Import, since
            they are one round trip; the device's log-out row stays full width.
            Data Age goes last: its list grows with every endpoint and
            Character, and it is the least-used block on the page.
          */}
          {section === 'dataAge' && (
            <>
              <div className="grid items-start gap-4 xl:grid-cols-2">
                <DataPanel />
                <UpdatePanel />
                <ExportPanel />
                <ImportPanel />
              </div>
              <DevicePanel />
              <DataAgePanel />
            </>
          )}
          {section === 'activity' && <ActivityLogPanel />}
        </div>
      </div>
    </div>
  );
}
