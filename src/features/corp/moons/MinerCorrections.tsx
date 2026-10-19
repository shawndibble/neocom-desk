import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import type { DayRow, MinerRow } from '@/engine/corpTaxBook/bookView';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { AdjustmentDialog, RateOverrideDialog, RebillDialog } from './CorrectionDialogs';
import { isk, shortDate } from './moonsFormat';
import { useBook } from './useBook';

/**
 * A Miner's corrections (D31, D22, issue #4194): a per-record rate, a
 * correction line for the next Statement, and Rebill from date. Each is a
 * logged officer action; the list shows the correction lines already given.
 */
export function MinerCorrections({
  miner,
  days,
  statements,
}: {
  miner: MinerRow;
  days: readonly DayRow[];
  statements: readonly Statement[];
}) {
  const { t } = useTranslation();
  const { names, canEdit, data, view } = useBook();
  const [dialog, setDialog] = useState<'rate' | 'adjust' | 'rebill' | null>(null);
  const lines = data.adjustments.filter((a) => a.minerId === miner.id);
  const name = names.character(miner.mainCharacterId);
  if (!canEdit && lines.length === 0) return null;
  return (
    <Panel
      title={t('corpTaxBook.moons.corrections.title')}
      meta={
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.corrections.hint')}</span>
      }
      actions={
        canEdit ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setDialog('rate')}>
              {t('corpTaxBook.moons.corrections.rate.open')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog('adjust')}>
              {t('corpTaxBook.moons.corrections.adjust.open')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog('rebill')}>
              {t('corpTaxBook.moons.corrections.rebill.open')}
            </Button>
          </span>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <p className="text-sm text-text-dim">{t('corpTaxBook.moons.corrections.none')}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {lines.map((a) => (
            <li key={a.id} className="flex justify-between gap-3">
              <span>
                {a.reason}
                <span className="block text-xs text-text-dim">
                  {names.character(a.by)}, {shortDate(a.at)} · {shortDate(a.date)}
                </span>
              </span>
              <span className={a.amount < 0 ? 'text-isk-pos tabular-nums' : 'tabular-nums'}>
                {isk(a.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dialog === 'rate' && <RateOverrideDialog open onClose={() => setDialog(null)} days={days} />}
      {dialog === 'adjust' && (
        <AdjustmentDialog
          open
          onClose={() => setDialog(null)}
          miner={miner}
          minerName={name}
          defaultDate={view.billableThrough ?? data.settings.startDate}
        />
      )}
      {dialog === 'rebill' && (
        <RebillDialog
          open
          onClose={() => setDialog(null)}
          miner={miner}
          minerName={name}
          statements={statements as Statement[]}
        />
      )}
    </Panel>
  );
}
