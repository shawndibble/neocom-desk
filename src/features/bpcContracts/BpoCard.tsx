import { useTranslation } from 'react-i18next';
import { IskAmount, Tooltip } from '@/components/ui';
import type { BpoOffer } from './bpoAvailability';

interface BpoCardProps {
  bpo: BpoOffer;
  /** `bpoMayBeCheaper` against the cheapest comparable copy on screen. */
  mayBeCheaper: boolean;
  /** Station name of the BPO, `null` when unresolved (e.g. a player structure). */
  locationName: string | null;
  regionName: string;
}

/**
 * One blueprint original for sale, as a callout card beside Cheapest by
 * region (issue #1241) — said once for the picked blueprint rather than on
 * every copy row. Accent fill plus the written "BPO" label set it apart from
 * the region cells; the label is the signal, the tint only reinforces it
 * (DESIGN.md §7). Location truncates on a phone; its title carries the rest.
 */
export function BpoCard({ bpo, mayBeCheaper, locationName, regionName }: BpoCardProps) {
  const { t } = useTranslation();
  const where = locationName ?? regionName;
  const location =
    bpo.kind === 'market' && bpo.atHub
      ? t('bpcContracts.bpoLocationAtHub', { location: where, region: regionName })
      : t('bpcContracts.bpoLocation', { location: where, region: regionName });
  const source =
    bpo.kind === 'market'
      ? t('bpcContracts.bpoSourceMarket')
      : `${t('bpcContracts.bpoSourceContract')} · ${t('bpcContracts.bpoMeTe', { me: bpo.me, te: bpo.te })}`;

  return (
    <li className="flex min-w-0 flex-col gap-0.5 rounded-xs border border-accent-dim bg-accent/10 px-2.5 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
          {t(bpo.kind === 'market' ? 'bpcContracts.bpoCardMarket' : 'bpcContracts.bpoCardContract')}
        </span>
        {mayBeCheaper && (
          <Tooltip content={t('bpcContracts.bpoCardMayBeCheaperHint')} openOnTap>
            <button
              type="button"
              className="min-w-0 truncate rounded-xs text-[0.6875rem] font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t('bpcContracts.bpoMayBeCheaper')}
            </button>
          </Tooltip>
        )}
      </span>
      <span className="text-sm tabular-nums">
        <IskAmount value={bpo.price} revealOn="tap" />
      </span>
      <span className="truncate text-[0.6875rem] text-text-dim" title={location}>
        {location}
      </span>
      <span className="truncate text-[0.6875rem] text-text-dim">{source}</span>
    </li>
  );
}
