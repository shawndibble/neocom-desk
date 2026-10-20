import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextInput } from '@/components/ui';

/**
 * What an accounting corporation will see, what it cannot do, how to stop it,
 * and the one optional rate. Deliberately short. A blank rate is a complete
 * grant; the grant is a separate EVE login by an Accountant, so this screen only
 * collects the rate and sends the player there.
 */
export function FeederConsent({
  busy,
  onContinue,
  onBack,
}: {
  busy: boolean;
  onContinue: (requestedRatePct: number | undefined) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [rate, setRate] = useState('');
  const pct = Number(rate);
  const valid = rate.trim() === '' || (Number.isFinite(pct) && pct >= 0 && pct <= 100);
  const part = (key: 'sees' | 'cannot' | 'stop') => (
    <section className="space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-dim">
        {t(`corpTaxBook.moons.consent.${key}.title`)}
      </h3>
      <p>{t(`corpTaxBook.moons.consent.${key}.body`)}</p>
    </section>
  );
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-xs border border-line bg-panel p-4 text-sm">
      <h2 className="text-base font-semibold">{t('corpTaxBook.moons.consent.title')}</h2>
      {part('sees')}
      {part('cannot')}
      {part('stop')}
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.consent.moonNames')}</p>
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.consent.rate')}</span>
        <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </label>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.consent.accountant')}</p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          {t('corpTaxBook.moons.setup.back')}
        </Button>
        <Button
          variant="primary"
          disabled={!valid || busy}
          onClick={() => onContinue(rate.trim() === '' ? undefined : pct)}
        >
          {t('corpTaxBook.moons.consent.continue')}
        </Button>
      </div>
    </div>
  );
}
