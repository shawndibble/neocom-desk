import { formatCount } from '@/lib/formatCount';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { cx } from '@/lib/cx';
import { AlertsBell, CharacterAvatar, StatChip, StatChips } from '@/components/ui';
import { AllianceLink, CorporationLink } from '@/features/entities';
import { usePublicInfo } from '@/stores/publicInfo';
import { CharacterAchievementLine } from './AchievementLine';

interface CharacterHeaderProps {
  characterId: number;
  /**
   * Corrected total SP; null while loading, or when /skills is unavailable.
   * The SP chips draw only when this or `unallocatedSp` is passed: the
   * Overview and Employment History omit both.
   */
  totalSp?: number | null;
  /** ESI's unallocated_sp; null while loading, or when unavailable. */
  unallocatedSp?: number | null;
  /**
   * The Overview's layout: a narrower name column (`basis-36`) and the bell
   * always shown. SP chips come from `totalSp`/`unallocatedSp` and the slots
   * from `actions` (and `aside`), none of which this flag changes; the Overview just
   * passes no SP (a Skill points widget carries it).
   */
  overview?: boolean;
  /** Beside the name, for a short fact about the Character itself; wraps under it when the name is long. Not a data age: that reads as the pilot being updated (see `OverviewSubNav`'s `trailing`). */
  aside?: ReactNode;
  /** In the header's own flex row, ahead of the bell (the Overview's Next deadline and Customize; Employment History's Refresh and export). */
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
 * Clones carries no controls of its own here: its `DataAgeBadge` and Refresh
 * belong to the data they describe, so they sit in its `Panel` toolbar below
 * the tabs. The Overview (`overview`) and Employment History instead put the
 * data age on the tab row (`OverviewSubNav`'s `trailing`) and their controls
 * ahead of the bell (`actions`): the Overview's widgets, and Employment's
 * timeline, are the page, with no panel title bar to hold them. No SP is drawn on either
 * (`totalSp` and `unallocatedSp` omitted). Switching Character is the rail
 * footer's and the command palette's job.
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

  const sp = (value: number | null | undefined): string =>
    value == null ? t('common.unknown') : formatCount(value);
  const showSp = totalSp !== undefined || unallocatedSp !== undefined;

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
      <div className={cx('min-w-0 flex-1', overview || actions ? 'basis-36' : 'basis-48')}>
        {/* `tabIndex={-1}`: route focus (`app/routeFocus.ts`) lands here after navigation. */}
        <div className="flex flex-wrap items-center gap-x-3">
          <h1
            tabIndex={-1}
            className="max-w-full min-w-0 truncate text-xl font-semibold tracking-widest uppercase focus:outline-none"
          >
            {character?.name ?? t('common.unknown')}
          </h1>
          {aside}
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
        <CharacterAchievementLine characterId={characterId} />
      </div>
      {/* Controls sit in this flex row, then the bell: the Overview's Next and Customize, Employment History's Refresh and export. */}
      {actions}
      {showSp && (
        <StatChips>
          <StatChip label={t('skills.totalSp')} value={sp(totalSp)} />
          <StatChip label={t('skills.unallocatedSp')} value={sp(unallocatedSp)} />
        </StatChips>
      )}
      {/* This header stands in for `PageHeader` on Overview, Clones and Employment History. */}
      <AlertsBell showWhenEmpty={overview ? true : undefined} />
    </header>
  );
}
