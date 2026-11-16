import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POP_SHARING,
  applyMoonOverride,
  effectivePopSharing,
  popSharingFrom,
  startLinkRatePct,
  type PopSharingDoc,
} from './popSharing.js';

const doc = (over: Partial<PopSharingDoc> = {}): PopSharingDoc => ({
  ...popSharingFrom(undefined),
  ...over,
});

describe('popSharingFrom', () => {
  it('reads a missing doc as sharing off with the built-in default', () => {
    expect(popSharingFrom(undefined)).toEqual({
      enabled: false,
      defaults: DEFAULT_POP_SHARING,
      moons: {},
    });
  });

  it('fills a partial default from the built-in one and drops what it cannot read', () => {
    const read = popSharingFrom({
      enabled: true,
      defaults: { popTime: 'auto-fracture', showOre: 'yes', notes: 'Bring Orcas' },
      moons: { '40001': { ratePct: 7, bogus: 1 }, nope: 'x' },
    });
    expect(read.enabled).toBe(true);
    expect(read.defaults).toEqual({
      ...DEFAULT_POP_SHARING,
      popTime: 'auto-fracture',
      notes: 'Bring Orcas',
    });
    expect(read.moons).toEqual({ '40001': { ratePct: 7 } });
  });

  it('shares with the Corp, at Ready, with ore make-up, at the book rate, by default', () => {
    expect(DEFAULT_POP_SHARING).toEqual({
      audiences: [{ kind: 'corp' }],
      popTime: 'ready',
      showOre: true,
      ratePct: null,
      notes: '',
    });
  });
});

describe('effectivePopSharing', () => {
  it('follows the default on every setting a moon has not overridden', () => {
    const d = doc({
      enabled: true,
      defaults: { ...DEFAULT_POP_SHARING, notes: 'Fleet in Discord' },
      moons: { '40001': { popTime: 'auto-fracture' } },
    });
    const out = effectivePopSharing(d, 40001);
    expect(out.settings).toEqual({
      ...DEFAULT_POP_SHARING,
      notes: 'Fleet in Discord',
      popTime: 'auto-fracture',
    });
    expect(out.overridden).toEqual(['popTime']);
    expect(out.shared).toBe(true);
    expect(out.blockedBy).toBeNull();
  });

  it('a change to the default reaches a moon that did not override that setting', () => {
    const before = doc({ enabled: true, moons: { '40001': { popTime: 'auto-fracture' } } });
    const after = { ...before, defaults: { ...before.defaults, showOre: false } };
    expect(effectivePopSharing(after, 40001).settings.showOre).toBe(false);
    expect(effectivePopSharing(after, 40001).settings.popTime).toBe('auto-fracture');
  });

  it('shares nothing while sharing is off', () => {
    const out = effectivePopSharing(doc(), 40001);
    expect(out.shared).toBe(false);
    expect(out.blockedBy).toBe('off');
  });

  it('keeps the settings of a moon whose owner opted out, but shares nothing', () => {
    const d = doc({ enabled: true, moons: { '40001': { notes: 'kept' } } });
    const out = effectivePopSharing(d, 40001, { ownerOptedOut: true });
    expect(out.shared).toBe(false);
    expect(out.blockedBy).toBe('owner-opted-out');
    expect(out.settings.notes).toBe('kept');
  });

  it('shares nothing for a moon overridden to no audience', () => {
    const d = doc({ enabled: true, moons: { '40001': { audiences: [] } } });
    expect(effectivePopSharing(d, 40001).blockedBy).toBe('no-audience');
  });
});

describe('applyMoonOverride', () => {
  it('sets the given settings and keeps the rest', () => {
    expect(
      applyMoonOverride({ notes: 'a' }, { set: { popTime: 'auto-fracture' }, clear: [] })
    ).toEqual({
      notes: 'a',
      popTime: 'auto-fracture',
    });
  });

  it('clear returns one setting to the default', () => {
    expect(
      applyMoonOverride({ notes: 'a', showOre: false }, { set: {}, clear: ['notes'] })
    ).toEqual({ showOre: false });
  });

  it('a null rate overrides to the book rate, not back to the default', () => {
    expect(applyMoonOverride({}, { set: { ratePct: null }, clear: [] })).toEqual({ ratePct: null });
  });

  it('clearing the last setting leaves no override at all', () => {
    expect(applyMoonOverride({ notes: 'a' }, { set: {}, clear: ['notes'] })).toBeUndefined();
    expect(applyMoonOverride(undefined, { set: {}, clear: [] })).toBeUndefined();
  });
});

describe('startLinkRatePct', () => {
  it('is the book rate unless the settings name one', () => {
    expect(startLinkRatePct({ ...DEFAULT_POP_SHARING }, 10)).toBe(10);
    expect(startLinkRatePct({ ...DEFAULT_POP_SHARING, ratePct: 6.5 }, 10)).toBe(6.5);
  });
});
