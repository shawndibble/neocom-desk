import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import i18n from '@/i18n';
import { fixturePi } from '../planViewFixture';
import { ProductSentence } from './ProductSentence';

const idOf = (name: string) =>
  Number(Object.entries(fixturePi.schematics).find(([, s]) => s.name === name)?.[0]);
const SILICON = idOf('Silicon');
const COOLANT = idOf('Coolant');

describe('ProductSentence', () => {
  it('links each product token to its PI detail, a list comma-separated', () => {
    const { container } = render(
      <MemoryRouter>
        <ProductSentence
          text={i18n.t('piPlan.stepTip', { p1s: '{p1s}' })}
          products={{ p1s: [SILICON, COOLANT] }}
          pi={fixturePi}
        />
      </MemoryRouter>
    );
    expect(container).toHaveTextContent('Tip: its best P1 here is Silicon, Coolant.');
    expect(screen.getByRole('link', { name: 'Silicon' })).toHaveAttribute(
      'href',
      `/planetary-industry/map?product=${SILICON}`
    );
    expect(screen.getByRole('link', { name: 'Coolant' })).toBeInTheDocument();
  });

  it('fills a token used twice in one sentence both times', () => {
    render(
      <MemoryRouter>
        <ProductSentence
          text={i18n.t('piPlan.shortTypeGap', {
            types: 'Lava',
            p0: '{p0}',
            p1: '{p1}',
            p1Rate: '1',
            p0Rate: '2',
          })}
          products={{ p0: COOLANT, p1: SILICON }}
          pi={fixturePi}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link', { name: 'Coolant' })).toHaveLength(2);
  });
});
