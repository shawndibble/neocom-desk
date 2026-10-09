/**
 * The public page of a shared Survey, opened from `/share/<id>`: the same
 * board the Survey tab shows, with no login. Anyone holding the link can add a
 * scan (paste into the box, or press Ctrl+V anywhere on the page), so the
 * Survey carries on after the pilot who started it has left.
 *
 * `GlobalPasteRouter` lives in the signed-in shell, which this page sits
 * outside, so the page listens for a paste itself.
 */
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { ShareShell } from '@/features/share/ShareShell';
import { shareUrl } from '@/features/share/shareStore';
import { isTypingTarget } from '@/lib/shortcuts';
import { SurveyBoard } from './SurveyBoard';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { addSurveyScan } from './surveyStore';
import { useSurvey } from './useSurvey';

export function SurveyShareScreen({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const { state, refresh } = useSurvey(shareId);
  const expiresAt = state.status === 'ready' ? state.expiresAt : null;

  const add = useCallback(
    async (text: string): Promise<AddScanResult> => {
      const rejected = rejectScanText(text);
      if (rejected !== null) return rejected;
      if (expiresAt === null) return 'failed';
      try {
        await addSurveyScan({ id: shareId, text, expiresAt });
        await refresh();
        return 'ok';
      } catch (error) {
        return scanFailure(error);
      }
    },
    [expiresAt, refresh, shareId]
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
        state.status === 'ready' ? { path: `/mining/survey?survey=${shareId}` } : undefined
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
