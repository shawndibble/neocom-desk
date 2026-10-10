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
import { EmptyState, Spinner } from '@/components/ui';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { classifyScan, lastSeenField, missingOres } from '@/engine/survey/scanUpdate';
import { ShareShell } from '@/features/share/ShareShell';
import { shareUrl } from '@/features/share/shareStore';
import { isTypingTarget } from '@/lib/shortcuts';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ScanFeedback } from './ScanFeedback';
import { useScanFeedback } from './useScanFeedback';
import { MoonTaxReadout } from './MoonTaxRow';
import { SurveyBoard } from './SurveyBoard';
import { ExpandedCheck } from './ExpandedCheck';
import { stashPendingScan } from './pendingScan';
import { hasSubmittedScan, noteSubmittedScan } from './submitted';
import { submitterName } from './submitterName';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { addSurveyScan, loadSurvey } from './surveyStore';
import { useHasMoonOre } from './useHasMoonOre';
import { useSurvey } from './useSurvey';
import type { SurveyTaxShare } from './surveyStore';

export function SurveyShareScreen({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const { state, refresh } = useSurvey(shareId);
  // A pasted scan of a different field waits for the pilot to log in (or open
  // the app), where it starts their own survey: starting one needs a session.
  const [diverted, setDiverted] = useState(false);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  // A first scan lacking an ore the survey shows, waiting for the pilot to
  // confirm every section was expanded.
  const [checking, setChecking] = useState<{ text: string; ores: string[] } | null>(null);

  const add = useCallback(
    async (text: string, confirmed = false): Promise<AddScanResult> => {
      const rejected = rejectScanText(text);
      if (rejected !== null) return rejected;
      try {
        // Read fresh: the comparison is against the latest scan, which another
        // pilot may have just added.
        const found = await loadSurvey(shareId);
        if (!found.ok) return 'failed';
        const latest = found.scans[found.scans.length - 1];
        if (
          latest !== undefined &&
          classifyScan(
            lastSeenField(found.scans.map((scan) => scan.rocks)),
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

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (parseSurveyScan(text) !== null) void trackedAdd(text);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [trackedAdd]);

  return (
    <ShareShell
      title={t('survey.shareTitle')}
      hideTitle
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
        <EmptyState title={t('share.failedTitle')} hint={t('share.failedHint')} className="py-10" />
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
          <SurveyBoard
            scans={state.scans}
            url={shareUrl(shareId)}
            expiresAt={state.expiresAt}
            afterPanel={(summary) => <MoonTaxIfMoon tax={state.tax} oreNames={summary.oreNames} />}
            panelTitle={t('survey.sharePanelTitle')}
          />
        </>
      )}
    </ShareShell>
  );
}

/** The tax line, only when the creator set one and the scans show a moon ore. */
function MoonTaxIfMoon({ tax, oreNames }: { tax: SurveyTaxShare | null; oreNames: string[] }) {
  const moon = useHasMoonOre(oreNames);
  return tax !== null && moon ? <MoonTaxReadout tax={tax} /> : null;
}
