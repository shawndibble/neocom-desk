import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import {
  Button,
  EmptyState,
  LoadFailedState,
  PageHeader,
  TabPanel,
  TextArea,
  textActionClassName,
} from '@/components/ui';
import { isShareId } from '@/engine/share/shareId';
import { ownsSurvey } from '@/engine/survey/owner';
import { countedScans } from '@/engine/survey/series';
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
import { SurveyInfoLine } from './SurveyInfoLine';
import { useScanIgnore } from './useScanIgnore';
import { SurveyStartTemplates } from './SurveyStartTemplates';
import { StartLinkHelp } from './StartLinkHelp';
import { fromInfoFields, startLinkPath } from './startLink';
import type { InfoFields } from '@/engine/survey/infoTemplate';
import { noteStartedHere } from './startedHere';
import { claimStartedSurveys } from './claimStarted';
import { useSurveyTemplates } from './surveyTemplates';
import { SurveyStartDetails } from './SurveyStartDetails';
import { EMPTY_START_DRAFT, draftFromTemplate, draftToInfo, type StartDraft } from './startDraft';
import { stashPendingScan, takePendingScan } from './pendingScan';
import { hasSubmittedScan, noteSubmittedScan } from './submitted';
import { submitterName } from './submitterName';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { noteSurvey } from './surveyHistory';
import { useCurrentSurveyId } from './surveyPref';
import { addSurveyScan, finishSurvey, loadSurvey, startSurvey } from './surveyStore';
import { useSurvey } from './useSurvey';
import { useHydratedStore } from '@/lib/useHydratedStore';

interface SurveyTabProps {
  tabBar: ReactNode;
  tabsId: string;
}

type ScanTarget = 'new' | 'existing';

