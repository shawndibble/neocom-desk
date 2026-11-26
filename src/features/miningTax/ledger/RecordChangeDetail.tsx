import { useTranslation } from 'react-i18next';
import { ValueList, ValueRow } from '@/components/ui';
import type { AssignmentTerms, RecordChange } from '@/engine/miningTax/recordChanges';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import { OreLink } from '../OreIcon';

const isk = (value: number) => `${formatIsk(value)} ISK`;

function useRecordChangeText() {
  const { t } = useTranslation();
  return (key: string, opts?: Record<string, unknown>) =>
    t(`miningTax.ledger.detail.recordChange.${key}`, opts);
}

function Terms({
  label,
  terms,
  typeNames,
}: {
  label: string;
  terms: AssignmentTerms | null;
  typeNames?: ReadonlyMap<number, string> | undefined;
}) {
  const k = useRecordChangeText();
  return (
    <ValueList variant="plain">
      <ValueRow
        label={label}
        value={
          terms ? (
            k('terms', { pct: terms.taxPct, tax: isk(terms.taxOwed) })
          ) : (
            <span className="text-text-dim">{k('none')}</span>
          )
        }
      />
      {terms?.oreLines.map((o) => (
        <ValueRow
          key={o.typeId}
          label={<OreLink typeId={o.typeId}>{typeNames?.get(o.typeId) ?? `#${o.typeId}`}</OreLink>}
          value={formatCount(o.quantity)}
        />
      ))}
    </ValueList>
  );
}

export function RecordChangeDetail({
  change,
  typeNames,
}: {
  change: RecordChange;
  typeNames?: ReadonlyMap<number, string> | undefined;
}) {
  const k = useRecordChangeText();
  if (change.reason === 'tolerance') {
    const c = change.closeOut;
    return (
      <>
        <p className="text-text-dim">
          {k(c.exempt ? 'toleranceExempt' : 'tolerance', {
            date: change.date,
            pct: c.tolerancePct,
          })}
        </p>
        <ValueList variant="plain">
          <ValueRow label={k('billed')} value={isk(c.billed)} />
          <ValueRow label={k('paid')} value={isk(c.paid)} />
          <ValueRow label={k('writtenOff')} value={isk(c.writtenOff)} />
          <ValueRow label={k('limit')} value={isk(c.tolerance)} />
        </ValueList>
        <p className="text-xs text-text-dim">{k('kept')}</p>
      </>
    );
  }
  return (
    <>
      <p className="text-text-dim">{k(change.reason, { date: change.date })}</p>
      {change.assignments.map((a) => (
        <div key={a.assignmentId} className="space-y-1">
          <Terms label={k('before')} terms={a.before} typeNames={typeNames} />
          <Terms label={k('after')} terms={a.after} typeNames={typeNames} />
        </div>
      ))}
      <p className="text-xs text-text-dim">{k('kept')}</p>
    </>
  );
}
