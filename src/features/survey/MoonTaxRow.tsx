/**
 * Moon ore is taxed by whoever owns the moon, so a Survey that shows any asks
 * who and at what rate, and hands both to the Moon Mining Tax tab. It is the
 * Moon tax row of the Additional information panel (`SurveyInfoPanel`): a rate
 * field and a name field, always shown like the location and notes, since a rate
 * means little without its payee. Focus leaving the pair saves it, as for the
 * other two. The name completes from the pilot's Payees (and fills in that
 * Payee's rate), and the button opens the Tax tab, where the ledger shows what
 * is owed once the ore is in it.
 *
 * The fields start blank for each survey (only what the survey itself stored
 * comes back), so a tax is shown only when the pilot sets it.
 *
 * Shown on the owner's Survey tab only; everyone else gets the same line
 * read-only (`MoonTaxReadout`). Once the pilot is done editing, a complete
 * name and rate is also stored on the survey (`setSurveyTax`), so everyone with
 * the link sees it.
 */
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Modal, TextInput } from '@/components/ui';
import { InfoRow } from './InfoRow';
import { blockedButtonClassName, blockedReasonClassName } from './SurveyWaypointButton';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useSurveyPayeeId } from '@/features/miningTax/surveyPayeePref';
import { createPayee, loadPayees } from '@/features/miningTax/payees';
import { ensurePayee, findPayeeByName, MINING_TAX_HREF, parseTaxPct } from './moonTaxPayee';
import { setSurveyTax, type SurveyTaxShare } from './surveyStore';

/** The stored survey this row publishes its tax to, and what is already stored there. */
export interface TaxSurvey {
  id: string;
  expiresAt: number;
  published: SurveyTaxShare | null;
}

