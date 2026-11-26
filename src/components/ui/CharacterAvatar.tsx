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
  selected?: boolean;
  alt?: string;
  loading?: 'eager' | 'lazy';
  priority?: boolean;
  onError?: () => void;
  className?: string;
}

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
