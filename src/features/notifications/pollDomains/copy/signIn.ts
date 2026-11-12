import type { CharacterNeedsLoginFire } from '@/engine/notificationDiffs';
import { type DomainCopy, type NoNames, simple } from './shared';

export const characterNeedsLoginCopy: DomainCopy<CharacterNeedsLoginFire, NoNames> = {
  poll: (_fire, character) => simple('characterNeedsLogin', { character }),
};
