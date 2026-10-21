/**
 * A bounty-prize journal line's kills, summed per pirate faction —
 * "Blood Raiders ×9 · Serpentis ×5 · Other ×3" — in place of ESI's raw
 * `typeID: count` reason. Reads the total ("21 NPCs killed") until the
 * factions resolve, and keeps it if they never do.
 */
import { formatCount } from '@/lib/formatCount';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { killsByFaction, type BountyKill } from './bountyKills';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadNpcFactions } from './npcFactions';

export function BountyFactionSummary({ kills }: { kills: readonly BountyKill[] }) {
  const { t } = useTranslation();
  // A new `kills` is a new loader, so a row handed new kills never sums them
  // against the previous row's map.
  const loader = useCallback(() => loadNpcFactions(kills.map((kill) => kill.typeId)), [kills]);
  const factions = useAsyncLoad(loader).data ?? null;

  const grouped = useMemo(
    () => (factions ? killsByFaction(kills, factions) : null),
    [kills, factions]
  );
  const total = kills.reduce((sum, kill) => sum + kill.count, 0);

  return (
    <span className="text-text-dim">
      {grouped && grouped.some((group) => group.faction !== null)
        ? grouped
            .map((group) =>
              t('wallet.journalBountyFaction', {
                faction: group.faction ?? t('wallet.journalBountyOther'),
                count: formatCount(group.count),
              })
            )
            .join(' · ')
        : t('wallet.journalBountyKills', { count: total })}
    </span>
  );
}
