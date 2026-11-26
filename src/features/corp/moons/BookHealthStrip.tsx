import { useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { useTranslation } from 'react-i18next';
import { Button, InfoTooltip } from '@/components/ui';
import { formatAge } from '@/lib/age';
import { AttentionStrip, type AttentionItem } from '@/features/miningTax/AttentionStrip';
import { useBook } from './useBook';
import { shortDate, shortDateTime } from './moonsFormat';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';

export function BookHealthStrip({ sync }: { sync: CorpTaxBookSync }) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { view, names, canEdit, data, settings, verdict, edit } = useBook();
  const [openedAt] = useState(() => Date.now());
  const { status } = sync;
  const items: AttentionItem[] = [];
  const [showing, setShowing] = useState(false);
  const [shown, setShown] = useState(false);

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
  for (const c of data.groupConflicts ?? []) {
    items.push({
      id: `conflict-${c.characterId}`,
      tone: 'warning',
      title: t('corpTaxBook.moons.grouping.conflictItem', {
        name: names.character(c.characterId),
        groups: c.minerIds.join(', '),
      }),
    });
  }
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
  const scheduledRun = scheduled?.status === 'active' ? scheduled.lastRun : undefined;
  const scheduledMissing =
    scheduledRun?.outcome === 'synced' ? (scheduledRun.missing ?? []) : undefined;
  const visitMissing =
    sync.run.phase === 'done' && sync.run.outcome.kind === 'synced'
      ? (sync.run.outcome.missing ?? [])
      : undefined;
  const unread =
    scheduledMissing && visitMissing
      ? scheduledMissing.filter((m) => visitMissing.includes(m))
      : (scheduledMissing ?? visitMissing?.filter((m) => m !== 'ore') ?? []);
  if (unread.length > 0) {
    items.push({
      id: 'couldNotRead',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.couldNotRead', {
        sources: unread.map((m) => t(`corpTaxBook.moons.autoSync.missing.${m}`)).join(', '),
      }),
      detail: (
        <>
          <p>{t('corpTaxBook.moons.health.couldNotReadDetail')}</p>
          {unread.includes('ore') && <p>{t('corpTaxBook.moons.health.couldNotReadOre')}</p>}
        </>
      ),
    });
  }
  if (data.parts.has('observed') && view.unrated.length > 0) {
    items.push({
      id: 'unrated',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.unrated', { count: view.unrated.length }),
      detail: <p>{t('corpTaxBook.moons.health.unratedDetail')}</p>,
    });
  }
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
    });
  } else if (status.kind === 'never') {
    items.push({
      id: 'sync',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.never'),
      detail: <p>{t('corpTaxBook.moons.health.neverDetail')}</p>,
    });
  } else if (status.kind === 'stale') {
    items.push({
      id: 'sync',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.stale', {
        age: formatAge(status.ageMs, t),
        name: status.scheduled
          ? t('corpTaxBook.moons.scheduledBy', { name: status.byName })
          : status.byName,
      }),
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
    for (const p of sync.run.outcome.groupPrompts ?? []) {
      items.push({
        id: `merge-${p.reason}-${p.minerIds.join('+')}`,
        tone: 'warning',
        title: t(
          p.reason === 'too-large'
            ? 'corpTaxBook.moons.grouping.mergeTooLarge'
            : 'corpTaxBook.moons.grouping.mergeConflict',
          { names: p.characterIds.map((id) => names.character(id)).join(', ') }
        ),
      });
    }
    if ((sync.run.outcome.groupFlagged ?? []).length > 0) {
      items.push({
        id: 'groupFlagged',
        tone: 'info',
        title: t('corpTaxBook.moons.grouping.flagged', {
          names: (sync.run.outcome.groupFlagged ?? []).map((id) => names.character(id)).join(', '),
        }),
      });
    }
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
  const seeFrom = settings?.membersSeeFrom;
  const held = !shown && seeFrom !== undefined && openedAt < seeFrom;
  const showToMembers = async () => {
    setShowing(true);
    try {
      await edit({ action: 'updateSettings', patch: { showToMembers: true } });
      setShown(true);
    } finally {
      setShowing(false);
    }
  };
  const plain = items.every((item) => item.tone === 'info');
  return (
    <>
      {held && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-dim" role="note">
          {t('corpTaxBook.moons.health.hiddenFromMembers', {
            date: shortDateTime(seeFrom, zone),
          })}
          <InfoTooltip
            label={t('common.aboutLabel', {
              label: t('corpTaxBook.moons.health.hiddenLabel'),
            })}
            content={t('corpTaxBook.moons.health.hiddenHint')}
          />
          {verdict.isDirector && canEdit && (
            <Button
              size="sm"
              variant="ghost"
              loading={showing}
              onClick={() => void showToMembers()}
            >
              {t('corpTaxBook.moons.health.showToMembers')}
            </Button>
          )}
        </p>
      )}
      {items.length === 0 ? null : plain ? (
        <div className="space-y-1 text-xs text-text-dim" role="status">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{item.title}</span>
              {item.detail}
              {item.action}
            </div>
          ))}
        </div>
      ) : (
        <AttentionStrip items={items} />
      )}
    </>
  );
}
