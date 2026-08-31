import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  CharacterAvatar,
  DataAgeBadge,
  EmptyState,
  Panel,
  Spinner,
  StatChip,
  type StatChipTone,
} from '@/components/ui';
import { loadRosterSnapshot } from '@/features/character/roster';
import { deriveQueueHealth, type QueueHealthState } from './queueHealthDerivation';

const STATE_TONE: Record<QueueHealthState, StatChipTone> = {
  training: 'success',
  endingSoon: 'warning',
  paused: 'danger',
  idle: 'default',
  unknown: 'default',
};

interface Row {
  characterId: number;
  name: string;
  state: QueueHealthState;
  /** When this character's cached queue was last fetched; null with `state: 'unknown'`. */
  fetchedAt: Date | null;
}

/**
 * Roster-wide skill-queue health, v1: reads whatever `loadRosterSnapshot`
 * already has cached — no live ESI call, so a character whose queue was
 * never fetched reads as `unknown` rather than a misleading `idle`.
 */
export function QueueHealth() {
  const { t } = useTranslation();
  const characterCount = useLiveQuery(() => db.characters.count());
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const now = Date.now();
      const roster = await loadRosterSnapshot();
      if (cancelled) return;
      setRows(
        roster.map((entry) => ({
          characterId: entry.characterId,
          name: entry.name,
          state: deriveQueueHealth(entry.queue?.data, now),
          fetchedAt: entry.queue?.fetchedAt ?? null,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [characterCount]);

  if (rows === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-widest uppercase">
          {t('queueHealth.title')}
        </h1>
      </header>

      {rows.length === 0 ? (
        <EmptyState title={t('characters.emptyTitle')} hint={t('characters.emptyHint')} />
      ) : (
        <Panel title={t('queueHealth.title')}>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.characterId} className="flex items-center gap-3 py-2">
                <CharacterAvatar characterId={row.characterId} size="sm" loading="lazy" />
                <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                {row.fetchedAt && <DataAgeBadge date={row.fetchedAt} />}
                <StatChip
                  label={t('queueHealth.state')}
                  tone={STATE_TONE[row.state]}
                  value={t(`queueHealth.states.${row.state}`)}
                />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
