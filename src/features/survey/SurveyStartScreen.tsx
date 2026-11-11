/**
 * `/survey`, the public place to start a **Survey** and to build a **Survey
 * start link**, with no login. The form holds the Additional information a new
 * Survey begins with (location, moon tax payee and rate, notes), filled from the
 * link's query when there is one; below it a link that always matches the form,
 * and the paste area. The first valid Survey Scan, pasted anywhere on the page,
 * starts the Survey with those details.
 *
 * A pilot with a Character logged in starts it as that Character and lands on
 * their own Survey tab; anyone else starts it anonymously and lands on its public
 * `/s/<id>` page. Each opener starts their own Survey.
 *
 * Logged out, systems and NPC stations are still searched (from local data) and an
 * ID can be typed for a place, corporation, alliance or character; ESI's public
 * lookup names it. Structures and the saved Payees need a Character.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Field,
  Fields,
  Panel,
  TextArea,
  TextInput,
  textActionClassName,
} from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { db } from '@/db';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import { ShareShell } from '@/features/share/ShareShell';
import { loadPayees } from '@/features/miningTax/payees';
import { appUrl } from '@/features/share/shareStore';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { writeToClipboard } from '@/lib/clipboard';
import { isTypingTarget } from '@/lib/shortcuts';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ScanFeedback } from './ScanFeedback';
import { StartLinkHelp } from './StartLinkHelp';
import { SurveyHowTo } from './SurveyHowTo';
import {
  parseStartLink,
  START_LINK_PATH,
  startLinkPath,
  toInfoFields,
  type StartLinkFields,
} from './startLink';
import { noteSurvey } from './surveyHistory';
import { noteStartedHere } from './startedHere';
import { SurveyDetailsFields } from './SurveyDetailsFields';
import { samePayeeName, parseTaxPct } from './moonTaxPayee';
import { rejectScanText, scanFailure, type AddScanResult } from './scanResult';
import { addSurveyScan, startSurvey } from './surveyStore';
import { noteSubmittedScan } from './submitted';
import { submitterName } from './submitterName';
import { useScanFeedback } from './useScanFeedback';
import { nameIds } from './startLinkNames';
import { useStartLinkNames, type NameStatus } from './useStartLinkNames';

/** An ID typed into a box: digits only, else nothing. */
function idOf(text: string): number | null {
  const value = Number(text);
  return /^\d+$/.test(text.trim()) && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function StatusLine({ status, ok, failed }: { status: NameStatus; ok: string; failed: string }) {
  if (status === 'idle' || status === 'loading') return null;
  return (
    <p role="status" className={status.ok ? 'text-xs text-text-dim' : 'text-xs text-warning'}>
      {status.ok ? ok : failed}
    </p>
  );
}

export function SurveyStartScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    if (!hydrated) void useActiveCharacter.getState().hydrate();
  }, [hydrated]);
  const characterId = hydrated ? activeId : null;

  const [fields, setFields] = useState<StartLinkFields>(() => parseStartLink(search));
  const [rateText, setRateText] = useState(() => parseStartLink(search).rate?.toString() ?? '');
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  const [howTo, setHowTo] = useState(false);
  // IDs are for link writers: shown only when asked for, even if the link carries one.
  const [ids, setIds] = useState(false);
  const names = useStartLinkNames(fields);
  const savedPayees = useLiveQuery(
    () => (characterId === null ? [] : loadPayees(characterId)),
    [characterId]
  );

  const resolvedPlace =
    names.place !== 'idle' && names.place !== 'loading' && names.place.ok
      ? names.place.name
      : undefined;
  const resolvedPayee =
    names.payee !== 'idle' && names.payee !== 'loading' && names.payee.ok
      ? names.payee.name
      : undefined;
  const info = useMemo(
    () => toInfoFields(fields, { place: resolvedPlace, payee: resolvedPayee }),
    [fields, resolvedPlace, resolvedPayee]
  );

  function setPayeeName(name: string) {
    setFields((prev) => ({
      ...prev,
      // A typed name is its own answer: the ID that came with the old one no longer applies.
      payee: name === '' ? null : { id: null, name },
    }));
    fillSavedRate(name);
  }

  /** A saved Payee brings its usual rate, unless one is already typed. */
  function fillSavedRate(name: string) {
    const saved = (savedPayees ?? []).find((payee) => samePayeeName(payee.name, name));
    if (saved !== undefined && rateText.trim() === '') {
      setRateText(String(saved.defaultTaxPct));
      setFields((prev) => ({ ...prev, rate: saved.defaultTaxPct }));
    }
  }

  const add = useCallback(
    async (text: string): Promise<AddScanResult> => {
      const rejected = rejectScanText(text);
      if (rejected !== null) return rejected;
      try {
        const ownerName =
          characterId === null ? undefined : (await db.characters.get(characterId))?.name;
        // An ID the lookup hasn't named yet (a scan pasted straight after the link opened) is named now.
        const prefill = await nameIds(fields, info);
        const started = await startSurvey({
          owner:
            characterId !== null && ownerName !== undefined
              ? { characterId, ownerName }
              : undefined,
          prefill,
        });
        // Scan first, so the new survey's first load already has it.
        await addSurveyScan({
          id: started.id,
          text,
          expiresAt: started.expiresAt,
          by: await submitterName(characterId),
        });
        noteSubmittedScan();
        noteStartedHere(started.id);
        if (ownerName !== undefined) {
          await noteSurvey(started.id).catch(() => undefined);
          void navigate(`/mining/survey?survey=${started.id}`, { replace: true });
        } else {
          void navigate(`/s/${started.id}`, { replace: true });
        }
        return 'ok';
      } catch (error) {
        return scanFailure(error);
      }
    },
    [characterId, navigate, info, fields]
  );
  const { trackedAdd, busy, error } = useScanFeedback(add);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (parseSurveyScan(text) !== null) void trackedAdd(text);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [trackedAdd]);

  // A payee ESI found by its typed name travels as its ID, which names it for whoever opens the link.
  const verifiedPayeeId =
    names.payeeByName && names.payee !== 'idle' && names.payee !== 'loading' && names.payee.ok
      ? names.payee.id
      : null;
  const linkFields = useMemo(
    () =>
      verifiedPayeeId === null || fields.payee === null
        ? fields
        : { ...fields, payee: { ...fields.payee, id: verifiedPayeeId } },
    [fields, verifiedPayeeId]
  );
  const link = useMemo(() => appUrl(startLinkPath(linkFields)), [linkFields]);
  const placeId = fields.place?.id ?? null;
  const payeeId = fields.payee?.id ?? null;

  const anyDetail = startLinkPath(linkFields) !== START_LINK_PATH;
  const placeStatus = (
    <StatusLine
      status={names.place}
      ok={t('survey.start.resolved', { name: resolvedPlace ?? '' })}
      failed={t('survey.start.placeNotFound')}
    />
  );
  const payeeStatus =
    names.payee === 'idle' || names.payee === 'loading' ? (
      <span>{t('survey.start.payeeHint')}</span>
    ) : (
      <StatusLine
        status={names.payee}
        ok={t('survey.start.resolvedPayee', {
          name: resolvedPayee ?? '',
          kind: names.payee.ok ? t(`survey.start.kind.${names.payee.kind}`) : '',
        })}
        failed={t(
          names.payeeByName ? 'survey.start.payeeNameNotFound' : 'survey.start.payeeNotFound'
        )}
      />
    );

  return (
    <ShareShell title={t('survey.start.title')} footer={<StartLinkHelp />}>
      <p className="text-sm text-text-dim">{t('survey.start.hint')}</p>

      <Panel title={t('survey.start.detailsTitle')}>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-dim">{t('survey.start.detailsHint')}</p>
          <SurveyDetailsFields
            // A link with only IDs shows the names ESI gave them; the IDs stay in the link.
            place={
              fields.place && fields.place.name === '' && resolvedPlace !== undefined
                ? { ...fields.place, name: resolvedPlace }
                : fields.place
            }
            payeeName={fields.payee?.name || resolvedPayee || ''}
            rateText={rateText}
            notes={fields.notes}
            characterId={characterId}
            payeeNote={payeeStatus}
            onPlace={(place) =>
              setFields((prev) => ({
                ...prev,
                place: place === null ? null : { id: place.id, name: place.name, kind: place.kind },
              }))
            }
            onPayeeName={setPayeeName}
            onPayeePick={(match) => {
              setFields((prev) => ({ ...prev, payee: { id: match.id, name: match.name } }));
              fillSavedRate(match.name);
            }}
            onRate={(text) => {
              setRateText(text);
              setFields((prev) => ({ ...prev, rate: parseTaxPct(text) }));
            }}
            onNotes={(notes) => setFields((prev) => ({ ...prev, notes }))}
          />
          <div>
            <button
              type="button"
              className={textActionClassName()}
              aria-expanded={ids}
              onClick={() => setIds((open) => !open)}
            >
              {ids ? t('survey.start.hideIds') : t('survey.start.addIds')}
            </button>
          </div>
          <Collapse open={ids}>
            <Fields variant="form">
              <Field label={t('survey.start.placeIdLabel')} note={placeStatus}>
                <TextInput
                  size="sm"
                  inputMode="numeric"
                  aria-label={t('survey.start.placeId')}
                  placeholder="30000142"
                  value={placeId ?? ''}
                  onChange={(event) => {
                    const id = idOf(event.target.value);
                    setFields((prev) => ({
                      ...prev,
                      place:
                        // The name that went with the old ID is dropped; the lookup names the new one.
                        id === null ? null : { id, name: '' },
                    }));
                  }}
                  className="w-44"
                />
              </Field>
              <Field label={t('survey.start.payeeIdLabel')}>
                <TextInput
                  size="sm"
                  inputMode="numeric"
                  aria-label={t('survey.start.payeeId')}
                  placeholder="98000001"
                  value={payeeId ?? ''}
                  onChange={(event) => {
                    const id = idOf(event.target.value);
                    setFields((prev) => ({
                      ...prev,
                      payee: id === null ? null : { id, name: '' },
                    }));
                  }}
                  className="w-44"
                />
              </Field>
            </Fields>
          </Collapse>
        </div>
      </Panel>

      <Panel title={t('survey.start.pasteTitle')}>
        <div className="flex flex-col gap-3">
          <TextArea
            rows={4}
            aria-label={t('survey.start.pasteTitle')}
            placeholder={t('survey.start.pastePlaceholder')}
            value=""
            onChange={() => undefined}
            onPaste={(event) => {
              event.preventDefault();
              void trackedAdd(event.clipboardData.getData('text/plain'));
            }}
          />
          <ScanFeedback busy={busy} error={error} />
          <div>
            <button
              type="button"
              className={textActionClassName()}
              aria-expanded={howTo}
              onClick={() => setHowTo((open) => !open)}
            >
              {t('survey.start.howToCopy')}
            </button>
          </div>
          <Collapse open={howTo}>
            <SurveyHowTo heading={false} />
          </Collapse>
        </div>
      </Panel>

      {anyDetail && (
        <Panel title={t('survey.start.shareTitle')}>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-dim">{t('survey.start.shareHint')}</p>
            <div className="flex items-center gap-2">
              <TextInput
                size="sm"
                readOnly
                aria-label={t('survey.start.link')}
                value={link}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1"
              />
              <Button
                size="sm"
                onClick={() =>
                  void writeToClipboard(link).then(
                    () => flash('copied'),
                    () => flash('failed')
                  )
                }
              >
                {copied === null
                  ? t('survey.start.copyLink')
                  : t(copied === 'copied' ? 'survey.start.copied' : 'survey.start.copyFailed')}
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </ShareShell>
  );
}
