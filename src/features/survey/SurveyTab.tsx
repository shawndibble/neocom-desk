/**
 * Mining › Survey: paste a Survey Scanner copy (here, or Ctrl+V anywhere in
 * the app, which `GlobalPasteRouter` sends here) and it tracks the field from
 * then on. The first scan stores a `survey` Share Link; a later paste that only
 * shrinks the field adds a scan to it, and the short link is what other pilots
 * open or paste into. A paste that is a different field starts a new survey, or
 * asks first when the pilot owns the one in view and it could still be that
 * field (it fits the first scan); one that doesn't even fit the first scan
 * starts a new survey without asking.
 *
 * Like the other mining tabs, this one owns its `PageHeader`; the shared tab
 * bar is handed down from `routes/MoonMiningTax.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import { Button, EmptyState, PageHeader, TabPanel, textActionClassName } from '@/components/ui';
import { isShareId } from '@/engine/share/shareId';
import { ownsSurvey } from '@/engine/survey/owner';
import { countedScans, type SurveySummary } from '@/engine/survey/series';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { classifyScan, lastSeenField, missingOres } from '@/engine/survey/scanUpdate';
import { shareUrl } from '@/features/share/shareStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { SurveyScanState } from '@/lib/shortcuts';
import { ExpandedCheck } from './ExpandedCheck';
import { ScanFeedback } from './ScanFeedback';
import { useScanFeedback } from './useScanFeedback';
import { SurveyBoard } from './SurveyBoard';
import { SurveyNameTitle } from './SurveyNameTitle';
import { SurveyPicker } from './SurveyPicker';
import { SurveyOwnerChange } from './SurveyOwnerChange';
import { SurveyInfoEditor, SurveyInfoReadout, type InfoSurvey } from './SurveyInfoPanel';
import { SurveyStartTemplates } from './SurveyStartTemplates';
import { useSurveyTemplates } from './surveyTemplates';
import { writeTemplateToSurvey } from './surveyTemplateWrite';
import { stashPendingScan, takePendingScan } from './pendingScan';
import { hasSubmittedScan, noteSubmittedScan } from './submitted';
import { submitterName } from './submitterName';
import { useHasMoonOre } from './useHasMoonOre';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { noteSurvey } from './surveyHistory';
import { useCurrentSurveyId } from './surveyPref';
import {
  addSurveyScan,
  finishSurvey,
  loadSurvey,
  setSurveyScanIgnored,
  startSurvey,
  type SurveyInfoShare,
  type SurveyTaxShare,
} from './surveyStore';
import { useSurvey } from './useSurvey';
import { useHydratedStore } from '@/lib/useHydratedStore';

interface SurveyTabProps {
  /** The route's shared tab bar, rendered under this tab's own `PageHeader`. See `MoonMiningTax`. */
  tabBar: ReactNode;
  /** The id base the tab bar was built with, so the body is its tab panel. */
  tabsId: string;
}

/** Where a scan goes when the pilot has chosen: a new survey, or the one in view. */
type ScanTarget = 'new' | 'existing';

