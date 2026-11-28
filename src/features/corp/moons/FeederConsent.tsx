import { parsePercent } from '@/lib/parsePercent';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, TextInput, Tooltip, Field, Fields } from '@/components/ui';
import { useEntityName } from '@/features/character/useEntityName';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { callableErrorReason } from '@/lib/callableError';
import { previewFeederInvite, type FeederInvitePreview } from '../taxBook/feederClient';

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
  error?: string | null;
  onContinue: (requestedRatePct: number | undefined) => void;
  onBack: () => void;
  loadPreview?: typeof previewFeederInvite;
}) {
  const { t } = useTranslation();
  const [rate, setRate] = useState('');
  const load = useCallback(
    () =>
      loadPreview(characterId, code).catch((e: unknown) => {
        if (callableErrorReason(e) === 'invite-invalid') return 'invalid' as const;
        throw e;
      }),
    [characterId, code, loadPreview]
  );
  const preview: FeederInvitePreview | 'invalid' | null = useAsyncLoad(load).data ?? null;
  const offer = preview !== null && preview !== 'invalid' ? preview : null;
  const publicName = useEntityName(
    offer && offer.collectorName === null ? offer.collectorCorporationId : undefined
  );
  const name = offer
    ? (offer.collectorName ?? publicName ?? `#${offer.collectorCorporationId}`)
    : null;
  const pct = parsePercent(rate) ?? NaN;
  const valid = rate.trim() === '' || (pct >= 0 && pct <= 100);
  const part = (key: 'sees' | 'cannot' | 'stop') => (
    <section className="space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-widest text-text-dim">
        {t(`corpTaxBook.moons.consent.${key}.title`)}
      </h3>
      <p>{t(`corpTaxBook.moons.consent.${key}.body`)}</p>
    </section>
  );
  return (
    <Panel className="mx-auto max-w-md text-sm">
      <div className="space-y-3">
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
        <Fields variant="stacked">
          <Field label={t('corpTaxBook.moons.consent.rate')}>
            <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </Fields>
        <p className="text-xs text-text-dim">{t('corpTaxBook.moons.consent.accountant')}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            {t('corpTaxBook.moons.setup.back')}
          </Button>
          <Tooltip content={!valid ? t('corpTaxBook.moons.consent.rateInvalid') : null}>
            <Button
              variant="primary"
              loading={busy}
              aria-disabled={!valid || preview === 'invalid' || undefined}
              onClick={() => onContinue(rate.trim() === '' ? undefined : pct)}
            >
              {t('corpTaxBook.moons.consent.continue')}
            </Button>
          </Tooltip>
        </div>
      </div>
    </Panel>
  );
}
