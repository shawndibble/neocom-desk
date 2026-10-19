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
    if (fire.eventId === 'skillQueueEnding') {
      return simple('skillQueueEnding', {
        character,
        skill: names.skill ?? `#${fire.skillId}`,
        hours: Math.round((fire.thresholdMs ?? 0) / HOUR_MS),
      });
    }
    // Live copy drops an out-of-range level; push below prints it as a number.
    const level =
      fire.level !== null && fire.level >= 1 && fire.level <= 5 ? romanLevel(fire.level) : '';
    return simple('skillLevelComplete', {
      character,
      skill: names.skill ?? `#${fire.skillId}`,
      level,
    });
  },
  /**
   * `skillQueueEnding` hedges, unlike its two skill-queue siblings above: an
   * in-game top-up of the queue — the whole activity this warning exists to
   * prompt — routinely falsifies the prediction before the push fires, the
   * same reasoning `colonyCopy`/`structureFuelCopy` document in full
   * (`engine/projection.ts`'s `projectionWording`).
   */
  push: (fire, character, names) => {
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
