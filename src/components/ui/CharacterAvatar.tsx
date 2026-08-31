import { characterPortraitUrl } from '@/lib/eveImages';
import { cx } from '@/lib/cx';

export type CharacterAvatarSize = 'sm' | 'md' | 'lg';

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

/** Rendered box size, and the portrait the image server should return for it. */
const SIZE: Record<CharacterAvatarSize, { className: string; px: number; source: 64 | 128 }> = {
  sm: { className: 'size-7', px: 28, source: 64 },
  md: { className: 'size-8', px: 32, source: 64 },
  lg: { className: 'size-16', px: 64, source: 128 },
};

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
  const { className: box, px, source } = SIZE[size];
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
        'shrink-0 rounded-xs border',
        selected ? 'border-accent' : 'border-line',
        box,
        className
      )}
    />
  );
}
