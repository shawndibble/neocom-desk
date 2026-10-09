/**
 * The public page of a shared Survey, opened from `/share/<id>`: the same
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
import { classifyScan } from '@/engine/survey/scanUpdate';
import { ShareShell } from '@/features/share/ShareShell';
import { shareUrl } from '@/features/share/shareStore';
import { isTypingTarget } from '@/lib/shortcuts';
import { SurveyBoard } from './SurveyBoard';
import { stashPendingScan } from './pendingScan';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { addSurveyScan, loadSurvey } from './surveyStore';
import { useSurvey } from './useSurvey';

export function SurveyShareScreen({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const { state, refresh } = useSurvey(shareId);
  // A pasted scan of a different field waits for the pilot to log in (or open
  // the app), where it starts their own survey: starting one needs a session.
  const [diverted, setDiverted] = useState(false);

  const add = useCallback(
    async (text: string): Promise<AddScanResult> => {
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
          classifyScan(latest.rocks, parseSurveyScan(text) ?? []) === 'different'
        ) {
          stashPendingScan(text);
          setDiverted(true);
          return 'ok';
        }
        await addSurveyScan({ id: shareId, text, expiresAt: found.expiresAt });
        await refresh();
        return 'ok';
      } catch (error) {
        return scanFailure(error);
      }
    },
    [refresh, shareId]
  );

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (parseSurveyScan(text) !== null) void add(text);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [add]);

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
          <SurveyBoard
            scans={state.scans}
            url={shareUrl(shareId)}
            expiresAt={state.expiresAt}
            onAdd={add}
          />
        </>
      )}
    </ShareShell>
  );
}
