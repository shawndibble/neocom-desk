import { describe, expect, it } from 'vitest';
import { DEFAULT_ON_GROUPS } from '@/esi/scopes';
import { FORMERLY_OPT_IN_GROUPS, parseCustomizeSelection } from './customizeSelection';

describe('parseCustomizeSelection', () => {
  it('accepts a full set of known groups', () => {
    expect(parseCustomizeSelection({ groups: ['wallet', 'mail', 'corp'] })).toEqual({
      groups: ['wallet', 'mail', 'corp'],
    });
  });

  it('accepts an empty list — Select none is a real, storable choice', () => {
    expect(parseCustomizeSelection({ groups: [] })).toEqual({ groups: [] });
  });

  it('deduplicates repeats', () => {
    expect(parseCustomizeSelection({ groups: ['wallet', 'wallet'] })).toEqual({
      groups: ['wallet'],
    });
  });

  it.each([
    ['an unknown group', { groups: ['wallet', 'notAGroup'] }],
    ['a non-string entry', { groups: ['wallet', 7] }],
    ['a missing groups list', {}],
  ])('rejects %s, so the dialog falls back to the default selection', (_case, raw) => {
    expect(parseCustomizeSelection(raw)).toBeNull();
  });

  it.each([
    ['a string', 'wallet'],
    ['null', null],
    ['undefined — the cold-device case', undefined],
  ])('rejects %s', (_case, raw) => {
    expect(parseCustomizeSelection(raw)).toBeNull();
  });

  it('the default selection parses back unchanged, since the dialog starts from it', () => {
    expect(parseCustomizeSelection({ groups: [...DEFAULT_ON_GROUPS] })).toEqual({
      groups: [...DEFAULT_ON_GROUPS],
    });
  });

  /**
   * #6102: a bare list was stored before every read Permission became
   * default-on. Then the six were unticked by default, so their absence says
   * nothing about the player — they start ticked. What the player unticked
   * among the rest stays unticked, and nothing else is added.
   */
  it('reads a bare list from before #6102 with the formerly opt-in Permissions ticked', () => {
    const parsed = parseCustomizeSelection(['mail', 'mailSend']);
    expect([...parsed!.groups].sort()).toEqual(
      ['mail', 'mailSend', ...FORMERLY_OPT_IN_GROUPS].sort()
    );
    expect(parsed!.groups).not.toContain('wallet');
  });

  it('keeps a post-#6102 choice that unticked a formerly opt-in Permission', () => {
    expect(parseCustomizeSelection({ groups: ['mail'] })).toEqual({ groups: ['mail'] });
  });

  it('names exactly the six read Permissions that were opt-in before #6102', () => {
    expect([...FORMERLY_OPT_IN_GROUPS].sort()).toEqual(
      [
        'corp',
        'corpProjects',
        'jumpFatigue',
        'killmails',
        'mercenaryDens',
        'structureMarkets',
      ].sort()
    );
  });
});
