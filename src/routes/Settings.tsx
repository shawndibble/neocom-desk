import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
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
  Tabs,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { useTimeFormat, useTimeZone, TIME_FORMATS } from '@/lib/timeFormat';
import { VIEW_PREFERENCE_KEYS } from '@/lib/viewPreferenceKeys';
import { formatAge } from '@/lib/age';
import { formatTimestamp } from '@/lib/timestamp';
import { SHORTCUTS } from '@/lib/shortcuts';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { FACILITY_PRESETS, RIG_KIND_OPTIONS, setRigSlot } from '@/engine/industry/types';
import { rigKindLabelKey } from '@/features/industry/rigFitLabels';
import { useMarketHub } from '@/features/market/hub';
import { useAssumedMe, MIN_ASSUMED_ME, MAX_ASSUMED_ME } from '@/features/industry/assumedMe';
import { useAssumedTe, MIN_ASSUMED_TE, MAX_ASSUMED_TE } from '@/features/industry/assumedTe';
import {
  useFacilityDefaults,
  normalizeFacilityDefaults,
  type FacilityDefaults,
} from '@/features/industry/facilityDefaults';
import { useExpiringWindowHours, EXPIRING_WINDOW_HOUR_OPTIONS } from '@/features/pi/expiringWindow';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { SP_EXTRACTION_CHUNK_SP } from '@/engine/spExtraction';
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
import { CorpAccessPanel } from '@/features/corp/CorpAccessPanel';
import { FaqPanel } from '@/features/faq/FaqPanel';
import { db } from '@/db';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import { useActivityLog, type ActivityLogEntry } from '@/stores/activityLog';
import type { ActivityOutcome } from '@/esi/activityLog';

type SettingsTab = 'general' | 'notifications' | 'dataAge' | 'activity' | 'faq';

/**
 * Which tab a deep link's hash asks for. The Overview feed links to
 * `/settings#notifications`, which used to resolve by scrolling within the
 * default General tab; Notifications is now a tab of its own, so a hash that
 * names a section on a *different* tab has to select that tab or the link
 * lands on a page with no sign of what it came for.
 */
const TAB_FOR_HASH: Readonly<Record<string, SettingsTab>> = {
  notifications: 'notifications',
  'corp-access': 'general',
  // `/settings#faq` is the link to hand someone who asks what the app stores —
  // worth being addressable from outside the app (a forum post, a README),
  // which a tab with no hash of its own would not be.
  faq: 'faq',
};

const FONT_SCALE_LABEL_KEYS = {
  0.875: 'settings.fontScaleSmall',
  1: 'settings.fontScaleDefault',
  1.125: 'settings.fontScaleLarge',
  1.25: 'settings.fontScaleExtraLarge',
} as const satisfies Record<FontScale, string>;

const OUTCOME_LABEL_KEYS = {
  success: 'activityLog.outcomeSuccess',
  authFailure: 'activityLog.outcomeAuthFailure',
  error: 'activityLog.outcomeError',
} as const satisfies Record<ActivityOutcome, string>;

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

