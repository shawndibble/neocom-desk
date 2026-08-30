import { characterPortraitUrl } from '@/lib/eveImages';

export type CharacterAvatarSize = 'sm' | 'md' | 'lg';

interface CharacterAvatarProps {
  characterId: number;
  /** `sm` 28px (mobile nav) · `md` 32px (sidebar) · `lg` 64px (Overview, Characters). */
  size?: CharacterAvatarSize;
  /** Accent ring for the selected/active Character. */
  selected?: boolean;
  /** Already-translated alt text. Omit for decorative use next to a text label. */
  alt?: string;
  className?: string;
}

/** Rendered box size, and the portrait the image server should return for it. */
const SIZE: Record<CharacterAvatarSize, { className: string; px: number; source: 64 | 128 }> = {
  sm: { className: 'size-7', px: 28, source: 64 },
  md: { className: 'size-8', px: 32, source: 64 },
  lg: { className: 'size-16', px: 64, source: 128 },
};

/**
 * ESI portrait for a Character.
 *
 * `rounded-xs` is the house radius (docs/DESIGN.md §3), and every portrait in
 * the app is square-cornered — a round one would be the odd element out.
 *
 * Decorative by default: the nav sites sit beside a text label that already
 * names the Character, so a portrait `alt` would repeat it. Overview and
 * Characters pass an explicit `alt` because their portrait is the primary
 * identifier for the row.
 */
export function CharacterAvatar({
  characterId,
  size = 'md',
  selected = false,
  alt,
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
      loading="lazy"
      className={`shrink-0 rounded-xs border ${
        selected ? 'border-accent' : 'border-line'
      } ${box} ${className}`}
    />
  );
}
