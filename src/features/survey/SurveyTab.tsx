/**
 * Mining › Survey: paste a Survey Scanner copy (here, or Ctrl+V anywhere in
 * the app, which `GlobalPasteRouter` sends here) and it tracks the field from
 * then on. The first scan stores a `survey` Share Link; every later paste adds
 * a scan to it, and the short link is what other pilots open or paste into.
 *
 * Like the other mining tabs, this one owns its `PageHeader`; the shared tab
 * bar is handed down from `routes/MoonMiningTax.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { isShareId } from '@/engine/share/shareId';
import { shareUrl } from '@/features/share/shareStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { SurveyScanState } from '@/lib/shortcuts';
import { SurveyBoard } from './SurveyBoard';
import { YourShareRow } from './YourShareRow';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { useCurrentSurveyId } from './surveyPref';
import { addSurveyScan, loadSurvey, startSurvey } from './surveyStore';
import { useSurvey } from './useSurvey';

interface SurveyTabProps {
  /** The route's shared tab bar, rendered under this tab's own `PageHeader`. See `MoonMiningTax`. */
  tabBar: ReactNode;
}

export function SurveyTab({ tabBar }: SurveyTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const currentId = useCurrentSurveyId((state) => state.value);
  const setCurrentId = useCurrentSurveyId((state) => state.setValue);
  const hydrated = useCurrentSurveyId((state) => state.hydrated);
  const hydrate = useCurrentSurveyId((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // `?survey=<id>` (from a shared page's "Open Neocom Desk") adopts that survey.
  const adopt = new URLSearchParams(location.search).get('survey');
  useEffect(() => {
    if (!hydrated || adopt === null) return;
    if (isShareId(adopt)) void setCurrentId(adopt);
    void navigate(location.pathname, { replace: true, state: location.state });
  }, [hydrated, adopt, setCurrentId, navigate, location.pathname, location.state]);

  const { state, refresh } = useSurvey(hydrated ? currentId : null);

  const add = useCallback(
    async (text: string): Promise<AddScanResult> => {
      // Before anything is sent, so a wrong paste never starts a survey.
      const rejected = rejectScanText(text);
      if (rejected !== null) return rejected;
      try {
        let target: { id: string; expiresAt: number } | null = null;
        if (currentId !== null) {
          if (state.status === 'ready') {
            target = { id: currentId, expiresAt: state.expiresAt };
          } else {
            const found = await loadSurvey(currentId);
            if (found.ok) target = { id: currentId, expiresAt: found.expiresAt };
            else if (found.reason === 'failed') return 'failed';
          }
        }
        if (target === null) {
          // First scan, or the old survey has expired: start a new one.
          if (characterId === null) return 'failed';
          const started = await startSurvey({ characterId });
          await setCurrentId(started.id);
          target = { id: started.id, expiresAt: started.expiresAt };
        }
        await addSurveyScan({ id: target.id, text, expiresAt: target.expiresAt });
        await refresh();
        return 'ok';
      } catch (error) {
        return scanFailure(error);
      }
    },
    [characterId, currentId, refresh, setCurrentId, state]
  );

  // A scan the app-wide paste router carried here.
  const routed = (location.state as Partial<SurveyScanState> | null)?.surveyScanText;
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || routed === undefined || handled.current === routed) return;
    handled.current = routed;
    void addRef.current(routed).then(() => {
      void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    });
  }, [hydrated, routed, navigate, location.pathname, location.search]);

  const scans = useMemo(() => (state.status === 'ready' ? state.scans : []), [state]);
  const expiresAt = state.status === 'ready' ? state.expiresAt : null;

  return (
    <div className="space-y-4">
      <PageHeader title={t('miningTax.title')} />
      {tabBar}
      {state.status === 'loading' ? null : (
        <>
          {state.status === 'failed' && (
            <p role="alert" className="text-xs text-warning">
              {t('survey.loadFailed')}
            </p>
          )}
          {state.status === 'gone' && (
            <EmptyState title={t('survey.gone')} hint={t('survey.goneHint')} className="py-6" />
          )}
          <SurveyBoard
            scans={scans}
            viewerLine={(summary) => <YourShareRow characterId={characterId} summary={summary} />}
            url={currentId !== null && state.status === 'ready' ? shareUrl(currentId) : null}
            expiresAt={expiresAt}
            onAdd={add}
            actions={
              currentId !== null ? (
                <Button onClick={() => void setCurrentId(null)}>{t('survey.newSurvey')}</Button>
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
