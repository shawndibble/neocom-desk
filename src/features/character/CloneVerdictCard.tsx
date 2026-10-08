import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { AttributeName } from '@/engine/types';
import type { VerdictSegment } from '@/engine/cloneVerdict';
import { useViewRoute } from '@/features/travel/useViewRoute';
import { formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';

/** What the card shows: a verdict, or one line saying why there is none. */
export type CloneVerdictCardState =
  | { kind: 'note'; message: string }
  | {
      kind: 'stay';
      stay: VerdictSegment[];
      closest: { label: string; extraSeconds: number } | null;
    }
  | {
      kind: 'jump';
      label: string;
      savedSeconds: number;
      attributes: AttributeName[];
      stay: VerdictSegment[];
      best: VerdictSegment[];
      cooldownReadyAt: Date | null;
      route: { locationId: number; placeName: string; jumps: number };
    };

const SEGMENT_TONES = ['bg-accent', 'bg-accent/65', 'bg-accent/40', 'bg-accent/25'];

function QueueBar({
  label,
  segments,
  scale,
  names,
}: {
  label: string;
  segments: readonly VerdictSegment[];
  /** Seconds the full bar width stands for: shared, so two bars compare by eye. */
  scale: number;
  names: ReadonlyMap<number, string>;
}) {
  const total = segments.reduce((sum, s) => sum + s.seconds, 0);
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap justify-between gap-x-2 text-xs text-text-dim">
        <span>{label}</span>
        <span className="tabular-nums">{formatDuration(total)}</span>
      </p>
      <div
        role="img"
        aria-label={`${label}: ${formatDuration(total)}`}
        className="flex h-3 overflow-hidden rounded-xs bg-line"
      >
        {segments.map((s, i) => (
          <div
            key={`${s.skillTypeID}-${i}`}
            title={`${names.get(s.skillTypeID) ?? `Type #${s.skillTypeID}`}: ${formatDuration(s.seconds)}`}
            className={`${SEGMENT_TONES[i % SEGMENT_TONES.length]} border-r border-panel last:border-r-0`}
            style={{ width: `${scale > 0 ? (s.seconds / scale) * 100 : 0}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function RouteButton({
  locationId,
  placeName,
  jumps,
}: {
  locationId: number;
  placeName: string;
  jumps: number;
}) {
  const { t } = useTranslation();
  const { resolving, failed, view } = useViewRoute(locationId);
  return (
    <div className="space-y-1">
      <Button variant="primary" className="w-full md:w-auto" disabled={resolving} onClick={view}>
        {t('clones.verdict.route', { place: placeName, count: jumps })}
      </Button>
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t('travel.waypoints.viewRouteUnavailable')}
        </p>
      )}
    </div>
  );
}

/** Above the clone list: which clone is best for the active queue, and whether to jump. */
export function CloneVerdictCard({
  state,
  names,
  timeZone,
}: {
  state: CloneVerdictCardState;
  names: ReadonlyMap<number, string>;
  timeZone: 'UTC' | undefined;
}) {
  const { t } = useTranslation();
  if (state.kind === 'note') {
    return (
      <section
        aria-label={t('clones.verdict.title')}
        className="border-b border-line px-3 py-2 text-sm text-text-dim"
      >
        {state.message}
      </section>
    );
  }

  const stay = state.stay;
  const best = state.kind === 'jump' ? state.best : null;
  const sum = (xs: readonly VerdictSegment[]) => xs.reduce((a, s) => a + s.seconds, 0);
  const scale = Math.max(sum(stay), best ? sum(best) : 0);
  const legend = stay.map((s) => names.get(s.skillTypeID) ?? `Type #${s.skillTypeID}`);

  return (
    <section
      aria-label={t('clones.verdict.title')}
      className="space-y-3 border-b border-line px-3 py-3 text-sm"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="space-y-1">
          <h3
            className={`text-[0.6875rem] font-semibold tracking-widest uppercase ${
              state.kind === 'jump' ? 'text-accent' : 'text-success'
            }`}
          >
            {state.kind === 'jump' ? t('clones.verdict.jumpTitle') : t('clones.verdict.stayTitle')}
          </h3>
          {state.kind === 'jump' ? (
            <>
              <p className="font-semibold [overflow-wrap:anywhere]">
                {t('clones.verdict.jumpHeadline', {
                  clone: state.label,
                  duration: formatDuration(state.savedSeconds),
                })}
              </p>
              {state.attributes.length > 0 && (
                <p className="text-text-dim">
                  {t('clones.verdict.jumpReason', {
                    attributes: state.attributes
                      .map((a) => t(`clones.verdict.attribute.${a}`))
                      .join(', '),
                  })}
                </p>
              )}
              {state.cooldownReadyAt && (
                <p className="text-warning">
                  {t('clones.verdict.jumpCooldown', {
                    date: formatTimestamp(state.cooldownReadyAt, timeZone),
                  })}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold">{t('clones.verdict.stayHeadline')}</p>
              <p className="text-text-dim [overflow-wrap:anywhere]">
                {state.closest
                  ? t('clones.verdict.stayClosest', {
                      clone: state.closest.label,
                      duration: formatDuration(state.closest.extraSeconds),
                    })
                  : t('clones.verdict.stayAlone')}
              </p>
            </>
          )}
        </div>
        {state.kind === 'jump' && <RouteButton {...state.route} />}
      </div>
      <div className="space-y-2">
        <QueueBar label={t('clones.verdict.barStay')} segments={stay} scale={scale} names={names} />
        {best && (
          <QueueBar
            label={t('clones.verdict.barBest')}
            segments={best}
            scale={scale}
            names={names}
          />
        )}
        <p className="text-xs text-text-dim [overflow-wrap:anywhere]">
          {t('clones.verdict.legend', { skills: legend.join(' · ') })}
        </p>
      </div>
    </section>
  );
}
