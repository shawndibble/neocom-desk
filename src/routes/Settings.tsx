import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  Panel,
  type DataTableColumn,
} from '@/components/ui';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { SHORTCUTS } from '@/lib/shortcuts';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { db } from '@/db';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import { useActivityLog, type ActivityLogEntry } from '@/stores/activityLog';
import type { ActivityOutcome } from '@/esi/activityLog';

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

function ActivityLogPanel() {
  const { t } = useTranslation();
  const entries = useActivityLog((state) => state.entries);
  const characters = useLiveQuery(() => db.characters.toArray());
  // Empty until the live query resolves — a lookup miss reads as "unknown", not "no characters".
  const characterNames = useMemo(
    () => new Map(characters?.map((c) => [c.characterId, c.name]) ?? []),
    [characters]
  );

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
        render: (entry) => new Date(entry.timestamp).toLocaleTimeString(),
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
    <Panel title={t('activityLog.title')}>
      <div className="space-y-2">
        <p className="text-xs text-text-dim">{t('activityLog.hint')}</p>
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

export function Settings() {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const setScale = useFontScale((state) => state.setValue);
  const { hash } = useLocation();

  // react-router does not act on a URL hash by itself, so a deep link from
  // elsewhere in the app (the Overview feed's "Settings" link) would land at
  // the top of a long page with no sign of what it came for.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={t('settings.title')} />
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
      <ActivityLogPanel />
    </div>
  );
}
