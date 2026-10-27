import type { NewCalendarEventFire, CalendarEventStartingFire } from '@/engine/notificationDiffs';
import { renderSharedWording } from '@/engine/notificationWording';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { type DomainCopy, type NoNames, fired } from './shared';

export interface CalendarNames {
  /**
   * When a newly-added event starts, already formatted in the pilot's chosen
   * clock — a lookup because that clock is a stored preference. Absent when
   * the fire carries no usable instant: the body then drops the clause
   * rather than printing "Invalid Date".
   */
  readonly when?: string;
}

type CalendarFire = NewCalendarEventFire | CalendarEventStartingFire;

export const calendarCopy: DomainCopy<CalendarFire, CalendarNames> & {
  readonly push: PushCopy<CalendarEventStartingFire, NoNames>;
} = {
  poll: (fire, character, names) => {
    if (fire.eventId === 'newCalendarEvent') {
      return {
        title: fired('newCalendarEvent', 'title'),
        body:
          fire.title === undefined || names.when === undefined
            ? fired('newCalendarEvent', 'bodyUnnamed', { character })
            : fired('newCalendarEvent', 'body', { character, event: fire.title, when: names.when }),
      };
    }
    return {
      title: fired('calendarEventStarting', 'title'),
      body:
        fire.title === undefined
          ? fired('calendarEventStarting', 'bodyUnnamed', { character })
          : fired('calendarEventStarting', 'body', { character, event: fire.title }),
    };
  },
  /**
   * Names the event where the snapshot knows it. A baseline persisted before
   * the title was recorded falls back to the unnamed copy rather than pushing
   * a sentence with a hole in it.
   */
  push: (fire, character) => {
    assertProjectionWording('calendarEventStarting', 'assert');
    return fire.title === undefined
      ? renderSharedWording('calendarEventStarting', { character }, 'bodyUnnamed')
      : renderSharedWording('calendarEventStarting', { character, event: fire.title });
  },
};
