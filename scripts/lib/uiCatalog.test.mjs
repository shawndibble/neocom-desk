import { describe, it, expect } from 'vitest';
import { closeMatches, formatComponent, formatList, findComponent } from './uiCatalog.mjs';

const manifest = {
  components: {
    'ui-button': {
      id: 'ui-button',
      name: 'Button',
      summary: 'The text button.',
      reactDocgen: {
        props: {
          variant: {
            required: false,
            tsType: { name: 'union', raw: "'primary' | 'ghost'" },
            description: '@summary Visual weight.\nLonger text.',
            defaultValue: { value: "'ghost'" },
          },
          onClick: { required: true, tsType: { name: 'signature' }, description: '' },
          className: { required: false, defaultValue: { value: "''" } },
        },
      },
      stories: [{ id: 'ui-button--primary', name: 'Primary', summary: 'The main action.' }],
    },
    'ui-panel': { id: 'ui-panel', name: 'Panel', summary: 'A card.', stories: [] },
    'ui-broken': { id: 'ui-broken', name: 'Broken', error: { message: 'boom' } },
  },
};

describe('formatList', () => {
  it('lists one line per component with its summary', () => {
    expect(formatList(manifest).split('\n')).toEqual([
      'Button - The text button.',
      'Panel - A card.',
      'Broken - (no summary)',
    ]);
  });
});

describe('findComponent', () => {
  it('matches case-insensitively', () => {
    expect(findComponent(manifest, 'button')?.name).toBe('Button');
    expect(findComponent(manifest, 'nope')).toBeUndefined();
  });
});

describe('formatComponent', () => {
  it('prints summary, props with type, default and first description line, and story ids', () => {
    const out = formatComponent(manifest.components['ui-button']);
    expect(out).toContain('Button - The text button.');
    expect(out).toContain("variant?: 'primary' | 'ghost' = 'ghost' - Visual weight.");
    expect(out).toContain('onClick: signature');
    expect(out).toContain('ui-button--primary - Primary: The main action.');
  });
});

describe('closeMatches', () => {
  const names = ['Button', 'IconButton', 'Panel', 'DataTable'];
  it('suggests substring and near-typo matches', () => {
    expect(closeMatches('buton', names)).toContain('Button');
    expect(closeMatches('table', names)).toEqual(['DataTable']);
  });
  it('returns nothing for gibberish', () => {
    expect(closeMatches('zzzzzzzz', names)).toEqual([]);
  });
});
