import { useTranslation } from 'react-i18next';
import { ValueList, ValueRow } from '@/components/ui';
import type { AssignmentTerms, RecordChange } from '@/engine/miningTax/recordChanges';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';

const isk = (value: number) => `${formatIsk(value)} ISK`;

function Terms({
  terms,
  typeNames,
}: {
  terms: AssignmentTerms | null;
  typeNames?: ReadonlyMap<number, string> | undefined;
}) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) =>
    t(`miningTax.ledger.detail.recordChange.${key}`, opts);
  if (!terms) return <span className="text-text-dim">{k('none')}</span>;
  const ore = terms.oreLines
    .map((l) => `${formatCount(l.quantity)} ${typeNames?.get(l.typeId) ?? `#${l.typeId}`}`)
    .join(', ');
  return (
    <span>
      {k('terms', { pct: terms.taxPct, tax: isk(terms.taxOwed) })}
      {ore && <span className="block text-xs text-text-dim">{ore}</span>}
    </span>
  );
}

export function RecordChangeDetail({
  change,
  typeNames,
}: {
  change: RecordChange;
  typeNames?: ReadonlyMap<number, string> | undefined;
}) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) =>
    t(`miningTax.ledger.detail.recordChange.${key}`, opts);
  if (change.reason === 'tolerance') {
    const c = change.closeOut;
    return (
      <>
        <p className="text-text-dim">
          {k('tolerance', { date: change.date, pct: c.tolerancePct })}
        </p>
        <ValueList variant="plain">
          <ValueRow label={k('billed')} value={isk(c.billed)} />
          <ValueRow label={k('paid')} value={isk(c.paid)} />
          <ValueRow label={k('writtenOff')} value={isk(c.writtenOff)} />
        </ValueList>
        <p className="text-xs text-text-dim">{k('kept')}</p>
      </>
    );
  }
  return (
    <>
      <p className="text-text-dim">{k(change.reason, { date: change.date })}</p>
      {change.assignments.map((a) => (
        <ValueList key={a.assignmentId} variant="plain">
          <ValueRow label={k('before')} value={<Terms terms={a.before} typeNames={typeNames} />} />
          <ValueRow label={k('after')} value={<Terms terms={a.after} typeNames={typeNames} />} />
        </ValueList>
      ))}
      <p className="text-xs text-text-dim">{k('kept')}</p>
    </>
  );
}
