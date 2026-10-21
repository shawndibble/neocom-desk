import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, TextInput } from '@/components/ui';
import { editErrorMessage } from './useBook';
import { turnOnBook, type OfficerVerdict } from '../taxBook/bookClient';
import { createFeederInvite, inviteLink } from '../taxBook/feederClient';

/**
 * D10: a Director picks the start date (and the corp's default rate) to turn the book on.
 * With `collect`, the book is for collecting tax for other corporations: it needs no
 * refineries, and an invite link is made and shown before moving on. `earliestStart`: a
 * former moon owner's book starts no earlier than the day its coverage ended (the default).
 */
export function TurnOnBook({
  characterId,
  corporationId,
  verdict,
  onDone,
  collect = false,
  earliestStart,
}: {
  characterId: number;
  corporationId: number;
  verdict: OfficerVerdict;
  onDone: () => void;
  collect?: boolean;
  earliestStart?: string;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const leaveDay = earliestStart ?? null;
  // Untouched, it is the leave day once known (also the earliest pick), else today.
  const [picked, setStartDate] = useState<string | null>(null);
  const startDate = picked ?? leaveDay ?? today;
  const [rate, setRate] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  // The book exists once created: a retry after a failed invite makes only the invite.
  const booked = useRef(false);
  if (!verdict.isDirector) {
    return (
      <EmptyState
        title={t('corpTaxBook.moons.off.title')}
        hint={t('corpTaxBook.moons.off.notDirector')}
      />
    );
  }
  const pct = Number(rate);
  const valid =
    startDate <= today &&
    (leaveDay === null || startDate >= leaveDay) &&
    rate !== '' &&
    pct >= 0 &&
    pct <= 100;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!booked.current) {
        await turnOnBook(characterId, corporationId, startDate, pct);
        booked.current = true;
      }
      if (collect) {
        const { code } = await createFeederInvite(characterId, corporationId);
        setLink(inviteLink(window.location.origin, code));
      } else onDone();
    } catch (e) {
      const reason = (e as { details?: { reason?: unknown } } | null)?.details?.reason;
      setError(
        reason === 'start-before-leave'
          ? t('corpTaxBook.moons.off.startBeforeLeave')
          : editErrorMessage(e)
      );
    } finally {
      setBusy(false);
    }
  };
  if (link !== null) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-xs border border-line bg-panel p-4 text-sm">
        <h2 className="text-base font-semibold">{t('corpTaxBook.moons.setup.collect.ready')}</h2>
        <p className="text-text-dim">{t('corpTaxBook.moons.setup.collect.linkHint')}</p>
        <TextInput readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <Button variant="primary" onClick={onDone}>
          {t('corpTaxBook.moons.setup.collect.done')}
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-xs border border-line bg-panel p-4 text-sm">
      <h2 className="text-base font-semibold">{t('corpTaxBook.moons.off.title')}</h2>
      <p className="text-text-dim">{t('corpTaxBook.moons.off.intro')}</p>
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.settings.startDate')}</span>
        <TextInput
          type="date"
          max={today}
          {...(leaveDay !== null ? { min: leaveDay } : {})}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.off.rate')}</span>
        <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </label>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.off.hint')}</p>
      <p className="text-xs text-text-dim">
        {t(
          collect
            ? 'corpTaxBook.moons.setup.collect.noRefineries'
            : 'corpTaxBook.moons.off.needsRefineries'
        )}
      </p>
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
