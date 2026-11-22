/**
 * The public page of a shared Survey, opened from `/s/<id>`: the same
 * board the Survey tab shows, with no login. Anyone holding the link can add a
 * scan (paste into the box, or press Ctrl+V anywhere on the page), so the
 * Survey carries on after the pilot who started it has left.
 *
 * `GlobalPasteRouter` lives in the signed-in shell, which this page sits
 * outside, so the page listens for a paste itself.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState, LoadFailedState, Spinner } from '@/components/ui';
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
  // A pasted scan of a different field waits for the pilot to log in (or open
  // the app), where it starts their own survey: starting one needs a session.
  const [diverted, setDiverted] = useState(false);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  // Who is signed in decides whether the starter edits here or in the app.
  useEffect(() => {
    if (!hydrated) void useActiveCharacter.getState().hydrate();
  }, [hydrated]);
  // A first scan lacking an ore the survey shows, waiting for the pilot to
  // confirm every section was expanded.
  const [checking, setChecking] = useState<{ text: string; ores: string[] } | null>(null);
  // A signed-in pilot whose Character started the Survey manages it here as in the
  // app: the details panel and setting scans aside. Anyone else sees the plain page.
  const characterNames = useCharacters().map((c) => c.name);
  const owned =
    characterId !== null && state.status === 'ready' && ownsSurvey(state.owner, characterNames);
  // The device that started the Survey (`startedHere.ts`) manages it too, whether or
  // not anyone is signed in: a Survey started with no account has no owner name for
  // `owned` to match, and the pilot may have signed in since.
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
        // Read fresh: the comparison is against the latest scan, which another
        // pilot may have just added.
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
          // Against the latest scan only: an ore an earlier scan showed but the
          // latest already lacks is mined out, not a collapsed section.
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

  // No `owned` here: the public page only offers it once the field is nearly done.
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
            <p role="status" className="text-sm text-warning">
              {t('survey.differentOnShare')}
            </p>
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

/** What the creator set: the location, notes, and the tax when the scans show a moon ore. Nothing set, no panel. */
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
