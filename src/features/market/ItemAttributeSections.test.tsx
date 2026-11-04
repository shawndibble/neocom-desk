import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import type { AttributeSection } from '@/engine/market/itemAttributeSections';
import { ItemAttributeSections } from './ItemAttributeSections';

const RESONANCES = {
  emResonance: 0.5,
  thermalResonance: 0.65,
  kineticResonance: 0.375,
  explosiveResonance: 0.2,
};

function sections(): AttributeSection[] {
  return [
    {
      kind: 'resists',
      layers: [
        {
          layer: 'armor',
          hp: 2250,
          resonances: RESONANCES,
          skilled: { hp: 2812.5, resonances: RESONANCES },
        },
      ],
    },
    {
      kind: 'group',
      group: {
        category: 'Capacitor',
        attributes: [
          {
            attributeId: 55,
            name: 'Capacitor Recharge time',
            unit: 's',
            value: 285,
            skilledValue: 213.75,
          },
          { attributeId: 482, name: 'Capacitor Capacity', unit: 'GJ', value: 1500 },
          // Different, but the same once formatted: no arrow.
          {
            attributeId: 6,
            name: 'Activation Cost',
            unit: 'GJ',
            value: 10,
            skilledValue: 10.000001,
          },
        ],
      },
    },
  ];
}

describe('ItemAttributeSections', () => {
  it('reads a row the pilot changes as base → skilled, with a spoken form', () => {
    render(<ItemAttributeSections sections={sections()} />);
    expect(screen.getByText('285 →')).toBeInTheDocument();
    expect(screen.getByText('213.75 s', { selector: 'span.font-semibold' })).toBeInTheDocument();
    expect(screen.getByText('285 s, 213.75 s with your skills')).toBeInTheDocument();
  });

  it('shows a row the pilot does not change, or changes invisibly, as one value', () => {
    render(<ItemAttributeSections sections={sections()} />);
    expect(screen.getByText('1,500 GJ')).toBeInTheDocument();
    expect(screen.getByText('10 GJ')).toBeInTheDocument();
  });

  it('gives a resist layer its skilled HP', () => {
    render(<ItemAttributeSections sections={sections()} />);
    expect(screen.getByText(/2,250 → 2,812(\.5)? HP/)).toBeInTheDocument();
  });
});
