/**
 * The Moon Mining Tax tab's Auto Assignment bar (issue #4684): one slim row
 * per live Survey connection, like the attention strip but in accent, since it
 * is something running rather than something wrong. Who the moon's ore goes to
 * and at what rate · where · until when, then Stop: the same Stop as on the
 * Survey, for a pilot who has moved on to another one.
 *
 * Only one connection runs at a time (`startSurveyConnection`), so this is
 * one row; a list synced from an older device can briefly hold two.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { isConnectionLive, type SurveyConnection } from '@/engine/miningTax/surveyConnection';
import { eveWhen } from '@/lib/eveTime';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { systemLabel } from './names';
import { removeSurveyConnection, useSurveyConnections } from './surveyConnections';

export function AutoAssignmentBar({
  characterIds,
  characterNames,
  systemNames,
  nowMs: nowOverride,
}: {
  /** The Characters the tab shows. */
  characterIds: readonly number[];
  /** Named in the row only when more than one Character is tracked. */
  characterNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
  /** For tests; otherwise the clock, read each minute. */
  nowMs?: number;
}) {
  const { t } = useTranslation();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowMs = nowOverride ?? clock;
  useHydratedStore(useSurveyConnections);
  const all = useSurveyConnections((s) => s.value);
  const [failed, setFailed] = useState(false);
  const live = all.filter(
    (c) => characterIds.includes(c.characterId) && isConnectionLive(c, nowMs)
  );
  if (live.length === 0) return null;

  function stop(c: SurveyConnection) {
    setFailed(false);
    void removeSurveyConnection(c.surveyId, c.characterId).catch(() => setFailed(true));
  }

  return (
    <div className="space-y-1">
      {live.map((c) => {
        const parts = [
          t('miningTax.surveyConnections.line', { name: c.payeeName, pct: c.taxPct }),
          c.systemId === null
            ? t('miningTax.surveyConnections.noLocation')
            : systemLabel(systemNames, c.systemId),
          t('miningTax.surveyConnections.until', { time: eveWhen(c.untilMs, nowMs) }),
          characterIds.length > 1 ? characterNames.get(c.characterId) : undefined,
        ].filter((part) => part !== undefined);
        const detail = parts.join(' · ');
        return (
          <section
            key={`${c.surveyId}:${c.characterId}`}
            role="status"
            aria-label={t('miningTax.surveyConnections.title')}
            className="flex min-h-9 items-center gap-2 rounded-xs border border-accent/60 bg-accent/10 px-2.5 py-1 text-xs md:min-h-0"
          >
            {/* The eyebrow's type in accent, not its dim colour: the bar's one tone, as warning is the attention strip's. */}
            <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
              {t('miningTax.surveyConnections.title')}
            </span>
            {/* Cut short on a phone: the full line is a tap away. */}
            <span className="min-w-0 flex-1 truncate text-text-dim">
              <HintText content={detail} onlyWhenTruncated>
                {detail}
              </HintText>
            </span>
            <Button size="sm" className="shrink-0" onClick={() => stop(c)}>
              {t('survey.moonTax.stop')}
            </Button>
          </section>
        );
      })}
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t('miningTax.surveyConnections.stopFailed')}
        </p>
      )}
    </div>
  );
}
