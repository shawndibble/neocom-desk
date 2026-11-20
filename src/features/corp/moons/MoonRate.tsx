import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextInput } from '@/components/ui';
import {
  earliestRateStart,
  resolveRate,
  type RateContext,
  type TaxRate,
} from '@/engine/corpTaxBook/rates';
import { utcDay } from '@/engine/localDay';
import { DialogShell, Effect, Label } from './BookDialogs';
import { dateWithYear } from './moonsFormat';
import { datedRateReady } from './rateForm';
import { useBook } from './useBook';

/** What the rate is set on: a moon the book knows, else the refinery (an idle one with no Extraction yet). */
export interface RateTarget {
  structureId: number;
  moonId?: number;
}

const contextFor = (target: RateTarget, date: string, isGuest: boolean): RateContext => ({
  date,
  minerId: '',
  moonId: target.moonId,
  structureId: target.structureId,
  recordKey: '',
  isGuest,
});

/**
 * The rate in force on a moon's page and where it comes from, with a Change rate button for an
 * officer who can edit (#6322). It writes the same dated `addRate` as Settings > Rates, so each
 * shows the other's rate. The scope is the moon's, or the refinery's when no moon is known;
 * the officer is told which, never asked.
 */
export function MoonRate({ target }: { target: RateTarget }) {
  const { t } = useTranslation();
  const { view, canEdit } = useBook();
  const [changing, setChanging] = useState(false);
  const today = utcDay();
  const rates = view.input.rates;
  const member = resolveRate(rates, contextFor(target, today, false));
  const guest = resolveRate(rates, contextFor(target, today, true));
  const own = (r: TaxRate) =>
    target.moonId !== undefined
      ? r.scope === 'moon' && r.moonId === target.moonId
      : r.scope === 'structure' && r.structureId === target.structureId;
  const scheduled = rates
    .filter(
      (r): r is Exclude<TaxRate, { scope: 'record' }> =>
        r.scope !== 'record' && own(r) && r.effectiveFrom > today
    )
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  const minerRates = rates.some((r) => r.scope === 'miner');
  const scopeWord = t(
    target.moonId !== undefined
      ? 'corpTaxBook.moons.rate.thisMoon'
      : 'corpTaxBook.moons.rate.thisRefinery'
  );
  return (
    <section
      aria-label={t('corpTaxBook.moons.rate.label')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xs border border-line px-3 py-2 text-sm"
    >
      <div className="min-w-0 flex-1 basis-60 space-y-0.5">
        {member ? (
          <p>
            <span className="text-xs text-text-dim">{t('corpTaxBook.moons.rate.label')} </span>
            <strong className="tabular-nums">{member.pct}%</strong>
            {guest && guest.pct !== member.pct && (
              <span className="text-text-dim tabular-nums">
                {' · '}
                {t('corpTaxBook.moons.rate.guests', { pct: guest.pct })}
              </span>
            )}
            <span className="text-text-dim">
              {' · '}
              {t(`corpTaxBook.moons.rate.source.${member.scope}`, { scope: scopeWord })}
              {member.effectiveFrom &&
                ` · ${t('corpTaxBook.moons.rate.since', { date: dateWithYear(member.effectiveFrom) })}`}
            </span>
          </p>
        ) : (
          <p className="text-text-dim">{t('corpTaxBook.moons.rate.none')}</p>
        )}
        {scheduled && (
          <p className="text-xs text-text-dim tabular-nums">
            {t('corpTaxBook.moons.rate.scheduled', {
              pct: scheduled.pct,
              date: dateWithYear(scheduled.effectiveFrom),
            })}
          </p>
        )}
        {minerRates && (
          <p className="text-xs text-text-dim">{t('corpTaxBook.moons.rate.minerWins')}</p>
        )}
      </div>
      {canEdit && (
        <Button onClick={() => setChanging(true)}>{t('corpTaxBook.moons.rate.change')}</Button>
      )}
      {changing && (
        <ChangeRateDialog
          target={target}
          scopeWord={scopeWord}
          current={member?.pct ?? null}
          onClose={() => setChanging(false)}
        />
      )}
    </section>
  );
}

function ChangeRateDialog({
  target,
  scopeWord,
  current,
  onClose,
}: {
  target: RateTarget;
  scopeWord: string;
  current: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { edit } = useBook();
  const today = utcDay();
  const [pct, setPct] = useState('');
  const [from, setFrom] = useState(today);
  const ready = datedRateReady(pct, from, today);
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corpTaxBook.moons.rate.dialogTitle', { scope: scopeWord })}
      confirmLabel={t('corpTaxBook.moons.rate.save')}
      canConfirm={ready}
      showLogged="plain"
      run={async () => {
        const base = { pct: Number(pct), effectiveFrom: from };
        await edit({
          action: 'addRate',
          rate:
            target.moonId !== undefined
              ? { scope: 'moon', moonId: target.moonId, ...base }
              : { scope: 'structure', structureId: target.structureId, ...base },
        });
      }}
    >
      <p className="text-text-dim">{t('corpTaxBook.moons.rate.appliesTo', { scope: scopeWord })}</p>
      <Label text={t('corpTaxBook.moons.settings.pct')}>
        <TextInput
          className="w-full"
          inputMode="decimal"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
      </Label>
      <Label text={t('corpTaxBook.moons.settings.effectiveFrom')}>
        <TextInput
          className="w-full"
          type="date"
          min={earliestRateStart(today)}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </Label>
      {ready && (
        <Effect>
          {current !== null && `${current}% → `}
          <strong>{Number(pct)}%</strong>
          {' · '}
          {t('corpTaxBook.moons.rate.effect', { date: dateWithYear(from) })}
        </Effect>
      )}
    </DialogShell>
  );
}
