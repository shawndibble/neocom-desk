import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { formatAge } from '@/lib/age';
import { AttentionStrip, type AttentionItem } from '@/features/miningTax/AttentionStrip';
import { useBook } from './useBook';
import { shortDate, shortDateTime } from './moonsFormat';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';

/**
 * D9: how fresh the book is and what is missing from it. A gap is a warning so
 * it leads: the page never reads as complete when it is not. Info rows change
 * no figure.
 */
export function BookHealthStrip({ sync }: { sync: CorpTaxBookSync }) {
  const { t } = useTranslation();
  const { view, names, canEdit, data, settings } = useBook();
  const [openedAt] = useState(() => Date.now());
  const { status } = sync;
  const items: AttentionItem[] = [];
  const syncing = sync.run.phase === 'syncing';

  if (status.kind !== 'never') {
    for (const gap of status.gaps) {
      items.push({
        id: `gap-${gap.structureId}-${gap.from}`,
        tone: 'warning',
        title: t('corpTaxBook.moons.health.gap', {
          from: shortDate(gap.from),
          to: shortDate(gap.to),
          refinery: names.refinery(gap.structureId),
        }),
        detail: <p>{t('corpTaxBook.moons.health.gapDetail')}</p>,
      });
    }
  }
  // ADR 0025: a schedule that stopped is a warning that says why, because the book
  // quietly goes back to being as fresh as the last officer visit.
  const scheduled = data.scheduledSync;
  if (scheduled?.status === 'stopped') {
    items.push({
      id: 'scheduledStopped',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.scheduledStopped', {
        reason: t(`corpTaxBook.moons.autoSync.stopped.${scheduled.stoppedReason ?? 'unknown'}`, {
          name: scheduled.characterName,
        }),
      }),
      detail: <p>{t('corpTaxBook.moons.health.scheduledStoppedDetail')}</p>,
    });
  }
  if (view.unrated.length > 0) {
    items.push({
      id: 'unrated',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.unrated', { count: view.unrated.length }),
      detail: <p>{t('corpTaxBook.moons.health.unratedDetail')}</p>,
    });
  }
  const syncAction = canEdit ? (
    <Button size="sm" onClick={() => void sync.sync()} disabled={syncing}>
      {syncing ? t('corpTaxBook.moons.syncing') : t('corpTaxBook.moons.syncNow')}
    </Button>
  ) : undefined;
  // A visit that found no refinery to read is not "Synced": say what the book needs instead.
  // A book that collects for moon owners needs none of its own (decision 20261020-205040).
  const noRefineries =
    (data.feeders ?? []).length === 0 &&
    sync.run.phase === 'done' &&
    sync.run.outcome.kind === 'synced' &&
    sync.run.outcome.noRefineries;
  if (noRefineries) {
    items.push({
      id: 'sync',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.noRefineries'),
      detail: <p>{t('corpTaxBook.moons.health.noRefineriesDetail')}</p>,
      action: syncAction,
    });
  } else if (status.kind === 'never') {
    items.push({
      id: 'sync',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.never'),
      detail: <p>{t('corpTaxBook.moons.health.neverDetail')}</p>,
      action: syncAction,
    });
  } else {
    items.push({
      id: 'sync',
      tone: status.kind === 'stale' ? 'warning' : 'info',
      title: t(
        status.kind === 'stale'
          ? 'corpTaxBook.moons.health.stale'
          : 'corpTaxBook.moons.health.synced',
        {
          age: formatAge(status.ageMs, t),
          name: status.scheduled
            ? t('corpTaxBook.moons.scheduledBy', { name: status.byName })
            : status.byName,
        }
      ),
      detail: (
        <p>
          {view.billableThrough
            ? t('corpTaxBook.moons.health.billableThrough', {
                date: shortDate(view.billableThrough),
                hours: view.input.graceHours,
              })
            : t('corpTaxBook.moons.health.noBillable')}
        </p>
      ),
      action: syncAction,
    });
  }
  if (sync.run.phase === 'failed') {
    items.push({
      id: 'failed',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.failed', { message: sync.run.message }),
    });
  }
  if (sync.run.phase === 'done' && sync.run.outcome.kind === 'synced') {
    if (sync.run.outcome.autoGroupError) {
      items.push({
        id: 'autoGroupFailed',
        tone: 'warning',
        title: t('corpTaxBook.moons.health.autoGroupFailed', {
          message: sync.run.outcome.autoGroupError,
        }),
      });
    }
    if (sync.run.outcome.reassignError) {
      items.push({
        id: 'reassignFailed',
        tone: 'warning',
        title: t('corpTaxBook.moons.health.reassignFailed', {
          message: sync.run.outcome.reassignError,
        }),
      });
    }
  }
  if (sync.run.phase === 'done' && sync.run.outcome.kind === 'skipped') {
    items.push({
      id: 'skipped',
      tone: 'info',
      title: t(`corpTaxBook.moons.health.skipped.${sync.run.outcome.reason}`),
    });
  }
  // The member hold of a new book (72 hours): officers see when members start to see it.
  const seeFrom = settings?.membersSeeFrom;
  const held = seeFrom !== undefined && openedAt < seeFrom;
  return (
    <>
      {held && (
        <p className="text-xs text-text-dim" role="note">
          {t('corpTaxBook.moons.health.hiddenFromMembers', {
            date: shortDateTime(new Date(seeFrom).toISOString()),
          })}
        </p>
      )}
      <AttentionStrip items={items} />
    </>
  );
}
