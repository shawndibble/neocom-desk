import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { CharacterAvatar, StatChip } from '@/components/ui';
import { usePublicInfo } from '@/stores/publicInfo';

interface CharacterHeaderProps {
  characterId: number;
  /** Corrected total SP; null while loading, or when /skills is unavailable. */
  totalSp: number | null;
  /** ESI's unallocated_sp; null while loading, or when unavailable. */
  unallocatedSp: number | null;
}

/**
 * The Character overview's shared header: portrait, name, corp/alliance, SP.
 *
 * `PageHeader` is still every *other* route's top line (docs/DESIGN.md §4);
 * this replaces it for the three views behind `OverviewSubNav`, which read as
 * one page split into tabs rather than three separate destinations. A per-view
 * title there only restated the tab directly beneath it, and the identity
 * block jumping in and out as you moved between tabs was the actual complaint.
 * The character's name is the `<h1>` — one per route, as before.
 *
 * It takes no controls slot on purpose. Everything above the tab strip is the
 * same on every tab, full stop; a view's `DataAgeBadge` and its Refresh belong
 * to the data they describe, so they sit in that view's `Panel` toolbar below
 * the tabs — which is where Overview's own panel badges already were.
 *
 * Identity is read here rather than passed in: it is the same on every tab and
 * comes from local state (Dexie) plus a session store, so threading it through
 * three route loaders would buy nothing. The SP pair is a prop because it is
 * an ESI read whose freshness belongs to the view's own load/refresh cycle —
 * see `characterSp.ts` for what the two scope-light tabs feed it.
 */
export function CharacterHeader({ characterId, totalSp, unallocatedSp }: CharacterHeaderProps) {
  const { t } = useTranslation();
  const character = useLiveQuery(() => db.characters.get(characterId), [characterId]);
  const publicInfo = usePublicInfo((state) => state.byCharacterId[characterId]);
  const loadPublicInfo = usePublicInfo((state) => state.load);

  // Fire-and-forget, and a no-op once cached or in flight: the header renders
  // corp/alliance as they arrive rather than holding the view on that chain of
  // public fetches.
  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  const sp = (value: number | null): string =>
    value === null ? t('common.unknown') : value.toLocaleString();

  return (
    <header className="flex flex-wrap items-center gap-3">
      <CharacterAvatar
        characterId={characterId}
        size="lg"
        alt={t('characters.portraitAlt', { name: character?.name ?? '' })}
      />
      {/*
        `basis-48` is what makes the header actually wrap on a phone. With a
        bare `flex-1` (basis 0) this block is infinitely shrinkable, so the
        chips below stayed on line one and truncated the character name down
        to a single letter instead. Given a real basis, the chips wrap to
        their own line and the name gets the full width.
      */}
      <div className="min-w-0 flex-1 basis-48">
        <h1 className="truncate text-xl font-semibold tracking-widest uppercase">
          {character?.name ?? t('common.unknown')}
        </h1>
        <p className="truncate text-xs text-text-dim">
          {publicInfo?.corporationName ?? t('common.unknown')}
          {publicInfo?.allianceName ? ` / ${publicInfo.allianceName}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatChip label={t('skills.totalSp')} value={sp(totalSp)} />
        <StatChip label={t('skills.unallocatedSp')} value={sp(unallocatedSp)} />
      </div>
    </header>
  );
}
