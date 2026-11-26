import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel } from '@/components/ui';
import type { VerifyLedgerData } from '@/engine/corpTaxBook/verifyView';
import { isk, shortDate } from './noticeFormat';

export function VerifyLedger({ ledger }: { ledger: VerifyLedgerData }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () =>
      [
        ...ledger.days.map((d) => ({ key: `d${d.date}`, at: d.date, day: d })),
        ...ledger.payments.map((p) => ({ key: `p${p.id}`, at: p.at, payment: p })),
      ].sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key)),
    [ledger]
  );
  return (
    <CollapsiblePanel
      title={t('corpTaxBook.verify.ledger.title')}
      meta={<span className="text-xs text-text-dim">{t('corpTaxBook.verify.ledger.meta')}</span>}
      wrapMeta
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
      labels={{
        show: t('corpTaxBook.verify.ledger.show'),
        hide: t('corpTaxBook.verify.ledger.hide'),
      }}
      padded={false}
    >
      <ul aria-label={t('corpTaxBook.verify.ledger.title')} className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-baseline gap-3 px-3 py-2 text-sm">
            <span className="w-24 shrink-0 text-text-dim">{shortDate(r.at, i18n.language)}</span>
            {'day' in r ? (
              <>
                <span className="min-w-0 flex-1">{t('corpTaxBook.verify.ledger.mined')}</span>
                <span className="shrink-0 tabular-nums">{isk(r.day.tax)}</span>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  {t('corpTaxBook.verify.ledger.payment')}
                  <span className="block text-xs text-text-dim">
                    {t(`corpTaxBook.verify.source.${r.payment.source}`)}
                  </span>
                </span>
                <span className="shrink-0 text-isk-pos tabular-nums">+{isk(r.payment.amount)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}
