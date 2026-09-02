import { describe, it, expect } from 'vitest';
import { isEventEnabled, selectionStateForEvents, toggleAllEvents } from './eventSelection';
import type { NotificationEventId } from './events';

const EVENT_A = 'skillLevelComplete' satisfies NotificationEventId;
const EVENT_B = 'newMail' satisfies NotificationEventId;

describe('isEventEnabled', () => {
  it('is enabled by default when absent from the prefs map (on by default)', () => {
    expect(isEventEnabled({}, EVENT_A)).toBe(true);
  });

  it('respects an explicit false', () => {
    expect(isEventEnabled({ [EVENT_A]: false }, EVENT_A)).toBe(false);
  });

  it('respects an explicit true', () => {
    expect(isEventEnabled({ [EVENT_A]: true }, EVENT_A)).toBe(true);
  });
});

describe('selectionStateForEvents', () => {
  it('is unchecked for an empty event list', () => {
    expect(selectionStateForEvents([], {})).toBe('unchecked');
  });

  it('is checked when every event is enabled (including the on-by-default absent case)', () => {
    expect(selectionStateForEvents([EVENT_A, EVENT_B], {})).toBe('checked');
  });

  it('is unchecked when every event is explicitly disabled', () => {
    expect(
      selectionStateForEvents([EVENT_A, EVENT_B], { [EVENT_A]: false, [EVENT_B]: false })
    ).toBe('unchecked');
  });

  it('is indeterminate when only some events are enabled', () => {
    expect(selectionStateForEvents([EVENT_A, EVENT_B], { [EVENT_A]: false })).toBe('indeterminate');
  });
});

describe('toggleAllEvents', () => {
  it('disables every event when all are currently enabled', () => {
    const next = toggleAllEvents([EVENT_A, EVENT_B], {});
    expect(next).toEqual({ [EVENT_A]: false, [EVENT_B]: false });
  });

  it('enables every event when only some are currently enabled (fills in the indeterminate case)', () => {
    const next = toggleAllEvents([EVENT_A, EVENT_B], { [EVENT_A]: false });
    expect(next).toEqual({ [EVENT_A]: true, [EVENT_B]: true });
  });

  it('enables every event when all are currently disabled', () => {
    const next = toggleAllEvents([EVENT_A, EVENT_B], { [EVENT_A]: false, [EVENT_B]: false });
    expect(next).toEqual({ [EVENT_A]: true, [EVENT_B]: true });
  });

  it('does not mutate the input map', () => {
    const input = { [EVENT_A]: false };
    toggleAllEvents([EVENT_A, EVENT_B], input);
    expect(input).toEqual({ [EVENT_A]: false });
  });

  it('is a no-op for an empty event list', () => {
    expect(toggleAllEvents([], { [EVENT_A]: false })).toEqual({ [EVENT_A]: false });
  });
});
