import { useTranslation } from 'react-i18next';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { buildBillBreakdown } from '@/engine/miningTax/billBreakdown';
import type { TaxPriceSource } from '@/engine/miningTax/priceBasis';
import { formatIsk } from '@/lib/isk';
import { useMiningTaxCompressedOre } from './oreForm';
import { hubForPayee } from './pricing';

export interface PriceBreakdownInput {
  assignment: MiningTaxAssignmentRecord;
  payee: PayeeRecord | undefined;
  systemName: string;
  typeNames: ReadonlyMap<number, string>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  priceSourcesFor?: (
    hubId: string | undefined,
    date: string
  ) => ReadonlyMap<number, TaxPriceSource>;
}

/**
 * The figures behind a bill estimate, and the text the More menu copies for a
 * chat with the landlord (issue #2832). Shared by the card and the row detail
 * modal so the formatting lives once.
 */
export function usePriceBreakdown({
  assignment,
  payee,
  systemName,
  typeNames,
  pricesFor,
  priceSourcesFor,
}: PriceBreakdownInput) {
  const { t } = useTranslation();
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  const hub = hubForPayee(payee?.hubId);
  const breakdown = buildBillBreakdown({
    oreLines: assignment.oreLines,
    unitPrices: pricesFor(payee?.hubId, assignment.date),
    sources: priceSourcesFor?.(payee?.hubId, assignment.date) ?? new Map(),
    oreLineValues: assignment.oreLineValues,
    taxPct: assignment.taxPct,
  });
  const form = t(
    compressed ? 'miningTax.detail.breakdown.compressed' : 'miningTax.detail.breakdown.raw'
  );
  const name = (typeId: number) => typeNames.get(typeId) ?? `#${typeId}`;
  const sourceLabel = (line: (typeof breakdown.lines)[number]) =>
    line.overridden
      ? t('miningTax.detail.breakdown.edited')
      : t(`miningTax.detail.breakdown.source.${line.source}`);
  const unitText = (unit: number | undefined) => (unit === undefined ? '—' : formatIsk(unit));
  const drifted = Math.round(breakdown.derivedValue) !== Math.round(assignment.estimatedValue);

  const text = [
    t('miningTax.detail.breakdown.headerText', {
      date: assignment.date,
      system: systemName,
      hub: hub.name,
      form,
      tax: assignment.taxPct,
    }),
    ...breakdown.lines.map((l) =>
      t('miningTax.detail.breakdown.lineText', {
        name: name(l.typeId),
        quantity: l.quantity.toLocaleString(),
        unit: unitText(l.overridden ? undefined : l.unitPrice),
        value: formatIsk(l.lineValue),
        source: sourceLabel(l),
      })
    ),
    t('miningTax.detail.breakdown.totalText', {
      value: formatIsk(assignment.estimatedValue),
      tax: formatIsk(assignment.taxOwed),
    }),
    ...(drifted ? [t('miningTax.detail.breakdown.driftText')] : []),
  ].join('\n');

  return { breakdown, hub, form, name, sourceLabel, unitText, drifted, text };
}
