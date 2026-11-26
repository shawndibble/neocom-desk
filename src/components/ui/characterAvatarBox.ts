import { cx } from '@/lib/cx';

export type CharacterAvatarSize = 'sm' | 'md' | 'lg';

export const CHARACTER_AVATAR_SIZE: Record<
  CharacterAvatarSize,
  { className: string; px: number; source: 64 | 128 }
> = {
  sm: { className: 'size-7', px: 28, source: 64 },
  md: { className: 'size-8', px: 32, source: 64 },
  lg: { className: 'size-16', px: 64, source: 128 },
};

export function characterAvatarBoxClassName(size: CharacterAvatarSize = 'md'): string {
  return cx('shrink-0 rounded-xs border', CHARACTER_AVATAR_SIZE[size].className);
}
