import type { CloneJumpReadyFire } from '@/engine/notificationDiffs';
import { renderSharedWording } from '@/engine/notificationWording';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { type DomainCopy, type NoNames, simple } from './shared';

export const cloneJumpCopy: DomainCopy<CloneJumpReadyFire, NoNames> & {
  readonly push: PushCopy<CloneJumpReadyFire, NoNames>;
} = {
  poll: (_fire, character) => simple('cloneJumpReady', { character }),
  push: (_fire, character) => {
    assertProjectionWording('cloneJumpReady', 'assert');
    return renderSharedWording('cloneJumpReady', { character });
  },
};
