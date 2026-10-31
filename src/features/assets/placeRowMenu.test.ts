import { describe, expect, it } from 'vitest';
import { nextPinLabelKey, placeMenuActions } from './placeRowMenu';

describe('placeMenuActions', () => {
  it('offers Set waypoint first on a station, then the rest', () => {
    expect(placeMenuActions({ kind: 'station', pinnable: true, resolved: true })).toEqual([
      'setWaypoint',
      'openInEve',
      'copyName',
      'togglePin',
    ]);
  });

  it('offers Rename before the pin where the page keeps Place Nicknames', () => {
    expect(
      placeMenuActions({ kind: 'station', pinnable: true, renamable: true, resolved: true })
    ).toEqual(['setWaypoint', 'openInEve', 'copyName', 'rename', 'togglePin']);
  });

  it('never offers Rename on a container or an unresolved place', () => {
    expect(
      placeMenuActions({ kind: 'container', pinnable: false, renamable: true, resolved: true })
    ).not.toContain('rename');
    expect(
      placeMenuActions({ kind: 'station', pinnable: true, renamable: true, resolved: false })
    ).toEqual(['copyName']);
  });

  it('drops the pin where the page has no pinning (corp)', () => {
    expect(placeMenuActions({ kind: 'station', pinnable: false, resolved: true })).toEqual([
      'setWaypoint',
      'openInEve',
      'copyName',
    ]);
  });

  it('offers a container only where it sits and its name', () => {
    expect(placeMenuActions({ kind: 'container', pinnable: false, resolved: true })).toEqual([
      'setWaypoint',
      'copyName',
    ]);
  });

  it('never offers a place action for an unresolved place', () => {
    expect(placeMenuActions({ kind: 'station', pinnable: true, resolved: false })).toEqual([
      'copyName',
    ]);
    expect(placeMenuActions({ kind: 'container', pinnable: false, resolved: false })).toEqual([
      'copyName',
    ]);
  });
});

describe('nextPinLabelKey', () => {
  it('names the step the toggle takes', () => {
    expect(nextPinLabelKey('unpinned')).toBe('assets.pin.pinCharacter');
    expect(nextPinLabelKey('character')).toBe('assets.pin.pinAccount');
    expect(nextPinLabelKey('account')).toBe('assets.pin.unpin');
  });
});
