import { characterPortraitUrl } from '@/lib/eveImages';
import { cx } from '@/lib/cx';
import {
  CHARACTER_AVATAR_SIZE,
  characterAvatarBoxClassName,
  type CharacterAvatarSize,
} from './characterAvatarBox';

interface CharacterAvatarProps {
  characterId: number;
  size?: CharacterAvatarSize;
  /** Accent ring for the selected/active Character. */
  selected?: boolean;
  /** Already-translated alt text. Omit for decorative use next to a text label. */
  alt?: string;
  /**
   * Defaults to eager: most portraits here are nav chrome or a page header,
   * where deferring costs a visible late paint. Lists pass `lazy`.
   */
  loading?: 'eager' | 'lazy';
  className?: string;
}

/**
 * ESI portrait. Decorative by default: the nav sites sit beside a text label
 * that already names the Character, so `alt` would repeat it — pass one only
 * where the portrait is the row's primary identifier.
 */
export function CharacterAvatar({
  characterId,
  size = 'md',
  selected = false,
  alt,
  loading = 'eager',
  className = '',
}: CharacterAvatarProps) {
  const { px, source } = CHARACTER_AVATAR_SIZE[size];
  return (
    <img
      src={characterPortraitUrl(characterId, source)}
      alt={alt ?? ''}
      aria-hidden={alt === undefined ? true : undefined}
      width={px}
      height={px}
      loading={loading}
      decoding="async"
      className={cx(
        characterAvatarBoxClassName(size),
        selected ? 'border-accent' : 'border-line',
        className
      )}
    />
  );
}
