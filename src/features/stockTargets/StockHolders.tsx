/**
 * Who holds a Stock row's Listed and In hangar counts (#5594): one holder reads
 * "40 · [portrait] Name"; several read "20 · [portraits] 2 characters" and open
 * the per-Character split. Attribution only, the counts are unchanged.
 */
import { useTranslation } from 'react-i18next';
import { CharacterAvatar, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import type { HolderCount } from '@/engine/stockTargets/onHand';
import { formatNumber } from '@/lib/numberLocale';

/** CharacterAvatar's smallest box is 28px: a cell wants 16px. */
function HolderPortrait({ characterId }: { characterId: number }) {
  return (
    <span className="inline-flex shrink-0 align-middle [&>img]:size-4">
      <CharacterAvatar characterId={characterId} size="sm" loading="lazy" />
    </span>
  );
}

export function StockHolders({
  total,
  holders,
  heading,
  nameOf,
}: {
  total: number;
  holders: readonly HolderCount[];
  /** The popover's title: "Listed by" or "Ready to list with". */
  heading: string;
  nameOf: (characterId: number) => string;
}) {
  const { t } = useTranslation();
  if (holders.length === 0) return <>{formatNumber(total)}</>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      {formatNumber(total)}
      <span className="text-text-dim">·</span>
      {holders.length === 1 ? (
        <span className="inline-flex items-center gap-1 text-xs text-text-dim">
          <HolderPortrait characterId={holders[0].characterId} />
          <span className="max-sm:sr-only">{nameOf(holders[0].characterId)}</span>
        </span>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-6 items-center gap-1 px-1 text-xs text-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="inline-flex -space-x-1.5">
                {holders.map((holder) => (
                  <HolderPortrait key={holder.characterId} characterId={holder.characterId} />
                ))}
              </span>
              <span className="max-sm:sr-only">
                {t('stockTargets.holders.characters', { count: holders.length })}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end">
            {/* A portalled popover still bubbles React events to the row (Show Info). */}
            <div
              className="flex min-w-48 flex-col gap-1 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-text-dim">{heading}</span>
              {holders.map((holder) => (
                <span key={holder.characterId} className="flex items-center gap-2">
                  <HolderPortrait characterId={holder.characterId} />
                  <span className="flex-1">{nameOf(holder.characterId)}</span>
                  <span className="tabular-nums">{formatNumber(holder.quantity)}</span>
                </span>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** "Listing here: [portrait] Name, ..." under the market title: which alts this market belongs to. */
export function ListingHereLine({
  characterIds,
  nameOf,
}: {
  characterIds: readonly number[];
  nameOf: (characterId: number) => string;
}) {
  const { t } = useTranslation();
  if (characterIds.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-dim">
      <span>{t('stockTargets.holders.listingHere')}</span>
      {characterIds.map((id, i) => (
        <span key={id} className="inline-flex items-center gap-1">
          <HolderPortrait characterId={id} />
          {nameOf(id)}
          {i < characterIds.length - 1 && ','}
        </span>
      ))}
    </p>
  );
}
