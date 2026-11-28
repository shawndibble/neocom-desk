import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import {
  closedDayDifferences,
  type ClosedDayPlan,
  type FixTerms,
} from '@/engine/corpTaxBook/closedDayFix';
import type { OreLine } from '@/engine/miningTax/types';
import { formatCount } from '@/lib/formatCount';
import { Well } from '@/components/ui/Well';
import { closedConflictCorps, type ConflictNames } from './closedConflicts';
import { typeLabel } from './typeLabel';

const k = (key: string) => `miningTax.corpBook.closedConflict.${key}`;

const oreText = (names: ConflictNames) => (lines: readonly OreLine[]) =>
  lines.map((l) => `${formatCount(l.quantity)} ${typeLabel(names.typeNames, l.typeId)}`).join(', ');

export function ClosedDayFacts({ plan, names }: { plan: ClosedDayPlan; names: ConflictNames }) {
  const { t } = useTranslation();
  const ore = oreText(names);
  const allCorps = closedConflictCorps(plan, names);
  const corpsOf = (ids: readonly number[]) =>
    ids.length > 0 ? ids.map(names.corp).join(', ') : allCorps;
  const lines = closedDayDifferences(plan).map((d) => {
    switch (d.kind) {
      case 'overListed':
        return t(k('overListed'), {
          ore: ore(d.lines),
          payee: names.payee(d.payeeId),
          corp: names.corp(d.corporationId),
        });
      case 'elsewhere':
        return t(k('elsewhere'), {
          ore: ore(d.lines),
          payee: names.payee(d.payeeId),
          corp: corpsOf(d.corporationIds),
        });
      case 'unlisted':
        return t(k('unlisted'), { ore: ore(d.lines), corp: corpsOf(d.corporationIds) });
      case 'rate':
        return t(k('rate'), {
          corp: names.corp(d.corporationId),
          payee: names.payee(d.payeeId),
          book: d.book,
          yours: d.yours,
        });
    }
  });
  const payeeOf = new Map(plan.fixes.map((f) => [f.assignmentId, f.payeeId]));
  const paid = plan.blockers.map((b) =>
    b.kind === 'bookPayment'
      ? t(k('paidBook'), { corp: names.corp(b.corporationId) })
      : t(k('paidAssignment'), { payee: names.payee(payeeOf.get(b.assignmentId) ?? '') })
  );
  return (
    <>
      <ul className="list-disc space-y-0.5 pl-4">
        {(lines.length > 0 ? lines : [t(k('other'), { corp: allCorps })]).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {[...new Set(paid)].map((line) => (
        <p key={line} className="text-text-dim">
          {line}
        </p>
      ))}
    </>
  );
}

export function ClosedDayFixPreview({
  plan,
  names,
}: {
  plan: ClosedDayPlan;
  names: ConflictNames;
}) {
  const { t } = useTranslation();
  const ore = oreText(names);
  const terms = (x: FixTerms | null) =>
    x === null || x.oreLines.length === 0
      ? t(k('nothing'))
      : t(k('terms'), { ore: ore(x.oreLines), pct: x.taxPct });
  return (
    <div className="space-y-1 text-xs">
      <p className="text-text-dim">{t(k('previewTitle'))}</p>
      <ul className="space-y-0.5">
        {plan.fixes.map((f) => (
          <li key={f.assignmentId ?? `new:${f.payeeId}`}>
            {t(k('previewLine'), {
              payee: names.payee(f.payeeId),
              before: terms(f.before),
              after: terms(f.after),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface NoticeProps {
  plan: ClosedDayPlan;
  names: ConflictNames;
  countsFrom?: string;
  onFix: () => void;
  onResolve?: () => void;
  disputeAction?: ReactNode;
}

export function ClosedDayConflictNotice({
  plan,
  names,
  countsFrom,
  onFix,
  onResolve,
  disputeAction,
}: NoticeProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const corp = closedConflictCorps(plan, names);
  return (
    <Well tone="warning" role="region" aria-label={t(k('region'))} className="space-y-2 text-xs">
      <p className="font-semibold text-warning">{t(k('title'), { corp })}</p>
      <ClosedDayFacts plan={plan} names={names} />
      {countsFrom && <p className="text-text-dim">{countsFrom}</p>}
      <p className="text-text-dim">{t(k('fixHint'), { corp })}</p>
      {confirming && <ClosedDayFixPreview plan={plan} names={names} />}
      <div className="flex flex-wrap gap-2">
        {confirming ? (
          <>
            <Button size="sm" variant="primary" onClick={onFix}>
              {t(k('fix'))}
            </Button>
            <Button
              size="sm"

              onClick={() => setConfirming(false)}
            >
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="warning"

              onClick={() => setConfirming(true)}
            >
              {t(k('fix'))}
            </Button>
            {onResolve && (
              <Button size="sm" onClick={onResolve}>
                {t('miningTax.resolve.open')}
              </Button>
            )}
          </>
        )}
      </div>
      {disputeAction && (
        <div className="space-y-1">
          <p>{t(k('disagree'), { corp })}</p>
          {disputeAction}
        </div>
      )}
    </Well>
  );
}
