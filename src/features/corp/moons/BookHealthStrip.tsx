import { useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { useTranslation } from 'react-i18next';
import { Button, InfoTooltip } from '@/components/ui';
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
  // ADR 0025: a schedule that stopped is a warning that says why, because the book
  // quietly goes back to being as fresh as the last officer visit.
  // Characters two groups claim: the earlier group was kept (never last-writer-wins).
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
  // #6207: a source the last sync could not read (donations, Extractions) shows here, not only
  // in Settings. With both a running schedule and this visit's sync, a source is unread only when
  // neither read it: the schedule covers an officer without wallet roles, and a newer visit that
  // read it clears an older scheduled miss.
  const scheduledRun = scheduled?.status === 'active' ? scheduled.lastRun : undefined;
  const scheduledMissing =
    scheduledRun?.outcome === 'synced' ? (scheduledRun.missing ?? []) : undefined;
  const visitMissing =
    sync.run.phase === 'done' && sync.run.outcome.kind === 'synced'
      ? (sync.run.outcome.missing ?? [])
      : undefined;
  // The chunk ore is flagged only for the automatic sync (its holder lacks Station_Manager): a
  // visit by an officer without the role is not a problem the book has.
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
  // Counted from the ledger rows, so only on a tab that reads them (the Moon owners tab does not).
  if (data.parts.has('observed') && view.unrated.length > 0) {
    items.push({
      id: 'unrated',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.unrated', { count: view.unrated.length }),
      detail: <p>{t('corpTaxBook.moons.health.unratedDetail')}</p>,
    });
  }
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
    });
  } else if (status.kind === 'never') {
    items.push({
      id: 'sync',
      tone: 'warning',
      title: t('corpTaxBook.moons.health.never'),
      detail: <p>{t('corpTaxBook.moons.health.neverDetail')}</p>,
    });
  } else if (status.kind === 'stale') {
    // A fresh sync says nothing here: its age sits beside the page title.
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
    // Officers decide a merge the sync would not make: too large, or a character two groups claim.
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
  // The member hold of a new book (72 hours): officers see when members start to see it.
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
  // Amber and "needs attention" only when a check fails; otherwise a plain status line.
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
