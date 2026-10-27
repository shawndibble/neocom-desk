import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, InfoTooltip, Panel, TextInput } from '@/components/ui';
import { callableErrorText } from './feederErrorText';
import { InviteLinkField } from './InviteLinkField';
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
  onBack,
  onTurnedOn,
}: {
  characterId: number;
  corporationId: number;
  verdict: OfficerVerdict;
  onDone: () => void;
  collect?: boolean;
  earliestStart?: string;
  /** Back to the three-way choice. */
  onBack?: () => void;
  /** The book now exists (not for a collecting book): the page runs the first sync. */
  onTurnedOn?: () => void;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const leaveDay = earliestStart ?? null;
  // Untouched, it is the first day of this month in EVE time, never before the leave day.
  const monthStart = `${today.slice(0, 8)}01`;
  const [picked, setStartDate] = useState<string | null>(null);
  const startDate = picked ?? (leaveDay !== null && leaveDay > monthStart ? leaveDay : monthStart);
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
        if (!collect) onTurnedOn?.();
      }
      if (collect) {
        const { code } = await createFeederInvite(characterId, corporationId);
        setLink(inviteLink(window.location.origin, code));
      } else onDone();
    } catch (e) {
      setError(callableErrorText(t, e, 'corpTaxBook.moons.dialogs.failed'));
    } finally {
      setBusy(false);
    }
  };
  if (link !== null) {
    return (
      <Panel className="mx-auto max-w-md text-sm">
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{t('corpTaxBook.moons.setup.collect.ready')}</h2>
          <p className="text-text-dim">{t('corpTaxBook.moons.setup.collect.linkHint')}</p>
          <InviteLinkField url={link} />
          <Button variant="primary" onClick={onDone}>
            {t('corpTaxBook.moons.setup.collect.done')}
          </Button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel className="mx-auto max-w-md text-sm">
      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t('corpTaxBook.moons.off.title')}</h2>
        <p className="text-text-dim">{t('corpTaxBook.moons.off.intro')}</p>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-xs text-text-dim">
            <label htmlFor="turn-on-start">{t('corpTaxBook.moons.settings.startDate')}</label>
            <InfoTooltip
              label={t('common.aboutLabel', { label: t('corpTaxBook.moons.settings.startDate') })}
              content={t('corpTaxBook.moons.off.startHint')}
            />
          </span>
          <TextInput
            id="turn-on-start"
            type="date"
            max={today}
            {...(leaveDay !== null ? { min: leaveDay } : {})}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.off.rate')}</span>
          <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
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
        <div className="flex gap-2">
          {onBack && (
            <Button variant="ghost" onClick={onBack} disabled={busy}>
              {t('corpTaxBook.moons.setup.back')}
            </Button>
          )}
          <Button variant="primary" onClick={() => void submit()} disabled={!valid || busy}>
            {t('corpTaxBook.moons.off.confirm')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
