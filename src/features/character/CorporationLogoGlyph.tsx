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

const BOX: Record<CharacterAvatarSize, string> = {
  sm: 'size-7',
  md: 'size-8',
  lg: 'size-16',
};

export function CorporationLogoGlyph({
  characterId,
  corporationId: givenCorporationId,
  size,
  boxClassName,
  className,
}: {
  characterId: number | null;
  corporationId?: number;
  size: CharacterAvatarSize;
  boxClassName?: string;
  className?: string;
}) {
  const ofCharacter = useLiveQuery(
    async () =>
      characterId === null ? null : ((await db.characters.get(characterId))?.corporationId ?? null),
    [characterId]
  );
  const corporationId = givenCorporationId ?? ofCharacter;
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
      className={cx(
        'relative flex items-center justify-center',
        boxClassName ?? BOX[size],
        className
      )}
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
