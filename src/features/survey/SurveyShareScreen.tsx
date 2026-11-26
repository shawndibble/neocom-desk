import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState, LiveNote, LoadFailedState, Spinner } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { ownsSurvey } from '@/engine/survey/owner';
import { countedScans, type SurveySummary } from '@/engine/survey/series';
import { useCharacters } from '@/features/character/useCharacters';
import { classifyScan, lastSeenField, missingOres } from '@/engine/survey/scanUpdate';
import { ShareShell } from '@/features/share/ShareShell';
import { shareUrl } from '@/features/share/shareStore';
import { isTypingTarget } from '@/lib/shortcuts';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ScanFeedback } from './ScanFeedback';
import { useScanFeedback } from './useScanFeedback';
import { SurveyInfoReadout, type SurveyToConnect } from './SurveyInfoPanel';
import { SurveyInfoLine } from './SurveyInfoLine';
import { SurveyStarterDetails } from './SurveyStarterDetails';
import { useScanIgnore } from './useScanIgnore';
import { startedHere } from './startedHere';
import { SurveyBoard } from './SurveyBoard';
import { ExpandedCheck } from './ExpandedCheck';
import { stashPendingScan } from './pendingScan';
import { hasSubmittedScan, noteSubmittedScan } from './submitted';
import { submitterName } from './submitterName';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { addSurveyScan, finishSurvey, loadSurvey } from './surveyStore';
import { useHasMoonOre } from './useHasMoonOre';
import { useSurvey } from './useSurvey';
import type { SurveyInfoShare, SurveyTaxShare } from './surveyStore';

export function SurveyShareScreen({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const { state, refresh } = useSurvey(shareId);
  const [diverted, setDiverted] = useState(false);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  useEffect(() => {
    if (!hydrated) void useActiveCharacter.getState().hydrate();
  }, [hydrated]);
  const [checking, setChecking] = useState<{ text: string; ores: string[] } | null>(null);
  const characterNames = useCharacters().map((c) => c.name);
  const owned =
    characterId !== null && state.status === 'ready' && ownsSurvey(state.owner, characterNames);
  const starter = !owned && hydrated && startedHere(shareId);
  const { setIgnored, failed: ignoreFailed } = useScanIgnore({
    id: shareId,
    expiresAt: state.status === 'ready' ? state.expiresAt : null,
    characterId,
    refresh,
  });

  const add = useCallback(
    async (text: string, confirmed = false): Promise<AddScanResult> => {
      const rejected = rejectScanText(text);
      if (rejected !== null) return rejected;
      try {
        const found = await loadSurvey(shareId, { fresh: true });
        if (!found.ok) return 'failed';
        const counted = countedScans(found.scans, found.ignored);
        const latest = counted[counted.length - 1];
        if (
          latest !== undefined &&
          classifyScan(
            lastSeenField(counted.map((scan) => scan.rocks)),
            parseSurveyScan(text) ?? []
          ) === 'different'
        ) {
          stashPendingScan(text);
          setDiverted(true);
          return 'ok';
        }
        if (!confirmed && !hasSubmittedScan()) {
          const ores = missingOres(latest?.rocks ?? null, parseSurveyScan(text) ?? []);
          if (ores.length > 0) {
            setChecking({ text, ores });
            return 'ok';
          }
        }
        await addSurveyScan({
          id: shareId,
          text,
          expiresAt: found.expiresAt,
          by: await submitterName(characterId),
        });
        noteSubmittedScan();
        await refresh();
        return 'ok';
      } catch (error) {
        return scanFailure(error);
      }
    },
    [characterId, refresh, shareId]
  );

  const { trackedAdd, busy, error } = useScanFeedback(add);

  const finish = useCallback(async (): Promise<boolean> => {
    if (state.status !== 'ready') return false;
    try {
      await finishSurvey({
        id: shareId,
        expiresAt: state.expiresAt,
        by: await submitterName(characterId),
      });
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [characterId, refresh, shareId, state]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (parseSurveyScan(text) !== null) void trackedAdd(text);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [trackedAdd]);

  return (
    <ShareShell
      title={t('survey.shareTitle')}
      openInApp={
        state.status === 'ready'
          ? { path: diverted ? '/mining/survey' : `/mining/survey?survey=${shareId}` }
          : undefined
      }
    >
      {state.status === 'loading' && (
        <div className="flex justify-center py-10">
          <Spinner label={t('common.loading')} />
        </div>
      )}
      {state.status === 'gone' && (
        <EmptyState title={t('survey.gone')} hint={t('survey.goneHint')} className="py-10" />
      )}
      {state.status === 'failed' && (
        <LoadFailedState
          title={t('common.loadFailed.surveyShare')}
          onRetry={refresh}
          className="py-10"
        />
      )}
      {state.status === 'ready' && (
        <>
          <p className="text-xs text-text-dim">{t('survey.shareHint')}</p>
          {diverted && (
            <LiveNote className="text-sm text-warning">{t('survey.differentOnShare')}</LiveNote>
          )}
          {checking !== null && (
            <ExpandedCheck
              ores={checking.ores}
              onConfirm={() => {
                const { text } = checking;
                setChecking(null);
                void trackedAdd(text, true);
              }}
              onCancel={() => setChecking(null)}
            />
          )}
          <ScanFeedback busy={busy} error={error} />
          {ignoreFailed && (
            <p role="alert" className="text-sm text-danger">
              {t('survey.scanList.removeFailed')}
            </p>
          )}
          <SurveyBoard
            scans={state.scans}
            ignored={state.ignored}
            onSetIgnored={
              owned || starter ? (scanId, ignored) => void setIgnored(scanId, ignored) : undefined
            }
            owned={owned}
            onFinish={finish}
            url={shareUrl(shareId)}
            location={state.info?.location?.name ?? null}
            expiresAt={state.expiresAt}
            afterPanel={(summary) =>
              owned && characterId !== null ? (
                <SurveyInfoLine
                  characterId={characterId}
                  summary={summary}
                  owned
                  tax={state.tax}
                  info={state.info}
                  survey={{
                    id: shareId,
                    expiresAt: state.expiresAt,
                    published: state.tax,
                    info: state.info,
                  }}
                  onStored={() => void refresh()}
                />
              ) : starter ? (
                <SurveyStarterDetails
                  key={shareId}
                  id={shareId}
                  expiresAt={state.expiresAt}
                  info={state.info}
                  tax={state.tax}
                  onStored={() => void refresh()}
                />
              ) : (
                <SurveyInfoIfAny
                  info={state.info}
                  tax={state.tax}
                  summary={summary}
                  connect={{ id: shareId, expiresAt: state.expiresAt, summary }}
                />
              )
            }
            panelTitle={t('survey.sharePanelTitle')}
          />
          <p className="text-xs">
            <Link to="/survey" className={inlineLinkClassName}>
              {t('survey.start.newFromShare')}
            </Link>
          </p>
        </>
      )}
    </ShareShell>
  );
}

function SurveyInfoIfAny({
  info,
  tax,
  summary,
  connect,
}: {
  info: SurveyInfoShare | null;
  tax: SurveyTaxShare | null;
  summary: SurveySummary;
  connect: SurveyToConnect;
}) {
  const moon = useHasMoonOre(summary.oreNames);
  return <SurveyInfoReadout info={info} tax={moon ? tax : null} connect={connect} />;
}
