import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
        <dl className="divide-y divide-line text-xs">
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
      <NotificationsPanel />
      <ActivityLogPanel />
    </div>
  );
}
