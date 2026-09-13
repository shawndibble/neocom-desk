/**
 * The market-value figure under a contract's item list (issue #717): what the
 * bundle costs to buy outright at a Trade Hub right now, so a reader can hold
 * the asking price against it.
 *
 * Neutral color, never `isk-pos`/`isk-neg` — those tokens signal a gain or a
 * loss *to this character*, and a contract alone doesn't say which side of it
 * the reader would be on. Coloring the number either way would be a wrong
 * signal, not just a missing one.
 *
 * Shared by both contract detail modals — the character-scoped one and the
 * public one — because the figure means the same thing on either.
 */
import { useTranslation } from 'react-i18next';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import type { ContractMarketValue } from '@/features/character/contractMarketValue';

export function ContractMarketValueRow({
  value,
  hubName,
}: {
  value: ContractMarketValue;
  hubName: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5">
      <span className="text-text-dim">{t('contracts.detailMarketValue', { hub: hubName })}</span>
      <span className="tabular-nums font-semibold">
        {formatIskAuto(value.total, CONTRACT_ISK_CENTS_BELOW)}
        {value.unpriced > 0 && (
          <span className="ml-1.5 font-normal text-text-dim">
            {t('contracts.detailMarketValueUnpriced', { count: value.unpriced })}
          </span>
        )}
      </span>
    </div>
  );
}
