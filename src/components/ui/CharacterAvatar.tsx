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
  /**
   * The page's largest image above the fold (the Character header's portrait, usually the
   * route's LCP): fetched at high priority. Its URL is per Character, so it cannot be preloaded.
   * Never with `loading="lazy"`.
   */
  priority?: boolean;
  /** For a caller that swaps in a fallback when the portrait fails. */
  onError?: () => void;
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
  priority = false,
  onError,
  className = '',
}: CharacterAvatarProps) {
  const { px, source } = CHARACTER_AVATAR_SIZE[size];
  return (
    <img
      src={characterPortraitUrl(characterId, source)}
      crossOrigin="anonymous"
      alt={alt ?? ''}
      aria-hidden={alt === undefined ? true : undefined}
      width={px}
      height={px}
      loading={priority ? 'eager' : loading}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      onError={onError}
      className={cx(
        characterAvatarBoxClassName(size),
        selected ? 'border-accent' : 'border-line',
        className
      )}
    />
  );
}
