import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { CachedResult } from '../data';
import { isQueuePaused } from '@/engine/skills/queueStatus';
import type { SkillCatalog } from '../skillMap';
import { CURRENT_QUEUE_HASH } from './currentQueueHash';
import { NowTrainingCard } from './NowTrainingCard';
import { QueueFinishedRows, QueueLooseRows, QueuePeriodGroup } from './QueuePeriodGroup';
import type { QueueView } from './queueView';

interface CurrentQueuePanelProps {
  result: CachedResult<SkillQueueEntry[]> | null | undefined;
  view: QueueView;
  catalog: SkillCatalog;
  nowMs: number;
}

const SETTLE_MS = 3_000;

export function CurrentQueuePanel({ result, view, catalog, nowMs }: CurrentQueuePanelProps) {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (window.location.hash !== CURRENT_QUEUE_HASH || !section) return;
    const bring = () => section.scrollIntoView?.({ block: 'start' });
    bring();
    headingRef.current?.focus({ preventScroll: true });
    const container = section.parentElement;
    if (typeof ResizeObserver === 'undefined' || !container) return;
    const observer = new ResizeObserver(bring);
    observer.observe(container);
    const PILOT_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const type of PILOT_INPUT) window.removeEventListener(type, stop);
    };
    const timer = window.setTimeout(stop, SETTLE_MS);
    for (const type of PILOT_INPUT) window.addEventListener(type, stop, { passive: true });
    return stop;
  }, []);

  const empty =
    !view.hero &&
    view.groups.length === 0 &&
    view.finished.length === 0 &&
    view.undated.length === 0;
  const paused = isQueuePaused(result?.data ?? []);
  const next = view.groups[0]?.rows[0];

  return (
    <section ref={sectionRef} aria-labelledby="current-queue-heading" className="space-y-4">
      <h2 ref={headingRef} id="current-queue-heading" tabIndex={-1} className="sr-only">
        {t('plans.currentQueueTitle')}
      </h2>
      {result === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : empty ? (
        <EmptyState title={t('plans.currentQueueEmpty')} className="py-4" />
      ) : (
        <>
          <QueueFinishedRows rows={view.finished} catalog={catalog} />
          {paused && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('plans.queuePausedNote')}</p>
          )}
          {view.hero && (
            <NowTrainingCard row={view.hero} next={next} catalog={catalog} nowMs={nowMs} />
          )}
          {view.groups.map((group) => (
            <QueuePeriodGroup key={group.id} group={group} catalog={catalog} nowMs={nowMs} />
          ))}
          <QueueLooseRows
            title={t('plans.queuePausedGroup')}
            rows={view.undated}
            catalog={catalog}
            nowMs={nowMs}
          />
        </>
      )}
    </section>
  );
}
