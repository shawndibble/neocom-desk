import type { NotificationFire } from '@/engine/notificationDiffs';
import { renderSharedWording } from '@/engine/notificationWording';
import { assertProjectionWording, romanLevel, type PushCopy } from '@/engine/projection';
import { type DomainCopy, simple, HOUR_MS } from './shared';

export interface SkillNames {
  readonly skill?: string;
}

export const skillQueueCopy: DomainCopy<NotificationFire, SkillNames> & {
  readonly push: PushCopy<NotificationFire, SkillNames>;
} = {
  poll: (fire, character, names) => {
    if (fire.eventId === 'characterNotTraining') {
      return simple('characterNotTraining', { character });
    }
    if (fire.eventId === 'omegaLapsed') {
      return simple('omegaLapsed', { character });
    }
    if (fire.eventId === 'skillQueueEnding') {
      return simple('skillQueueEnding', {
        character,
        skill: names.skill ?? `#${fire.skillId}`,
        hours: Math.round((fire.thresholdMs ?? 0) / HOUR_MS),
      });
    }
    const level =
      fire.level !== null && fire.level >= 1 && fire.level <= 5 ? romanLevel(fire.level) : '';
    return simple('skillLevelComplete', {
      character,
      skill: names.skill ?? `#${fire.skillId}`,
      level,
    });
  },
  push: (fire, character, names) => {
    if (fire.eventId === 'omegaLapsed') throw new Error('omegaLapsed is never projected');
    if (fire.eventId === 'characterNotTraining') {
      assertProjectionWording('characterNotTraining', 'assert');
      return renderSharedWording('characterNotTraining', { character });
    }
    if (fire.eventId === 'skillQueueEnding') {
      assertProjectionWording('skillQueueEnding', 'hedge');
      const hours = Math.round((fire.thresholdMs ?? 0) / HOUR_MS);
      return {
        title: 'Skill queue due to run dry',
        body: `${character}'s skill queue was due to run dry in under ${hours} hours.`,
      };
    }
    assertProjectionWording('skillLevelComplete', 'assert');
    return renderSharedWording('skillLevelComplete', {
      character,
      skill: names.skill ?? `#${fire.skillId}`,
      level: fire.level === null ? '' : romanLevel(fire.level),
    });
  },
};