export function SurveyTab({ tabBar, tabsId }: SurveyTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const currentId = useCurrentSurveyId((state) => state.value);
  const setCurrentId = useCurrentSurveyId((state) => state.setValue);
  const hydrated = useHydratedStore(useCurrentSurveyId);

  const adopt = new URLSearchParams(location.search).get('survey');
  useEffect(() => {
    if (!hydrated || adopt === null) return;
    if (isShareId(adopt)) void setCurrentId(adopt);
    void navigate(location.pathname, { replace: true, state: location.state });
  }, [hydrated, adopt, setCurrentId, navigate, location.pathname, location.state]);

  const { state, refresh } = useSurvey(hydrated ? currentId : null);

  const templates = useSurveyTemplates((s) => s.value);
  useHydratedStore(useSurveyTemplates);
  const [startTemplateId, setStartTemplateId] = useState<string | null>(null);
  const startTemplate = templates.find((template) => template.id === startTemplateId);
  const [startDraft, setStartDraft] = useState<StartDraft>(EMPTY_START_DRAFT);

  const accountNames = useCharacters().map((c) => c.name);
  const accountKey = accountNames.join('|');
  useEffect(() => {
    if (characterId === null) return;
    void (async () => {
      const ownerName = (await db.characters.get(characterId))?.name;
      if (ownerName === undefined) return;
      if (await claimStartedSurveys(characterId, ownerName, accountKey.split('|'))) await refresh();
    })().catch(() => undefined);
  }, [characterId, accountKey, refresh]);

  useEffect(() => {
    if (currentId !== null && state.status === 'ready') void noteSurvey(currentId);
  }, [currentId, state.status]);

  const [asking, setAsking] = useState<{ text: string; forId: string | null } | null>(null);
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
      const started = await startSurvey({
        owner: { characterId, ownerName },
        prefill: draftToInfo(startDraft),
      });
      await addSurveyScan({ id: started.id, text, expiresAt: started.expiresAt, by: ownerName });
      setStartTemplateId(null);
      setStartDraft(EMPTY_START_DRAFT);
      noteSubmittedScan();
      noteStartedHere(started.id);
      await setCurrentId(started.id);
      return 'ok';
    },
    [characterId, setCurrentId, startDraft]
  );

  const add = useCallback(
    async (text: string, choice?: ScanTarget, confirmed = false): Promise<AddScanResult> => {
      const rejected = rejectScanText(text);
      if (rejected !== null) return rejected;
      try {
        if (choice === 'new') return await startWith(text);
        const found = currentId === null ? null : await loadSurvey(currentId, { fresh: true });
        if (found?.ok) {
          const counted = countedScans(found.scans, found.ignored);
          const latest = counted[counted.length - 1];
          const pasted = parseSurveyScan(text) ?? [];
          const sameField =
            choice === 'existing' ||
            latest === undefined ||
            classifyScan(lastSeenField(counted.map((scan) => scan.rocks)), pasted) === 'update';
          if (!sameField) {
            const names = (await db.characters.toArray()).map((c) => c.name);
            const clearlyNew = classifyScan(counted[0]!.rocks, pasted) === 'different';
            if (clearlyNew || !ownsSurvey(found.owner, names)) return await startWith(text);
            setAsking({ text, forId: currentId });
            return 'ok';
          }
          if (!confirmed && choice === undefined && !hasSubmittedScan()) {
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

  const routed = (location.state as Partial<SurveyScanState> | null)?.surveyScanText;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (routed === undefined) handled.current = null;
    if (!hydrated || routed === undefined || handled.current === routed) return;
    handled.current = routed;
    void addRef.current(routed).then(() => {
      void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    });
  }, [hydrated, routed, navigate, location.pathname, location.search]);

  useEffect(() => {
    if (!hydrated || characterId === null) return;
    const pending = takePendingScan();
    if (pending === null) return;
    void addRef.current(pending, 'new').then((result) => {
      if (result !== 'ok') stashPendingScan(pending);
    });
  }, [hydrated, characterId]);

  const characterNames = useCharacters().map((c) => c.name);
  const scans = useMemo(() => (state.status === 'ready' ? state.scans : []), [state]);
  const owned = state.status === 'ready' && ownsSurvey(state.owner, characterNames);
  const helpFields: InfoFields =
    currentId !== null && state.status === 'ready'
      ? {
          location: state.info?.location ?? null,
          tax: state.tax ? { name: state.tax.name, pct: state.tax.pct } : null,
          notes: state.info?.notes ?? '',
        }
      : draftToInfo(startDraft);
  const { setIgnored, failed: ignoreFailed } = useScanIgnore({
    id: currentId,
    expiresAt: state.status === 'ready' ? state.expiresAt : null,
    characterId,
    refresh,
  });
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
              <LoadFailedState
                title={t('common.loadFailed.survey')}
                onRetry={refresh}
                className="py-6"
              />
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
              key={currentId ?? 'none'}
              scans={scans}
              ignored={state.status === 'ready' ? state.ignored : undefined}
              onSetIgnored={
                owned ? (scanId, ignored) => void setIgnored(scanId, ignored) : undefined
              }
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
              emptyPaste={
                currentId === null && characterId !== null ? (
                  <TextArea
                    rows={3}
                    aria-label={t('survey.start.pasteTitle')}
                    placeholder={t('survey.start.pastePlaceholder')}
                    value=""
                    onChange={() => undefined}
                    onPaste={(event) => {
                      event.preventDefault();
                      void trackedAdd(event.clipboardData.getData('text/plain'));
                    }}
                  />
                ) : undefined
              }
              emptyExtra={
                currentId === null && characterId !== null ? (
                  <>
                    <SurveyStartTemplates
                      templates={templates}
                      selectedId={startTemplate?.id ?? null}
                      onSelect={(id) => {
                        setStartTemplateId(id);
                        const picked = templates.find((template) => template.id === id);
                        setStartDraft(picked ? draftFromTemplate(picked) : EMPTY_START_DRAFT);
                      }}
                    />
                    <SurveyStartDetails
                      characterId={characterId}
                      draft={startDraft}
                      onChange={setStartDraft}
                      hasTemplates={templates.length > 0}
                    />
                  </>
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
            <StartLinkHelp path={startLinkPath(fromInfoFields(helpFields))} />
          </>
        )}
      </TabPanel>
    </div>
  );
}
