import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import type { AttributeSection } from '@/engine/market/itemAttributeSections';
import { ItemAttributeSections } from './ItemAttributeSections';
import { sectionsShowSkilled } from './skilledFigures';

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
  it('reads a row the pilot changes as base → skilled, the skilled figure a green opener', () => {
    render(<ItemAttributeSections sections={sections()} />);
    expect(screen.getByText('285 →')).toBeInTheDocument();
    const figure = screen.getByRole('button', { name: '285 s, 213.75 s with your skills' });
    expect(figure).toHaveClass('text-success', 'decoration-dashed');
    expect(figure).toHaveTextContent('213.75 s');
  });

  it('opens what made a skilled figure: each skill at the pilot’s level, implants, the hull', async () => {
    const user = userEvent.setup();
    render(
      <ItemAttributeSections
        sections={sections()}
        skilledSources={
          new Map([
            [
              55,
              [
                { kind: 'skill', typeId: 3418, name: 'Capacitor Management', level: 4 },
                {
                  kind: 'implant',
                  typeId: 3477,
                  name: "Inherent Implants 'Squire' Capacitor Management EM-802",
                },
                { kind: 'hull', typeId: 12003, name: 'Zealot' },
              ],
            ],
          ])
        }
        renderSkillList={() => <p>Per-level effects</p>}
      />
    );
    await user.click(screen.getByRole('button', { name: '285 s, 213.75 s with your skills' }));
    const popover = await screen.findByRole('dialog', {
      name: 'What changes Capacitor Recharge time',
    });
    expect(popover).toHaveTextContent('Capacitor Management IV');
    expect(popover).toHaveTextContent(
      "Inherent Implants 'Squire' Capacitor Management EM-802 (implant)"
    );
    expect(popover).toHaveTextContent('Zealot hull bonus');
    expect(popover).toHaveTextContent('Per-level effects');
  });

  it('shows a row the pilot does not change, or changes invisibly, as one value', () => {
    render(<ItemAttributeSections sections={sections()} />);
    expect(screen.getByText('1,500 GJ')).toBeInTheDocument();
    expect(screen.getByText('10 GJ')).toBeInTheDocument();
  });

  it('opens the skill list from a plain base figure the pilot does not change', async () => {
    const user = userEvent.setup();
    render(
      <ItemAttributeSections sections={sections()} renderSkillList={() => <p>Skill lines</p>} />
    );
    await user.click(screen.getByRole('button', { name: /^1,500 GJ/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Skill lines');
  });

  it('gives a resist layer its skilled HP, and a resist the skills change its own arrow', () => {
    const [grid, ...rest] = sections();
    const changed: AttributeSection =
      grid.kind === 'resists'
        ? {
            kind: 'resists',
            layers: grid.layers.map((layer) => ({
              ...layer,
              skilled: { hp: 2812.5, resonances: { ...RESONANCES, emResonance: 0.45 } },
            })),
          }
        : grid;
    render(<ItemAttributeSections sections={[changed, ...rest]} />);
    expect(screen.getByText('2,250 HP, 2,812.5 HP with your skills')).toBeInTheDocument();
    expect(screen.getByText('50%, 55% with your skills')).toBeInTheDocument();
    // Unchanged resists keep one figure.
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('says whether any arrow shows, ignoring changes too small to print', () => {
    expect(sectionsShowSkilled(sections())).toBe(true);
    const quiet = sections().map((section) =>
      section.kind === 'group'
        ? {
            ...section,
            group: {
              ...section.group,
              attributes: section.group.attributes.filter((a) => a.attributeId === 6),
            },
          }
        : { ...section, layers: section.layers.map((layer) => ({ ...layer, skilled: undefined })) }
    );
    expect(sectionsShowSkilled(quiet)).toBe(false);
  });
});
