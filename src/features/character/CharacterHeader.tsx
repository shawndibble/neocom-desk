import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { AlertsBell, CharacterAvatar, StatChip, StatChips } from '@/components/ui';
import { AllianceLink, CorporationLink } from '@/features/entities';
import { usePublicInfo } from '@/stores/publicInfo';

interface CharacterHeaderProps {
  characterId: number;
  /** Corrected total SP; null while loading, or when /skills is unavailable. */
  totalSp: number | null;
  /** ESI's unallocated_sp; null while loading, or when unavailable. */
  unallocatedSp: number | null;
  /**
   * The Overview's layout: Total SP is dropped (a Skill points widget carries
   * it), the bell sits top right on the Unallocated SP line, and `aside` and
   * `actions` are drawn. Clones and Employment History leave it off.
   */
  overview?: boolean;
  /** Overview only: beside the name (data age and Refresh); wraps under it when the name is long. */
  aside?: ReactNode;
  /** Overview only: the controls row under the identity (the Next deadline and Customize). */
  actions?: ReactNode;
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
 * It has no controls of its own on Clones and Employment History: everything
 * above the tab strip is the same on every tab, and a view's `DataAgeBadge`
 * and Refresh belong to the data they describe, so they sit in that view's
 * `Panel` toolbar below the tabs. The exception is the Overview (`overview`),
 * whose widgets are the page: its header carries the data age and Refresh
 * beside the name (`aside`), the Unallocated SP chip with the bell at the top
 * right, and a controls row (`actions`: Next deadline, Customize). Total SP is
 * not drawn there; a Skill points widget carries it. Switching Character is the
 * rail footer's and the command palette's job.
 *
 *
 * Identity is read here rather than passed in: it is the same on every tab and
 * comes from local state (Dexie) plus a session store, so threading it through
 * three route loaders would buy nothing. The SP pair is a prop because it is
 * an ESI read whose freshness belongs to the view's own load/refresh cycle —
 * see `characterSp.ts` for what the two scope-light tabs feed it.
 */
export function CharacterHeader({
  characterId,
  totalSp,
  unallocatedSp,
  overview = false,
  aside,
  actions,
}: CharacterHeaderProps) {
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

  // On the Overview the chips drop to their own line on a phone (order-1) so the
  // bell stays top right beside the identity; from `md` they sit left of the bell.
  const chipsClassName = overview ? 'order-1 basis-full md:order-none md:basis-auto' : undefined;

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
        {/* `tabIndex={-1}`: route focus (`app/routeFocus.ts`) lands here after navigation. */}
        <div className="flex flex-wrap items-center gap-x-3">
          <h1
            tabIndex={-1}
            className="max-w-full min-w-0 truncate text-xl font-semibold tracking-widest uppercase focus:outline-none"
          >
            {character?.name ?? t('common.unknown')}
          </h1>
          {overview && aside}
        </div>
        <p className="truncate text-xs text-text-dim">
          {publicInfo?.corporationName && publicInfo.corporationId !== undefined ? (
            <CorporationLink id={publicInfo.corporationId}>
              {publicInfo.corporationName}
            </CorporationLink>
          ) : (
            (publicInfo?.corporationName ?? t('common.unknown'))
          )}
          {publicInfo?.allianceName && (
            <>
              {' / '}
              {publicInfo.allianceId !== undefined ? (
                <AllianceLink id={publicInfo.allianceId}>{publicInfo.allianceName}</AllianceLink>
              ) : (
                publicInfo.allianceName
              )}
            </>
          )}
        </p>
      </div>
      <StatChips className={chipsClassName}>
        {!overview && <StatChip label={t('skills.totalSp')} value={sp(totalSp)} />}
        <StatChip label={t('skills.unallocatedSp')} value={sp(unallocatedSp)} />
      </StatChips>
      {/* This header stands in for `PageHeader` on Overview, Clones and Employment History. */}
      <AlertsBell />
      {overview && actions && <div className="order-2 min-w-0 basis-full">{actions}</div>}
    </header>
  );
}
