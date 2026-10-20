import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, TextInput } from '@/components/ui';
import { editErrorMessage } from './useBook';
import { turnOnBook, type OfficerVerdict } from '../taxBook/bookClient';

/** D10: a Director picks the start date (and the corp's default rate) to turn the book on. */
export function TurnOnBook({
  characterId,
  corporationId,
  verdict,
  onDone,
}: {
  characterId: number;
  corporationId: number;
  verdict: OfficerVerdict;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [rate, setRate] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!verdict.isDirector) {
    return (
      <EmptyState
        title={t('corpTaxBook.moons.off.title')}
        hint={t('corpTaxBook.moons.off.notDirector')}
      />
    );
  }
  const pct = Number(rate);
  const valid = startDate <= today && rate !== '' && pct >= 0 && pct <= 100;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await turnOnBook(characterId, corporationId, startDate, pct);
      onDone();
    } catch (e) {
      setError(editErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-xs border border-line bg-panel p-4 text-sm">
      <h2 className="text-base font-semibold">{t('corpTaxBook.moons.off.title')}</h2>
      <p className="text-text-dim">{t('corpTaxBook.moons.off.intro')}</p>
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.settings.startDate')}</span>
        <TextInput
          type="date"
          max={today}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.off.rate')}</span>
        <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </label>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.off.hint')}</p>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.off.needsRefineries')}</p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" onClick={() => void submit()} disabled={!valid || busy}>
        {t('corpTaxBook.moons.off.confirm')}
      </Button>
    </div>
  );
}
