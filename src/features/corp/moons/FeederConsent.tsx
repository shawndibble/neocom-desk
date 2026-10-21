import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextInput } from '@/components/ui';
import { useEntityName } from '@/features/character/useEntityName';
import { previewFeederInvite, type FeederInvitePreview } from '../taxBook/feederClient';

/**
 * What an accounting corporation will see, what it cannot do, how to stop it,
 * and the one optional rate. Deliberately short. A blank rate is a complete
 * grant; the grant is a separate EVE login by an Accountant, so this screen only
 * collects the rate and sends the player there.
 */
export function FeederConsent({
  characterId,
  code,
  busy,
  error,
  onContinue,
  onBack,
  loadPreview = previewFeederInvite,
}: {
  characterId: number;
  code: string;
  busy: boolean;
  /** Why the EVE login could not start, as text. */
  error?: string | null;
  onContinue: (requestedRatePct: number | undefined) => void;
  onBack: () => void;
  /** Reads who the link is from; a seam for stories. */
  loadPreview?: typeof previewFeederInvite;
}) {
  const { t } = useTranslation();
  const [rate, setRate] = useState('');
  // Who the link is from and what it offers; a preview that cannot load leaves the screen as it was.
  const [preview, setPreview] = useState<FeederInvitePreview | 'invalid' | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPreview(characterId, code).then(
      (p) => {
        if (!cancelled) setPreview(p);
      },
      (e: unknown) => {
        const reason = (e as { details?: { reason?: unknown } } | null)?.details?.reason;
        if (!cancelled && reason === 'invite-invalid') setPreview('invalid');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, code, loadPreview]);
  const offer = preview !== null && preview !== 'invalid' ? preview : null;
  const publicName = useEntityName(
    offer && offer.collectorName === null ? offer.collectorCorporationId : undefined
  );
  const name = offer
    ? (offer.collectorName ?? publicName ?? `#${offer.collectorCorporationId}`)
    : null;
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
      {preview === 'invalid' && (
        <p role="alert" className="text-danger">
          {t('corpTaxBook.moons.setup.failed.invite-invalid')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {name !== null && (
        <p>
          {t('corpTaxBook.moons.consent.from', { name })}
          {offer?.offeredOwnerRatePct != null &&
            ` ${t('corpTaxBook.moons.consent.offered', { pct: offer.offeredOwnerRatePct })}`}
        </p>
      )}
      {part('sees')}
      {part('cannot')}
      {part('stop')}
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
          disabled={!valid || busy || preview === 'invalid'}
          onClick={() => onContinue(rate.trim() === '' ? undefined : pct)}
        >
          {t('corpTaxBook.moons.consent.continue')}
        </Button>
      </div>
    </div>
  );
}
