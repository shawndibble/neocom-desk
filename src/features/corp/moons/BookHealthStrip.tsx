import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { formatAge } from '@/lib/age';
import { AttentionStrip, type AttentionItem } from '@/features/miningTax/AttentionStrip';
import { useBook } from './useBook';
import { shortDate } from './moonsFormat';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';

/**
 * D9: how fresh the book is and what is missing from it. A gap is a warning so
 * it leads: the page never reads as complete when it is not. Info rows change
 * no figure.
 */
export function BookHealthStrip({ sync }: { sync: CorpTaxBookSync }) {
  const { t } = useTranslation();
  const { view, names, canEdit } = useBook();
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
  if (status.kind === 'never') {
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
        { age: formatAge(status.ageMs, t), name: status.byName }
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
  }
  if (sync.run.phase === 'done' && sync.run.outcome.kind === 'skipped') {
    items.push({
      id: 'skipped',
      tone: 'info',
      title: t(`corpTaxBook.moons.health.skipped.${sync.run.outcome.reason}`),
    });
  }
  return <AttentionStrip items={items} />;
}
