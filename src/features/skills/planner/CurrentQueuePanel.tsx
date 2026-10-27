import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { CachedResult } from '../data';
import { isQueuePaused } from '@/engine/skills/queueStatus';
import type { SkillCatalog } from '../skillMap';
import { CURRENT_QUEUE_HASH } from './currentQueueHash';
import { NowTrainingCard } from './NowTrainingCard';
import { QueueLooseRows, QueuePeriodGroup } from './QueuePeriodGroup';
import type { QueueView } from './queueView';

interface CurrentQueuePanelProps {
  /** `undefined` while the first read is in flight; `null` when ESI had nothing. */
  result: CachedResult<SkillQueueEntry[]> | null | undefined;
  view: QueueView;
  catalog: SkillCatalog;
  nowMs: number;
}

/** How long a `#current-queue` landing keeps the section in view while the page above it settles. */
const SETTLE_MS = 3_000;

/**
 * The character's actual in-game skill queue (not a Skill Plan): "what am I
 * training right now, and for how long" — the level training now as a card,
 * then everything behind it grouped by when it finishes.
 *
 * Times come from ESI's `finish_date`, never from a local recompute. ESI
 * knows the character's real current SP, so its dates are exact where a
 * schedule rebuilt from attributes would only estimate — and showing both
 * would put two disagreeing numbers on one screen.
 */
export function CurrentQueuePanel({ result, view, catalog, nowMs }: CurrentQueuePanelProps) {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The section mounts only once the skill catalogue has loaded, long after
  // the browser's own hash jump would have looked for it, and below the rail
  // on a phone; so it brings itself into view. Window, not the router: the
  // section is also rendered outside one.
  useEffect(() => {
    const section = sectionRef.current;
    if (window.location.hash !== CURRENT_QUEUE_HASH || !section) return;
    const bring = () => section.scrollIntoView?.({ block: 'start' });
    bring();
    headingRef.current?.focus({ preventScroll: true });
    // The plan card above is still costing its plan and can grow, pushing the
    // section back down: follow it until the pilot moves or the page settles.
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
          {view.finished.length > 0 && (
            // ESI keeps finished entries until the character next logs in, and
            // says /skills is wrong until then. Surfacing them is the fix it
            // documents, not a workaround.
            <p className="text-[0.6875rem] text-success uppercase">
              {t('plans.queueCompletedNote', { count: view.finished.length })}
            </p>
          )}
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
            title={t('plans.queueFinishedGroup')}
            rows={view.finished}
            catalog={catalog}
            nowMs={nowMs}
          />
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