export function MoonTaxRow({ characterId, survey }: { characterId: number; survey?: TaxSurvey }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listId = useId();
  // Starts blank unless this survey already stored a tax: nothing carries over
  // from the last survey, so the pilot sets it for each field they want it on.
  const [saved, setSaved] = useState(() => ({
    name: survey?.published?.name ?? '',
    pct: survey?.published ? String(survey.published.pct) : '',
  }));
  const payees = useLiveQuery(() => loadPayees(characterId), [characterId]) ?? [];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Focus is inside the name/rate pair: nothing is stored until it leaves.
  const [focused, setFocused] = useState(false);
  const inFlight = useRef(false);

  const pct = parseTaxPct(saved.pct);
  const name = saved.name.trim();
  const ready = name !== '' && pct !== null;

  // Stored on the survey once focus leaves the pair. Best effort: a failed write
  // is not retried until the name or rate changes, and the local line is unaffected.
  const sent = useRef('');
  const surveyId = survey?.id;
  const surveyExpires = survey?.expiresAt;
  const published = survey?.published;
  useEffect(() => {
    if (surveyId === undefined || surveyExpires === undefined) return;
    if (focused || pct === null || name === '') return;
    if (published?.name === name && published.pct === pct) return;
    const key = `${surveyId}|${name}|${pct}`;
    if (sent.current === key) return;
    sent.current = key;
    void setSurveyTax({ id: surveyId, expiresAt: surveyExpires, name, pct }).catch(() => undefined);
  }, [surveyId, surveyExpires, published, focused, name, pct]);

  function changeName(next: string) {
    // Picking a known Payee brings its rate along; typing a new name keeps the rate.
    // Only when the name has just become a known Payee, so a rate typed after is kept.
    const known = findPayeeByName(payees, next);
    const fill = known !== undefined && known !== findPayeeByName(payees, saved.name);
    setSaved({ name: next, pct: fill ? String(known.defaultTaxPct) : saved.pct });
  }

  async function openTax() {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const payee = await ensurePayee(characterId, saved.name, pct);
      await useSurveyPayeeId.getState().setValue(payee.id);
      navigate(MINING_TAX_HREF);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Focus moving between the two fields keeps the pair focused; only leaving it stores.
  function leave(event: FocusEvent<HTMLInputElement>) {
    if (!event.currentTarget.closest('[data-tax-fields]')?.contains(event.relatedTarget)) {
      setFocused(false);
    }
  }

  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div data-tax-fields className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1">
            <TextInput
              size="sm"
              inputMode="decimal"
              aria-label={t('survey.moonTax.rate')}
              className="w-16 tabular-nums"
              value={saved.pct}
              placeholder="0"
              aria-invalid={saved.pct !== '' && pct === null}
              onChange={(event) => setSaved({ ...saved, pct: event.target.value })}
              onFocus={() => setFocused(true)}
              onBlur={leave}
            />
            <span className="text-text-dim">%</span>
          </span>
          <span className="text-text-dim">{t('survey.moonTax.to')}</span>
          <TextInput
            size="sm"
            list={listId}
            aria-label={t('survey.moonTax.payee')}
            className="w-56 max-w-full"
            value={saved.name}
            placeholder={t('survey.moonTax.payeePlaceholder')}
            onChange={(event) => changeName(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={leave}
          />
          <datalist id={listId}>
            {payees.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <Button
          size="sm"
          className="touch:min-h-11 sm:ml-auto"
          disabled={!ready}
          loading={busy}
          onClick={() => void openTax()}
        >
          {t('survey.moonTax.open')}
        </Button>
        {failed && (
          <span role="alert" className="w-full text-xs text-danger">
            {t('survey.moonTax.failed')}
          </span>
        )}
      </div>
    </InfoRow>
  );
}

/**
 * The read-only line, for everyone but the owner (in the app or on the public
 * page): the rate and who gets it, as the owner set them, and Manage Taxes into
 * the Tax tab. Logged out it is disabled with "Log in to access" right under it, like
 * Set waypoint. Logged in, a Payee of the viewer's by that name (any case) is
 * handed to the tab as is, keeping the viewer's own rate; without one, the
 * viewer is asked whether to add it at the owner's rate first. Declining still
 * opens the tab; closing the dialog stays here.
 */
export function MoonTaxReadout({ tax }: { tax: SurveyTaxShare }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const [addPayeeOpen, setAddPayeeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const hintId = useId();
  const loggedOut = characterId === null;

  /** One step at a time; a failure shows the alert. Resolves to the step's result, undefined when it didn't run or failed. */
  async function run<T>(step: (id: number) => Promise<T>): Promise<T | undefined> {
    if (characterId === null || inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      return await step(characterId);
    } catch {
      setFailed(true);
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function openTab(payeeId: string | null) {
    if (payeeId !== null) await useSurveyPayeeId.getState().setValue(payeeId);
    navigate(MINING_TAX_HREF);
  }

  async function open() {
    const missing = await run(async (id) => {
      const known = findPayeeByName(await loadPayees(id), tax.name);
      if (known) await openTab(known.id);
      return known === undefined;
    });
    // Opened once the lookup is done, so the dialog never starts out busy.
    if (missing) setAddPayeeOpen(true);
  }

  const addPayee = () =>
    run(async (id) => {
      // Looked up again: the Payee may have been added elsewhere while the dialog was open.
      const payee =
        findPayeeByName(await loadPayees(id), tax.name) ??
        (await createPayee(id, { name: tax.name.trim(), defaultTaxPct: tax.pct }));
      await openTab(payee.id);
    });

  const skip = () => run(() => openTab(null));

  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xl font-semibold">
          <span className="tabular-nums">{tax.pct}%</span>
          <span className="font-normal text-text-dim">{t('survey.moonTax.to')}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{tax.name}</span>
        </p>
        <div className={blockedButtonClassName}>
          <Button
            size="sm"
            className="touch:min-h-11"
            // Stays focusable with its reason linked, rather than the native attribute (DESIGN §6c Disabled).
            aria-disabled={loggedOut || undefined}
            aria-describedby={loggedOut ? hintId : undefined}
            loading={busy && !addPayeeOpen}
            onClick={() => void open()}
          >
            {t('survey.moonTax.manage')}
          </Button>
          {loggedOut && (
            <span id={hintId} className={blockedReasonClassName}>
              {t('survey.moonTax.needLogin')}
            </span>
          )}
        </div>
        {failed && !addPayeeOpen && (
          <span role="alert" className="w-full text-xs text-danger">
            {t('survey.moonTax.failed')}
          </span>
        )}
      </div>
      <Modal
        open={addPayeeOpen}
        onClose={() => {
          setAddPayeeOpen(false);
          setFailed(false);
        }}
        title={t('survey.moonTax.addPayee.title')}
      >
        <div className="flex flex-col gap-3">
          <p className="font-semibold">
            {t('survey.moonTax.addPayee.confirm', { name: tax.name, pct: tax.pct })}
          </p>
          <p className="text-sm text-text-dim">
            {t('survey.moonTax.addPayee.body', { name: tax.name })}
          </p>
          {failed && (
            <p role="alert" className="text-sm text-danger">
              {t('survey.moonTax.failed')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-disabled={busy || undefined}
              onClick={() => void skip()}
            >
              {t('survey.moonTax.addPayee.skip')}
            </Button>
            <Button variant="primary" size="sm" loading={busy} onClick={() => void addPayee()}>
              {t('survey.moonTax.addPayee.submit')}
            </Button>
          </div>
        </div>
      </Modal>
    </InfoRow>
  );
}
