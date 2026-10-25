/**
 * The Moon Mining Tax tab's list of live Survey connections (issue #4684): who
 * each connected moon's ore is being assigned to, until when, and Stop. The
 * same Stop as on the Survey, for a pilot who has moved on to another one.
 *
 * Moon ore of one type is often owed to different Payees, so a connection
 * claims a moon system and ore (kept in data, not listed here). Ore two
 * connections claim while both are being mined is left unassigned (`planSurveyAutoAssign`), and the
 * row says so rather than leaving a pilot to wonder where it went.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import {
  findOreClash,
  isConnectionLive,
  type SurveyConnection,
} from '@/engine/miningTax/surveyConnection';
import { eveWhen } from '@/lib/eveTime';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { systemLabel } from './names';
import { removeSurveyConnection, useSurveyConnections } from './surveyConnections';

export function SurveyConnectionsPanel({
  characterIds,
  characterNames,
  systemNames,
  nowMs: nowOverride,
}: {
  /** The Characters the tab shows. */
  characterIds: readonly number[];
  /** Named beside each row only when more than one Character is tracked. */
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
    <Panel title={t('miningTax.surveyConnections.title')}>
      <ul className="divide-y divide-line text-sm">
        {live.map((c) => {
          const clash = findOreClash(c, live, nowMs);
          return (
            <li
              key={`${c.surveyId}:${c.characterId}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold [overflow-wrap:anywhere]">
                  {t('miningTax.surveyConnections.line', { name: c.payeeName, pct: c.taxPct })}
                  {characterIds.length > 1 && characterNames.has(c.characterId)
                    ? ` · ${characterNames.get(c.characterId)}`
                    : ''}
                </p>
                <p className="text-text-dim">
                  {c.systemId === null
                    ? t('miningTax.surveyConnections.noLocation')
                    : systemLabel(systemNames, c.systemId)}
                  {' · '}
                  {t('miningTax.surveyConnections.until', { time: eveWhen(c.untilMs, nowMs) })}
                </p>
                {clash && (
                  <p role="status" className="text-xs text-warning">
                    {t('miningTax.surveyConnections.overlap', { name: clash.payeeName })}
                  </p>
                )}
              </div>
              <Button size="sm" onClick={() => stop(c)}>
                {t('survey.moonTax.stop')}
              </Button>
            </li>
          );
        })}
      </ul>
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t('miningTax.surveyConnections.stopFailed')}
        </p>
      )}
    </Panel>
  );
}
