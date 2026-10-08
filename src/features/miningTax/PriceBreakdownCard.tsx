import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { buildBillBreakdown } from '@/engine/miningTax/billBreakdown';
import type { TaxPriceSource } from '@/engine/miningTax/priceBasis';
import { formatIsk } from '@/lib/isk';
import { writeToClipboard } from '@/lib/clipboard';
import { useMiningTaxCompressedOre } from './oreForm';
import { hubForPayee } from './pricing';
import { OreLink } from './OreIcon';

interface PriceBreakdownCardProps {
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
 * What the estimate was built from — per-ore unit price and where it came
 * from, the hub, the ore form and the tax % — with a Copy to paste into a
 * chat with the landlord when their bill differs (issue #2832). The corp's
 * own figures are unreadable without the Accountant role, so this is the
 * player's half of the conversation. Unit prices are re-derived for the
 * mined date, not frozen with the bill, so the frozen total is what the copy
 * ends with and any drift is called out.
 */
export function PriceBreakdownCard({
  assignment,
  payee,
  systemName,
  typeNames,
  pricesFor,
  priceSourcesFor,
}: PriceBreakdownCardProps) {
  const { t } = useTranslation();
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

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

  return (
    <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.detail.breakdown.title')}
        </p>
        <Button
          size="sm"
          onClick={() => {
            void writeToClipboard(text);
            setCopied(true);
          }}
        >
          {copied ? (
            <Icon.Done size={Icon.ICON_SIZE.sm} />
          ) : (
            <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
          )}
          {t(copied ? 'miningTax.detail.breakdown.copied' : 'miningTax.detail.breakdown.copy')}
        </Button>
      </div>
      <p className="text-xs text-text-dim">
        {t('miningTax.detail.breakdown.summary', {
          hub: hub.name,
          form,
          tax: assignment.taxPct,
        })}
      </p>
      <ul className="divide-y divide-line text-xs">
        {breakdown.lines.map((l) => (
          <li key={l.typeId} className="flex flex-wrap items-baseline gap-x-2 py-1">
            <span className="min-w-0 flex-1 truncate">
              <OreLink typeId={l.typeId}>{name(l.typeId)}</OreLink>
            </span>
            <span className="tabular-nums text-text-dim">
              {l.quantity.toLocaleString()} × {unitText(l.overridden ? undefined : l.unitPrice)}
            </span>
            <span className="text-text-dim">{sourceLabel(l)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-dim">
        {drifted
          ? t('miningTax.detail.breakdown.drift', { value: formatIsk(assignment.estimatedValue) })
          : t('miningTax.detail.breakdown.caveat')}
      </p>
    </div>
  );
}
