import { describe, it, expect } from 'vitest';
import type { NotificationEventId } from './events';
import {
  isEventEnabledFor,
  selectionStateForEvents,
  toggleEventChannel,
  toggleAllEventsOnChannel,
  type EventEnabledMap,
} from './eventSelection';

const A = 'skillLevelComplete' satisfies NotificationEventId;
const B = 'newMail' satisfies NotificationEventId;

describe('isEventEnabledFor', () => {
  it('defaults an absent event to on for both channels', () => {
    expect(isEventEnabledFor({}, A, 'browser')).toBe(true);
    expect(isEventEnabledFor({}, A, 'feed')).toBe(true);
  });

  it('reads a legacy bare boolean as applying to both channels', () => {
    const legacy: EventEnabledMap = { [A]: false };
    expect(isEventEnabledFor(legacy, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(legacy, A, 'feed')).toBe(false);
  });

  it('reads channels independently', () => {
    const map: EventEnabledMap = { [A]: { browser: false } };
    expect(isEventEnabledFor(map, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(map, A, 'feed')).toBe(true);
  });
});

describe('selectionStateForEvents', () => {
  it('is per column', () => {
    const map: EventEnabledMap = { [A]: { browser: false }, [B]: { browser: false } };
    expect(selectionStateForEvents([A, B], map, 'browser')).toBe('unchecked');
    expect(selectionStateForEvents([A, B], map, 'feed')).toBe('checked');
  });

  it('is indeterminate on a partial column', () => {
    const map: EventEnabledMap = { [A]: { browser: false } };
    expect(selectionStateForEvents([A, B], map, 'browser')).toBe('indeterminate');
  });
});

describe('toggleEventChannel', () => {
  it('flips one channel and leaves the other alone', () => {
    const next = toggleEventChannel({}, A, 'browser');
    expect(isEventEnabledFor(next, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(next, A, 'feed')).toBe(true);
  });

  it('materialises a legacy boolean without changing the untouched channel', () => {
    const next = toggleEventChannel({ [A]: false }, A, 'feed');
    expect(isEventEnabledFor(next, A, 'feed')).toBe(true);
    expect(isEventEnabledFor(next, A, 'browser')).toBe(false);
  });

  it('does not disturb other events', () => {
    const next = toggleEventChannel({ [B]: { feed: false } }, A, 'browser');
    expect(isEventEnabledFor(next, B, 'feed')).toBe(false);
  });
});

describe('toggleAllEventsOnChannel', () => {
  it('clears a fully-enabled column, keeping the other column intact', () => {
    const next = toggleAllEventsOnChannel([A, B], {}, 'browser');
    expect(isEventEnabledFor(next, A, 'browser')).toBe(false);
    expect(isEventEnabledFor(next, B, 'browser')).toBe(false);
    expect(isEventEnabledFor(next, A, 'feed')).toBe(true);
    expect(isEventEnabledFor(next, B, 'feed')).toBe(true);
  });

  it('fills in a partial column rather than clearing it', () => {
    const map: EventEnabledMap = { [A]: { browser: false } };
    const next = toggleAllEventsOnChannel([A, B], map, 'browser');
    expect(isEventEnabledFor(next, A, 'browser')).toBe(true);
    expect(isEventEnabledFor(next, B, 'browser')).toBe(true);
  });
});