/** Shared "Character" column render for `ActivityLogPanel` and `DataAgePanel`. */
function characterCell(
  characterId: number | undefined,
  characterNames: Map<number, string>,
  t: (key: string) => string
): string {
  return characterId === undefined
    ? t('activityLog.publicCall')
    : (characterNames.get(characterId) ?? `#${characterId}`);
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
        render: (entry) => ENDPOINT_ROUTES[entry.endpointId],
      },
      {
        id: 'character',
        header: t('activityLog.columnCharacter'),
        render: (entry) => characterCell(entry.characterId, characterNames, t),
      },
      {
        id: 'time',
        header: t('activityLog.columnTime'),
        className: 'whitespace-nowrap text-text-dim',
        // Full date, not just time-of-day: a session that crosses midnight
        // otherwise makes two entries on different days read as minutes apart.
        render: (entry) => formatTimestamp(new Date(entry.timestamp), timeZone),
      },
      {
        id: 'outcome',
        header: t('activityLog.columnOutcome'),
        className: 'font-semibold',
        cellClassName: (entry) => OUTCOME_TONE[entry.outcome],
        render: (entry) => t(OUTCOME_LABEL_KEYS[entry.outcome]),
      },
    ],
    [t, characterNames, timeZone]
  );

  return (
    <Panel
      title={t('activityLog.title')}
      actions={
        <Button size="sm" onClick={handleClear} disabled={entries.length === 0}>
          {t('activityLog.clearLog')}
        </Button>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-text-dim">{t('activityLog.hint')}</p>
        {clearedConfirm && <ActionConfirmation message={t('activityLog.clearedConfirm')} />}
        {entries.length === 0 ? (
          <EmptyState title={t('activityLog.emptyTitle')} hint={t('activityLog.emptyHint')} />
        ) : (
          <DataTable
            columns={columns}
            rows={entries}
            rowKey={(entry) => entry.id}
            label={t('activityLog.title')}
            density="compact"
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
        render: (entry) => ENDPOINT_ROUTES[entry.endpointId],
      },
      {
        id: 'character',
        header: t('dataAge.columnCharacter'),
        render: (entry) => characterCell(entry.characterId, characterNames, t),
      },
      {
        id: 'updated',
        header: t('dataAge.columnUpdated'),
        className: 'whitespace-nowrap text-text-dim',
        render: (entry) => (
          <span title={formatTimestamp(new Date(entry.timestamp), timeZone)}>
            {formatAge(Date.now() - entry.timestamp, t)}
          </span>
        ),
      },
    ],
    [t, characterNames, timeZone]
  );

  return (
    <Panel title={t('dataAge.title')}>
      <div className="space-y-2">
        <p className="text-xs text-text-dim">{t('dataAge.hint')}</p>
        {rows.length === 0 ? (
          <EmptyState title={t('dataAge.emptyTitle')} hint={t('dataAge.emptyHint')} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(entry) => entry.id}
            label={t('dataAge.title')}
            density="compact"
          />
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
        <p className="text-xs text-text-dim">{t('settings.dataHint')}</p>
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
      <p className="text-xs text-text-dim">{t('settings.resetViewPrefsHint')}</p>
      <Button size="sm" onClick={() => void handleReset()}>
        {t('settings.resetViewPrefs')}
      </Button>
      {confirmed && <ActionConfirmation message={t('settings.resetViewPrefsConfirm')} />}
    </div>
  );
}

/** A labelled row of preset chips — the shape every threshold control here uses. */
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
    <div className="space-y-1.5">
      <p className="text-xs font-semibold">{label}</p>
      {hint && <p className="text-xs text-text-dim">{hint}</p>}
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
    </div>
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
 * What a page assumes when the pilot has not said otherwise. Every control
 * here defaults to exactly what the app did before it was settable, so an
 * existing pilot's numbers do not move until they ask them to.
 *
 * All of them sync (`lib/useSyncedSetting.ts`): these answer for the pilot,
 * not for the machine. The text-scale control above them deliberately does
 * not — that one answers for the screen.
 */
function DefaultsPanel() {
  const { t } = useTranslation();
  const hub = useMarketHub((state) => state.value);
  const setHub = useMarketHub((state) => state.setValue);
  const assumedMe = useAssumedMe((state) => state.value);
  const setAssumedMe = useAssumedMe((state) => state.setValue);
  const assumedTe = useAssumedTe((state) => state.value);
  const setAssumedTe = useAssumedTe((state) => state.setValue);
  const facilityDefaults = useFacilityDefaults((state) => state.value);
  const setFacilityDefaults = useFacilityDefaults((state) => state.setValue);
  const expiringHours = useExpiringWindowHours((state) => state.value);
  const setExpiringHours = useExpiringWindowHours((state) => state.setValue);
  const defaultCharacterFilter = useDefaultCharacterFilter((state) => state.value);
  const setDefaultCharacterFilter = useDefaultCharacterFilter((state) => state.setValue);
  const spExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.value);
  const setSpExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.setValue);
  const spExtractionThreshold = useSpExtractionThresholdSp((state) => state.value);
  const setSpExtractionThreshold = useSpExtractionThresholdSp((state) => state.setValue);

  // Each on its own line, never `a() && b()`: `&&` short-circuits, which would
  // make every hook after the first false one a conditional call.
  const hubHydrated = useHydratedStore(useMarketHub);
  const assumedMeHydrated = useHydratedStore(useAssumedMe);
  const assumedTeHydrated = useHydratedStore(useAssumedTe);
  const facilityHydrated = useHydratedStore(useFacilityDefaults);
  const expiringHydrated = useHydratedStore(useExpiringWindowHours);
  const defaultCharacterFilterHydrated = useHydratedStore(useDefaultCharacterFilter);
  const spExtractionEnabledHydrated = useHydratedStore(useSpExtractionMonitoringEnabled);
  const spExtractionThresholdHydrated = useHydratedStore(useSpExtractionThresholdSp);
  const ready =
    hubHydrated &&
    assumedMeHydrated &&
    assumedTeHydrated &&
    facilityHydrated &&
    expiringHydrated &&
    defaultCharacterFilterHydrated &&
    spExtractionEnabledHydrated &&
    spExtractionThresholdHydrated;

  const facilityPreset = FACILITY_PRESETS[facilityDefaults.facility];

  // Only for the picker's "This character" preview and quick-select — the
  // stored default itself keeps meaning "whichever Character I'm on" even on
  // a device with none active right now (`CharacterFilterControl` already
  // omits that quick-select when this is null).
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const characterFilterCandidates = useMemo(
    () => (allCharacters ?? []).map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [allCharacters]
  );

  // Nothing until every row holds its real value. A control that rendered its
  // default first would not merely flicker: a press landing in that window
  // writes the default over what is on disk.
  if (!ready) {
    return (
      <Panel title={t('settings.defaultsTitle')}>
        <Spinner />
      </Panel>
    );
  }

  return (
    <Panel title={t('settings.defaultsTitle')}>
      <div className="max-w-md space-y-4">
        <p className="text-xs text-text-dim">{t('settings.defaultsSyncHint')}</p>
        <div className="space-y-1.5">
          <label htmlFor="settings-hub" className="block text-xs font-semibold">
            {t('settings.tradeHubLabel')}
          </label>
          <p className="text-xs text-text-dim">{t('settings.tradeHubHint')}</p>
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
        </div>

        <div className="space-y-1.5 border-t border-line pt-3">
          <label htmlFor="settings-facility" className="block text-xs font-semibold">
            {t('settings.facilityLabel')}
          </label>
          <p className="text-xs text-text-dim">{t('settings.facilityHint')}</p>
          <Select
            value={facilityDefaults.facility}
            onValueChange={(value) =>
              void setFacilityDefaults(
                // Normalised on the way in: an NPC station fits no rigs and its
                // tax is fixed, so switching to one has to drop both rather
                // than leave a combination that cannot exist. Same rule
                // `BuildPlanDetail` applies to a plan.
                normalizeFacilityDefaults({
                  ...facilityDefaults,
                  facility: value as FacilityDefaults['facility'],
                })
              )
            }
          >
            <SelectTrigger id="settings-facility" aria-label={t('settings.facilityLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(FACILITY_PRESETS).map((preset) => (
                <SelectItem key={preset.kind} value={preset.kind}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Rig and owner-set tax only exist for a player structure. */}
          {facilityPreset.structure && (
            <div className="space-y-3 border-l-2 border-line pt-2 pl-3">
              <div role="group" aria-label={t('settings.rigLevelLabel')} className="space-y-3">
                <p className="text-xs font-semibold">{t('settings.rigLevelLabel')}</p>
                {facilityDefaults.rigFit.map((kind, slot) => (
                  <ChipRow
                    // A slot's position is its identity, not the kind fitted in it.
                    key={slot}
                    label={t('industry.rigSlotLabel', { slot: slot + 1 })}
                    options={RIG_KIND_OPTIONS}
                    selected={kind}
                    onSelect={(picked) =>
                      void setFacilityDefaults({
                        ...facilityDefaults,
                        rigFit: setRigSlot(facilityDefaults.rigFit, slot, picked),
                      })
                    }
                    labelFor={(kind) => t(rigKindLabelKey(kind))}
                  />
                ))}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="settings-facility-tax" className="block text-xs font-semibold">
                  {t('settings.facilityTaxLabel')}
                </label>
                <p className="text-xs text-text-dim">{t('settings.facilityTaxHint')}</p>
                <TextInput
                  id="settings-facility-tax"
                  type="number"
                  min={0}
                  step={0.01}
                  value={facilityDefaults.facilityTaxPct ?? ''}
                  placeholder={String(facilityPreset.defaultTaxPct)}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    const parsed = Number(raw);
                    void setFacilityDefaults({
                      ...facilityDefaults,
                      // Empty means "use the preset's own", which is what a
                      // plan with no tax of its own already does.
                      facilityTaxPct:
                        raw === '' || !Number.isFinite(parsed) || parsed < 0 ? null : parsed,
                    });
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-line pt-3">
          <label htmlFor="settings-assumed-me" className="block text-xs font-semibold">
            {t('settings.assumedMeLabel')}
          </label>
          <p className="text-xs text-text-dim">{t('settings.assumedMeHint')}</p>
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
          />
        </div>

        {/*
          Beside its ME twin rather than merged with it: the two answer
          different questions (material cost, job time), and TE's range is
          0..20 where ME's is 0..10 (issue #634).
        */}
        <div className="space-y-1.5 border-t border-line pt-3">
          <label htmlFor="settings-assumed-te" className="block text-xs font-semibold">
            {t('settings.assumedTeLabel')}
          </label>
          <p className="text-xs text-text-dim">{t('settings.assumedTeHint')}</p>
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
          />
        </div>

        <div className="border-t border-line pt-3">
          <ChipRow
            label={t('settings.piExpiringLabel')}
            hint={t('settings.piExpiringHint')}
            options={EXPIRING_WINDOW_HOUR_OPTIONS}
            selected={expiringHours}
            onSelect={(hours) => void setExpiringHours(hours)}
            labelFor={(hours) => t('settings.hours', { count: hours })}
          />
        </div>

        <div className="space-y-1.5 border-t border-line pt-3">
          <span className="block text-xs font-semibold">
            {t('settings.defaultCharacterFilterLabel')}
          </span>
          <p className="text-xs text-text-dim">{t('settings.defaultCharacterFilterHint')}</p>
          <CharacterFilterControl
            characters={characterFilterCandidates}
            activeCharacterId={activeCharacterId}
            value={fromStoredCharacterFilterValue(defaultCharacterFilter)}
            onChange={(next) => void setDefaultCharacterFilter(toStoredCharacterFilterValue(next))}
          />
        </div>

        <div className="space-y-1.5 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={spExtractionEnabled}
              onChange={() => void setSpExtractionEnabled(!spExtractionEnabled)}
              className="size-4 shrink-0 cursor-pointer accent-accent"
            />
            {t('settings.spExtractionEnabledLabel')}
          </label>
          <p className="text-xs text-text-dim">{t('settings.spExtractionEnabledHint')}</p>
          {spExtractionEnabled && (
            <div className="ml-6 space-y-1.5">
              <label htmlFor="settings-sp-extraction-threshold" className="block text-xs">
                {t('settings.spExtractionThresholdLabel')}
              </label>
              <p className="text-xs text-text-dim">{t('settings.spExtractionThresholdHint')}</p>
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
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * The corp roster's inactivity policy. Rendered only for a Character who can
 * actually reach the corp section — a setting for a page you cannot open is
 * noise, and this follows the same hide-rather-than-lock rule the corp nav
 * itself uses.
 */
function CorpDefaultsPanel() {
  const { t } = useTranslation();
  const access = useCorpAccess();
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const setDarkAfterDays = useDarkThreshold((state) => state.setValue);
  const hydrated = useHydratedStore(useDarkThreshold);

  if (access.state !== 'ready' || !hydrated) return null;

  return (
    <Panel title={t('settings.corpDefaultsTitle')}>
      <div className="max-w-md space-y-4">
        <p className="text-xs text-text-dim">{t('settings.defaultsSyncHint')}</p>
        <ChipRow
          label={t('settings.darkThresholdLabel')}
          hint={t('settings.darkThresholdHint')}
          options={DARK_AFTER_DAY_OPTIONS}
          selected={darkAfterDays}
          onSelect={(days) => void setDarkAfterDays(days)}
          labelFor={(days) => t('settings.days', { count: days })}
        />
      </div>
    </Panel>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const setScale = useFontScale((state) => state.setValue);
  const timeFormat = useTimeFormat((state) => state.value);
  const setTimeFormat = useTimeFormat((state) => state.setValue);
  const { hash } = useLocation();
  // Resolved in the initializer, not an effect, so the first paint is already
  // the tab the link asked for — an effect would render General first and swap
  // it out underneath the reader.
  const [tab, setTab] = useState<SettingsTab>(() => TAB_FOR_HASH[hash.slice(1)] ?? 'general');

  // A *later* hash change (a second click on the same link from elsewhere in
  // the app) has to move the tab too. Adjusted during render rather than in an
  // effect, the same pattern `NotificationsPanel`'s threshold field uses:
  // this is deriving state from a prop, not synchronizing with an external
  // system, and an effect would render the wrong tab first.
  const [prevHash, setPrevHash] = useState(hash);
  if (hash !== prevHash) {
    setPrevHash(hash);
    const targetTab = TAB_FOR_HASH[hash.slice(1)];
    if (targetTab !== undefined) setTab(targetTab);
  }

  // react-router does not act on a URL hash by itself, so a deep link from
  // elsewhere in the app would land at the top of a long page with no sign of
  // what it came for. Selecting the tab above is the whole answer for a
  // section that *is* a tab; an anchor within one still needs scrolling to,
  // which is a DOM call and so genuinely belongs in an effect.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash, tab]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('settings.title')} />
      <Tabs
        label={t('settings.title')}
        value={tab}
        onChange={(id) => setTab(id as SettingsTab)}
        tabs={[
          { id: 'general', label: t('settings.tabs.general') },
          { id: 'notifications', label: t('settings.tabs.notifications') },
          { id: 'dataAge', label: t('settings.tabs.dataAge') },
          { id: 'activity', label: t('settings.tabs.activity') },
          { id: 'faq', label: t('settings.tabs.faq') },
        ]}
      />
      {tab === 'general' && (
        <div className="space-y-4">
          <Panel title={t('settings.displayTitle')}>
            <div className="space-y-2">
              <p className="text-xs text-text-dim">{t('settings.fontScaleHint')}</p>
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
              {/*
                EVE runs on UTC and so does every timer other players quote,
                which is why one column already rendered it before this was
                settable. The Calendar grids are deliberately excluded — they
                bucket events into local-day cells, so converting only the
                rendered string would file a late-evening event under the wrong
                day.
              */}
              <div className="border-t border-line pt-3">
                <ChipRow
                  label={t('settings.timeFormatLabel')}
                  hint={t('settings.timeFormatHint')}
                  options={TIME_FORMATS}
                  selected={timeFormat}
                  onSelect={(format) => void setTimeFormat(format)}
                  labelFor={(format) => t(`settings.timeFormat.${format}`)}
                />
              </div>
            </div>
          </Panel>
          <DefaultsPanel />
          <CorpDefaultsPanel />
          <Panel title={t('shortcuts.title')}>
            {/* `max-w-md` inside the full-width page frame: a description and its
                key are a pair, and at the page's own width `justify-between` threw
                them a thousand pixels apart with nothing in between. The page
                keeps one container width app-wide (§3); content that a wide row
                would make unreadable constrains itself, here. */}
            <dl className="max-w-md divide-y divide-line text-xs">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.id} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-text-dim">{t(shortcut.descriptionKey)}</dt>
                  <dd>
                    <kbd className="rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[0.6875rem] text-text">
                      {shortcut.displayKey}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
          {/*
            Anchor for anything that needs to send a Character here to grant corp
            access — with corp UI hidden rather than locked, this row is the only
            way in for a Character that dismissed the one-time prompt.
          */}
          <div id="corp-access" className="scroll-mt-4">
            <CorpAccessPanel />
          </div>
          <DataPanel />
        </div>
      )}
      {/*
        The Overview feed's "Settings" link targets `#notifications`, which
        `TAB_FOR_HASH` turns into this tab. The id stays on the wrapper so the
        scroll in the effect above still has something to find.
      */}
      {tab === 'notifications' && (
        <div id="notifications" className="scroll-mt-4">
          <NotificationsPanel />
        </div>
      )}
      {tab === 'dataAge' && <DataAgePanel />}
      {tab === 'activity' && <ActivityLogPanel />}
      {/* Same `id` wrapper as `#notifications` above, so `/settings#faq` both
          selects the tab and has something for the scroll effect to find. */}
      {tab === 'faq' && (
        <div id="faq" className="scroll-mt-4">
          <FaqPanel />
        </div>
      )}
    </div>
  );
}
