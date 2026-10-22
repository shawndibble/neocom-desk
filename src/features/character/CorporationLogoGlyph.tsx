import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import * as Icon from '@/components/ui/icons';
import {
  CHARACTER_AVATAR_SIZE,
  type CharacterAvatarSize,
} from '@/components/ui/characterAvatarBox';
import { corporationLogoUrl } from '@/lib/eveImages';
import { cx } from '@/lib/cx';

/** The portrait box sizes, without the portrait's border: a logo sits in the same footprint. */
const BOX: Record<CharacterAvatarSize, string> = {
  sm: 'size-7',
  md: 'size-8',
  lg: 'size-16',
};

/**
 * A Character's own corporation logo, in the box that Character's portrait
 * would use: the "Corporation" glyph of `CharacterFilterControl`, so that
 * choice reads as *my* corporation the way "This character" reads as my
 * portrait. The corporation id comes from the Character's Dexie row
 * (`corporationId`, written by the public-info read), so there is no ESI call
 * here. The `Corporation` (Buildings) glyph holds the box while the logo
 * loads, after it fails, and whenever no corporation id is known.
 */
export function CorporationLogoGlyph({
  characterId,
  size,
  className,
}: {
  characterId: number | null;
  size: CharacterAvatarSize;
  className?: string;
}) {
  const corporationId = useLiveQuery(
    async () =>
      characterId === null ? null : ((await db.characters.get(characterId))?.corporationId ?? null),
    [characterId]
  );
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src =
    corporationId == null
      ? null
      : corporationLogoUrl(corporationId, CHARACTER_AVATAR_SIZE[size].source);
  const showImg = src !== null && failedSrc !== src;
  const loaded = showImg && loadedSrc === src;
  return (
    <span
      aria-hidden="true"
      className={cx('relative flex items-center justify-center', BOX[size], className)}
    >
      {!loaded && <Icon.Corporation data-corp-fallback size={Icon.ICON_SIZE.md} />}
      {showImg && (
        <img
          src={src}
          crossOrigin="anonymous"
          alt=""
          width={CHARACTER_AVATAR_SIZE[size].px}
          height={CHARACTER_AVATAR_SIZE[size].px}
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={cx(
            'absolute inset-0 size-full rounded-xs',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </span>
  );
}
