/**
 * Moon ore is taxed by whoever owns the moon, so a Survey that shows any asks
 * who and at what rate, and hands both to the Moon Mining Tax tab: the name
 * completes from the pilot's Payees (and fills in that Payee's rate), and the
 * link opens the Tax tab filtered to them, where the ledger shows what is
 * owed once the ore is in it. Shown on the creator's Survey tab only; the
 * public page has no pilot to tax.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, TextInput } from '@/components/ui';
import { useSurveyPayeeId } from '@/features/miningTax/surveyPayeePref';
import { loadPayees } from '@/features/miningTax/payees';
import { ensurePayee, findPayeeByName, MINING_TAX_HREF, parseTaxPct } from './moonTaxPayee';
import { useSurveyTax } from './surveyTaxPref';

export function MoonTaxRow({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listId = useId();
  const saved = useSurveyTax((s) => s.value);
  const setSaved = useSurveyTax((s) => s.setValue);
  const hydrate = useSurveyTax((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  const payees = useLiveQuery(() => loadPayees(characterId), [characterId]) ?? [];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const pct = parseTaxPct(saved.pct);
  const ready = saved.name.trim() !== '' && pct !== null;

  function changeName(name: string) {
    // Picking a known Payee brings its rate along; typing a new name keeps the rate.
    // Only when the name has just become a known Payee, so a rate typed after is kept.
    const known = findPayeeByName(payees, name);
    const fill = known !== undefined && known !== findPayeeByName(payees, saved.name);
    void setSaved({ name, pct: fill ? String(known.defaultTaxPct) : saved.pct });
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

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="w-full text-text-dim sm:w-auto">{t('survey.moonTax.label')}</span>
      <label htmlFor={`${listId}-name`} className="sr-only">
        {t('survey.moonTax.payee')}
      </label>
      <TextInput
        id={`${listId}-name`}
        size="sm"
        list={listId}
        className="w-full sm:w-48"
        value={saved.name}
        placeholder={t('survey.moonTax.payeePlaceholder')}
        onChange={(event) => changeName(event.target.value)}
      />
      <datalist id={listId}>
        {payees.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <label htmlFor={`${listId}-pct`} className="sr-only">
        {t('survey.moonTax.rate')}
      </label>
      <span className="flex items-center gap-1">
        <TextInput
          id={`${listId}-pct`}
          size="sm"
          inputMode="decimal"
          className="w-16 tabular-nums"
          value={saved.pct}
          placeholder="0"
          aria-invalid={saved.pct !== '' && pct === null}
          onChange={(event) => void setSaved({ ...saved, pct: event.target.value })}
        />
        <span className="text-text-dim">%</span>
      </span>
      <Button size="sm" disabled={!ready} loading={busy} onClick={() => void openTax()}>
        {t('survey.moonTax.open')}
      </Button>
      {failed && (
        <span role="alert" className="text-xs text-danger">
          {t('survey.moonTax.failed')}
        </span>
      )}
    </div>
  );
}
