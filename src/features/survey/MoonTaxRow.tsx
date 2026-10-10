/**
 * Moon ore is taxed by whoever owns the moon, so a Survey that shows any asks
 * who and at what rate, and hands both to the Moon Mining Tax tab. It is the
 * Moon tax row of the Additional information panel (`SurveyInfoPanel`) and reads
 * as one line of text, "8% to Moon Corp"; clicking the rate or the name turns both into fields (the one
 * clicked has focus), since a rate means little without its payee. Enter, or
 * focus leaving the pair, saves. The name completes from the pilot's Payees (and
 * fills in that Payee's rate), and the link opens the Tax tab, where the ledger
 * shows what is owed once the ore is in it.
 *
 * The fields start blank for each survey (only what the survey itself stored
 * comes back), so a tax is shown only when the pilot sets it.
 *
 * Shown on the creator's Survey tab only; the public page shows the same line
 * read-only (`MoonTaxReadout`). Once the pilot is done editing, a complete
 * name and rate is also stored on the survey (`setSurveyTax`), so everyone with
 * the link sees it.
 */
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, buttonClassName, TextInput } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { InfoRow } from './InfoRow';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import * as Icon from '@/components/ui/icons';
import { useSurveyPayeeId } from '@/features/miningTax/surveyPayeePref';
import { loadPayees } from '@/features/miningTax/payees';
import { ensurePayee, findPayeeByName, MINING_TAX_HREF, parseTaxPct } from './moonTaxPayee';
import { setSurveyTax, type SurveyTaxShare } from './surveyStore';

// Accent text is clickable and the faint pencil after it says "edit in place" (DESIGN.md §6c);
// `touch:min-h-11` keeps the phone target at 44px.
const editClassName = cx(
  'inline-flex items-center gap-1.5 rounded-xs text-left text-accent hover:underline touch:min-h-11',
  focusRingClassName
);

function Pencil() {
  return <Icon.Rename aria-hidden className="size-[0.6em] shrink-0 text-text-dim" />;
}

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
  // Which field was clicked: both show while editing, and this one takes focus.
  const [editing, setEditing] = useState<'name' | 'pct' | null>(null);
  const inFlight = useRef(false);
  const rateButton = useRef<HTMLButtonElement>(null);
  const payeeButton = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();

  const pct = parseTaxPct(saved.pct);
  const name = saved.name.trim();
  const ready = name !== '' && pct !== null;

  // Stored on the survey once editing stops. Best effort: a failed write is
  // not retried until the name or rate changes, and the local line is unaffected.
  const sent = useRef('');
  const surveyId = survey?.id;
  const surveyExpires = survey?.expiresAt;
  const published = survey?.published;
  useEffect(() => {
    if (surveyId === undefined || surveyExpires === undefined) return;
    if (editing !== null || pct === null || name === '') return;
    if (published?.name === name && published.pct === pct) return;
    const key = `${surveyId}|${name}|${pct}`;
    if (sent.current === key) return;
    sent.current = key;
    void setSurveyTax({ id: surveyId, expiresAt: surveyExpires, name, pct }).catch(() => undefined);
  }, [surveyId, surveyExpires, published, editing, name, pct]);

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

  // Focus moving between the two fields keeps editing; only leaving the pair ends it.
  function stopOnBlur(event: FocusEvent<HTMLInputElement>) {
    if (!event.currentTarget.closest('[data-tax-fields]')?.contains(event.relatedTarget)) {
      setEditing(null);
    }
  }

  function stopOnKey(event: KeyboardEvent<HTMLInputElement>, field: 'name' | 'pct') {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    setEditing(null);
    // The field unmounts: hand focus to the button that replaces it.
    focusAfterCommit(field === 'pct' ? rateButton : payeeButton);
  }

  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          data-tax-fields
          className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold"
        >
          {editing !== null ? (
            <span className="flex items-center gap-1">
              <TextInput
                autoFocus={editing === 'pct'}
                size="sm"
                inputMode="decimal"
                aria-label={t('survey.moonTax.rate')}
                className="w-16 tabular-nums"
                value={saved.pct}
                placeholder="0"
                aria-invalid={saved.pct !== '' && pct === null}
                onChange={(event) => setSaved({ ...saved, pct: event.target.value })}
                onBlur={stopOnBlur}
                onKeyDown={(event) => stopOnKey(event, 'pct')}
              />
              <span className="text-text-dim">%</span>
            </span>
          ) : (
            <button
              ref={rateButton}
              type="button"
              className={`${editClassName} tabular-nums`}
              aria-label={t('survey.moonTax.rateButton', {
                value: saved.pct === '' ? t('survey.moonTax.noRate') : `${saved.pct}%`,
              })}
              onClick={() => setEditing('pct')}
            >
              {saved.pct === '' ? t('survey.moonTax.noRate') : `${saved.pct}%`}
              <Pencil />
            </button>
          )}
          <span className="font-normal text-text-dim">{t('survey.moonTax.to')}</span>
          {editing !== null ? (
            <>
              <TextInput
                autoFocus={editing === 'name'}
                size="sm"
                list={listId}
                aria-label={t('survey.moonTax.payee')}
                className="w-56 max-w-full"
                value={saved.name}
                placeholder={t('survey.moonTax.payeePlaceholder')}
                onChange={(event) => changeName(event.target.value)}
                onBlur={stopOnBlur}
                onKeyDown={(event) => stopOnKey(event, 'name')}
              />
              <datalist id={listId}>
                {payees.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </>
          ) : (
            <button
              ref={payeeButton}
              type="button"
              className={`${editClassName} min-w-0 [overflow-wrap:anywhere]`}
              aria-label={t('survey.moonTax.payeeButton', {
                value: name === '' ? t('survey.moonTax.set') : saved.name,
              })}
              onClick={() => setEditing('name')}
            >
              {name === '' ? t('survey.moonTax.set') : saved.name}
              <Pencil />
            </button>
          )}
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

/** The public page's read-only line: the rate and who gets it, as the creator set them, and a way into the Tax tab. */
export function MoonTaxReadout({ tax }: { tax: SurveyTaxShare }) {
  const { t } = useTranslation();
  return (
    <InfoRow label={t('survey.moonTax.label')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xl font-semibold">
          <span className="tabular-nums">{tax.pct}%</span>
          <span className="font-normal text-text-dim">{t('survey.moonTax.to')}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{tax.name}</span>
        </p>
        {/* The Tax tab sits behind the login gate, so a logged-out visitor is sent to log in first. */}
        <Link
          to={MINING_TAX_HREF}
          // Stashed so a logged-out visitor, sent to log in by the gate, lands back on the Tax tab.
          onClick={() => setLoginReturnTo(MINING_TAX_HREF)}
          className={buttonClassName({ size: 'sm', className: 'touch:min-h-11 sm:ml-auto' })}
        >
          {t('survey.moonTax.manage')}
        </Link>
      </div>
    </InfoRow>
  );
}
