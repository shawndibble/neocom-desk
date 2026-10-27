import { cx } from '@/lib/cx';

export type CharacterAvatarSize = 'sm' | 'md' | 'lg';

/** Rendered box size, and the portrait the image server should return for it. */
export const CHARACTER_AVATAR_SIZE: Record<
  CharacterAvatarSize,
  { className: string; px: number; source: 64 | 128 }
> = {
  sm: { className: 'size-7', px: 28, source: 64 },
  md: { className: 'size-8', px: 32, source: 64 },
  lg: { className: 'size-16', px: 64, source: 128 },
};

/**
 * Box and frame for an avatar-sized slot. Its own module rather than an export
 * off `CharacterAvatar.tsx` so that file keeps exporting only components (the
 * `react-refresh/only-export-components` rule), and so a placeholder standing
 * in for a portrait that hasn't resolved matches the shape it will become
 * instead of popping when it does.
 */
export function characterAvatarBoxClassName(size: CharacterAvatarSize = 'md'): string {
  return cx('shrink-0 rounded-xs border', CHARACTER_AVATAR_SIZE[size].className);
}