export function SurveyTab({ tabBar, tabsId }: SurveyTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const currentId = useCurrentSurveyId((state) => state.value);
  const setCurrentId = useCurrentSurveyId((state) => state.setValue);
  const hydrated = useHydratedStore(useCurrentSurveyId);

  // `?survey=<id>` (from a shared page's "Open Neocom Desk") adopts that survey.
  const adopt = new URLSearchParams(location.search).get('survey');
  useEffect(() => {
    if (!hydrated || adopt === null) return;
    if (isShareId(adopt)) void setCurrentId(adopt);
    void navigate(location.pathname, { replace: true, state: location.state });
  }, [hydrated, adopt, setCurrentId, navigate, location.pathname, location.state]);

  const { state, refresh } = useSurvey(hydrated ? currentId : null);

  // The template picked on the empty page, filled into the survey the first scan starts.
  const templates = useSurveyTemplates((s) => s.value);
  useHydratedStore(useSurveyTemplates);
  const [startTemplateId, setStartTemplateId] = useState<string | null>(null);
  const startTemplate = templates.find((template) => template.id === startTemplateId);

  // A survey in view is one the pilot has now created or opened.
  useEffect(() => {
    if (currentId !== null && state.status === 'ready') void noteSurvey(currentId);
  }, [currentId, state.status]);

  // A different field the survey's owner pasted, waiting for their choice. It
  // belongs to the survey that was in view, so switching survey drops it.
  const [asking, setAsking] = useState<{ text: string; forId: string | null } | null>(null);
  // A first scan that lacks an ore the survey shows, waiting for the pilot to
  // confirm every section was expanded.
  const [checking, setChecking] = useState<{
    text: string;
    ores: string[];
    forId: string | null;
    choice?: ScanTarget;
  } | null>(null);

  const startWith = useCallback(
    async (text: string): Promise<AddScanResult> => {
      if (characterId === null) return 'failed';
      const ownerName = (await db.characters.get(characterId))?.name;
      if (ownerName === undefined) return 'failed';
      const started = await startSurvey({ characterId, ownerName });
      // Scan first, so the new survey's first load already has it.
      await addSurveyScan({ id: started.id, text, expiresAt: started.expiresAt, by: ownerName });
      // Best effort: a template that fails to write leaves the panel blank, as without one.
      if (startTemplate) await writeTemplateToSurvey(started, startTemplate).catch(() => undefined);
      setStartTemplateId(null);
      noteSubmittedScan();
      await setCurrentId(started.id);
      return 'ok';
    },
    [characterId, setCurrentId, startTemplate]
  );

  const add = useCallback(
    async (text: string, choice?: ScanTarget, confirmed = false): Promise<AddScanResult> => {
      // Before anything is sent, so a wrong paste never starts a survey.
      const rejected = rejectScanText(text);
      if (rejected !== null) return rejected;
      try {
        if (choice === 'new') return await startWith(text);
        // Read fresh, not from the polled state: another pilot may have added a
        // scan since, and a paste is compared against the latest one.
        const found = currentId === null ? null : await loadSurvey(currentId);
        if (found?.ok) {
          // Against what the survey counts: a removed bad paste is no field to match.
          const counted = countedScans(found.scans, found.ignored);
          const latest = counted[counted.length - 1];
          const pasted = parseSurveyScan(text) ?? [];
          const sameField =
            choice === 'existing' ||
            latest === undefined ||
            classifyScan(lastSeenField(counted.map((scan) => scan.rocks)), pasted) === 'update';
          if (!sameField) {
            const names = (await db.characters.toArray()).map((c) => c.name);
            // Not even a subset of the first scan: clearly another field, so no question to ask.
            const clearlyNew = classifyScan(counted[0]!.rocks, pasted) === 'different';
            if (clearlyNew || !ownsSurvey(found.owner, names)) return await startWith(text);
            setAsking({ text, forId: currentId });
            return 'ok';
          }
          if (!confirmed && choice === undefined && !hasSubmittedScan()) {
            // Against the latest scan only: an ore an earlier scan showed but the
            // latest already lacks is mined out, not a collapsed section.
            const ores = missingOres(latest?.rocks ?? null, parseSurveyScan(text) ?? []);
            if (ores.length > 0) {
              setChecking({ text, ores, forId: currentId, choice });
              return 'ok';
            }
          }
          await addSurveyScan({
            id: currentId!,
            text,
            expiresAt: found.expiresAt,
            by: await submitterName(characterId),
          });
          noteSubmittedScan();
          await refresh();
          return 'ok';
        }
        if (found !== null && found.reason === 'failed') return 'failed';
        // First scan, or the old survey has expired: start a new one.
        return await startWith(text);
      } catch (error) {
        return scanFailure(error);
      }
    },
    [characterId, currentId, refresh, startWith]
  );

  const { trackedAdd, busy, error } = useScanFeedback(add);

  async function answer(choice: ScanTarget) {
    const text = asking?.text;
    setAsking(null);
    if (text !== undefined) await trackedAdd(text, choice);
  }

  function confirmExpanded() {
    const pending = checking;
    setChecking(null);
    if (pending !== null) void trackedAdd(pending.text, pending.choice, true);
  }

  const addRef = useRef(trackedAdd);
  useEffect(() => {
    addRef.current = trackedAdd;
  });

  // A scan the app-wide paste router carried here.
  const routed = (location.state as Partial<SurveyScanState> | null)?.surveyScanText;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    // Cleared with the router's state, so the same text pasted again is a new paste.
    if (routed === undefined) handled.current = null;
    if (!hydrated || routed === undefined || handled.current === routed) return;
    handled.current = routed;
    void addRef.current(routed).then(() => {
      void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    });
  }, [hydrated, routed, navigate, location.pathname, location.search]);

  // A scan pasted on a shared page that was a different field, waiting here
  // since the pilot logged in: it starts their own survey. Taken before the
  // await, so a re-render cannot add it twice.
  useEffect(() => {
    if (!hydrated || characterId === null) return;
    const pending = takePendingScan();
    if (pending === null) return;
    // Put back if it didn't land (no session yet right after login, offline):
    // the pilot's next visit tries again instead of losing the paste.
    void addRef.current(pending, 'new').then((result) => {
      if (result !== 'ok') stashPendingScan(pending);
    });
  }, [hydrated, characterId]);

  const characterNames = useCharacters().map((c) => c.name);
  const scans = useMemo(() => (state.status === 'ready' ? state.scans : []), [state]);
  const owned = state.status === 'ready' && ownsSurvey(state.owner, characterNames);
  // Only the owner sets a scan aside; the rules can't tell who that is, so this is the guard.
  const [ignoreFailed, setIgnoreFailed] = useState(false);
  const setIgnored = useCallback(
    async (scanId: string, ignored: boolean) => {
      if (currentId === null || state.status !== 'ready') return;
      setIgnoreFailed(false);
      try {
        await setSurveyScanIgnored({ id: currentId, expiresAt: state.expiresAt, scanId, ignored });
        await refresh();
      } catch {
        setIgnoreFailed(true);
      }
    },
    [currentId, state, refresh]
  );
  const finish = useCallback(async (): Promise<boolean> => {
    if (currentId === null || state.status !== 'ready') return false;
    try {
      await finishSurvey({
        id: currentId,
        expiresAt: state.expiresAt,
        by: await submitterName(characterId),
      });
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [currentId, state, characterId, refresh]);
  const expiresAt = state.status === 'ready' ? state.expiresAt : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('miningTax.title')}
        actions={<SurveyPicker currentId={currentId} onPick={(id) => void setCurrentId(id)} />}
      />
      {tabBar}
      <TabPanel tabsId={tabsId} tabId="survey" className="space-y-4">
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
            {asking !== null && asking.forId === currentId && (
              <div
                role="group"
                aria-label={t('survey.differentField')}
                className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel/85 p-3"
              >
                <p className="mr-auto text-sm">{t('survey.differentField')}</p>
                <Button variant="primary" size="sm" onClick={() => void answer('new')}>
                  {t('survey.createNew')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void answer('existing')}>
                  {t('survey.addToExisting')}
                </Button>
              </div>
            )}
            {checking !== null && checking.forId === currentId && (
              <ExpandedCheck
                ores={checking.ores}
                onConfirm={confirmExpanded}
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
              // Opening another Survey starts its chart back on Ore left.
              key={currentId ?? 'none'}
              scans={scans}
              ignored={state.status === 'ready' ? state.ignored : undefined}
              onSetIgnored={
                owned ? (scanId, ignored) => void setIgnored(scanId, ignored) : undefined
              }
              // Who may mark it cleared (owner any time, anyone once it is nearly done) is
              // `canFinishSurvey`'s call, inside the board.
              onFinish={currentId !== null && state.status === 'ready' ? finish : undefined}
              owned={owned}
              location={state.status === 'ready' ? (state.info?.location?.name ?? null) : null}
              panelTitle={currentId !== null ? <SurveyNameTitle id={currentId} /> : undefined}
              afterPanel={(summary) =>
                characterId !== null && (
                  <SurveyInfoLine
                    characterId={characterId}
                    summary={summary}
                    owned={owned}
                    onStored={() => void refresh()}
                    tax={state.status === 'ready' ? state.tax : null}
                    info={state.status === 'ready' ? state.info : null}
                    survey={
                      currentId !== null && state.status === 'ready'
                        ? {
                            id: currentId,
                            expiresAt: state.expiresAt,
                            published: state.tax,
                            info: state.info,
                          }
                        : undefined
                    }
                  />
                )
              }
              url={currentId !== null && state.status === 'ready' ? shareUrl(currentId) : null}
              expiresAt={expiresAt}
              emptyExtra={
                currentId === null && characterId !== null ? (
                  <SurveyStartTemplates
                    templates={templates}
                    selectedId={startTemplate?.id ?? null}
                    onSelect={setStartTemplateId}
                  />
                ) : undefined
              }
              footerActions={
                currentId === null
                  ? undefined
                  : [
                      ...(owned && characterId !== null
                        ? [
                            <SurveyOwnerChange
                              key="owner"
                              characterId={characterId}
                              surveyId={currentId}
                              onChanged={() => void refresh()}
                            />,
                          ]
                        : []),
                      <button
                        key="new"
                        type="button"
                        className={textActionClassName()}
                        onClick={() => void setCurrentId(null)}
                      >
                        {t('survey.newSurvey')}
                      </button>,
                    ]
              }
            />
          </>
        )}
      </TabPanel>
    </div>
  );
}

/**
 * The Additional information panel: location, the moon tax (only once the Survey
 * shows a moon ore) and notes. The pilot who started the Survey edits it and
 * stores it on the Survey; anyone else opening it in the app sees what the owner
 * stored, read-only, so their own saved tax can't overwrite it.
 */
function SurveyInfoLine({
  characterId,
  summary,
  owned,
  tax,
  info,
  survey,
  onStored,
}: {
  characterId: number;
  summary: SurveySummary;
  owned: boolean;
  tax: SurveyTaxShare | null;
  info: SurveyInfoShare | null;
  survey?: InfoSurvey;
  onStored: () => void;
}) {
  const moon = useHasMoonOre(summary.oreNames);
  const connect = survey && { id: survey.id, expiresAt: survey.expiresAt, summary };
  if (owned) {
    return (
      <SurveyInfoEditor
        key={survey?.id}
        characterId={characterId}
        survey={survey}
        connect={connect}
        moon={moon}
        onStored={onStored}
      />
    );
  }
  return <SurveyInfoReadout info={info} tax={moon ? tax : null} connect={connect} />;
}
