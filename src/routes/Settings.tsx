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
  Tabs,
  type DataTableColumn,
} from '@/components/ui';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { formatAge } from '@/lib/age';
import { SHORTCUTS } from '@/lib/shortcuts';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { CorpAccessPanel } from '@/features/corp/CorpAccessPanel';
import { db } from '@/db';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import { useActivityLog, type ActivityLogEntry } from '@/stores/activityLog';
import type { ActivityOutcome } from '@/esi/activityLog';

type SettingsTab = 'general' | 'dataAge' | 'activity';

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

function ActivityLogPanel() {
  const { t } = useTranslation();
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
        render: (entry) =>
          entry.characterId === undefined
            ? t('activityLog.publicCall')
            : (characterNames.get(entry.characterId) ?? `#${entry.characterId}`),
      },
      {
        id: 'time',
        header: t('activityLog.columnTime'),
        className: 'whitespace-nowrap text-text-dim',
        // Full date, not just time-of-day: a session that crosses midnight
        // otherwise makes two entries on different days read as minutes apart.
        render: (entry) => new Date(entry.timestamp).toLocaleString(),
      },
      {
        id: 'outcome',
        header: t('activityLog.columnOutcome'),
        className: 'font-semibold',
        cellClassName: (entry) => OUTCOME_TONE[entry.outcome],
        render: (entry) => t(OUTCOME_LABEL_KEYS[entry.outcome]),
      },
    ],
    [t, characterNames]
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
        render: (entry) =>
          entry.characterId === undefined
            ? t('activityLog.publicCall')
            : (characterNames.get(entry.characterId) ?? `#${entry.characterId}`),
      },
      {
        id: 'updated',
        header: t('dataAge.columnUpdated'),
        className: 'whitespace-nowrap text-text-dim',
        render: (entry) => (
          <span title={new Date(entry.timestamp).toLocaleString()}>
            {formatAge(Date.now() - entry.timestamp, t)}
          </span>
        ),
      },
    ],
    [t, characterNames]
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
      </div>
    </Panel>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const setScale = useFontScale((state) => state.setValue);
  const { hash } = useLocation();
  const [tab, setTab] = useState<SettingsTab>('general');

  // react-router does not act on a URL hash by itself, so a deep link from
  // elsewhere in the app (the Overview feed's "Settings" link) would land at
  // the top of a long page with no sign of what it came for. Both anchors
  // this targets live in the General tab, which is already the default.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('settings.title')} />
      <Tabs
        label={t('settings.title')}
        value={tab}
        onChange={(id) => setTab(id as SettingsTab)}
        tabs={[
          { id: 'general', label: t('settings.tabs.general') },
          { id: 'dataAge', label: t('settings.tabs.dataAge') },
          { id: 'activity', label: t('settings.tabs.activity') },
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
            </div>
          </Panel>
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
            Anchor for the Overview feed's "Settings" link. Scrolled to by the
            effect above — react-router does not act on a hash by itself.
          */}
          <div id="notifications" className="scroll-mt-4">
            <NotificationsPanel />
          </div>
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
      {tab === 'dataAge' && <DataAgePanel />}
      {tab === 'activity' && <ActivityLogPanel />}
    </div>
  );
}
