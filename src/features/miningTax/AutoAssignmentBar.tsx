import { Fragment, useEffect, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { LiveStatus } from '@/components/ui/LiveStatus';
import { isConnectionLive, type SurveyConnection } from '@/engine/miningTax/surveyConnection';
import { eveWhen } from '@/lib/eveTime';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { systemLabel } from './names';
import { removeSurveyConnection, useSurveyConnections } from './surveyConnections';
import { MINUTE_MS } from '@/lib/age';

export function AutoAssignmentBar({
  characterIds,
  characterNames,
  systemNames,
  nowMs: nowOverride,
}: {
  characterIds: readonly number[];
  characterNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
  nowMs?: number;
}) {
  const { t } = useTranslation();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), MINUTE_MS);
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
          <Fragment key={`${c.surveyId}:${c.characterId}`}>
            <LiveStatus>{detail}</LiveStatus>
            <section
              aria-label={t('miningTax.surveyConnections.title')}
              className="flex min-h-9 items-center gap-2 rounded-xs border border-accent/60 bg-accent/10 px-2.5 py-1 text-xs md:min-h-0"
            >
              <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
                {t('miningTax.surveyConnections.title')}
              </span>
              <span className="min-w-0 flex-1 truncate text-text-dim">
                <HintText content={detail} onlyWhenTruncated>
                  {detail}
                </HintText>
              </span>
              <Button size="sm" className="shrink-0" onClick={() => stop(c)}>
                {t('survey.moonTax.stop')}
              </Button>
            </section>
          </Fragment>
        );
      })}
      {failed && <InlineError>{t('miningTax.surveyConnections.stopFailed')}</InlineError>}
    </div>
  );
}
