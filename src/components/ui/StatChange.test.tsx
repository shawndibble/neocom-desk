import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { StatChange } from './StatChange';

describe('StatChange', () => {
  it('tints the after value success when a higher-is-better stat rises', () => {
    const { container } = render(
      <StatChange change={{ key: 'totalDps', before: 400, after: 525 }} />
    );

    const after = container.querySelector('[data-verdict]') as HTMLElement;
    expect(after).toHaveTextContent('→ 525');
    expect(after).toHaveClass('text-success');
    expect(screen.getByText('Total DPS 400 to 525, better')).toBeInTheDocument();
  });

  it('tints danger when a lower-is-better stat rises', () => {
    const { container } = render(
      <StatChange change={{ key: 'capacitorRechargeTime', before: 300, after: 328 }} />
    );

    expect(container.querySelector('[data-verdict]')).toHaveClass('text-danger');
    expect(screen.getByText('Capacitor recharge 300 to 328s, worse')).toBeInTheDocument();
  });

  it('stays plain for a neutral stat, with no verdict word', () => {
    const { container } = render(
      <StatChange change={{ key: 'cpuTotal', before: 100, after: 150 }} />
    );

    expect(container.querySelector('[data-verdict]')).toHaveClass('text-text');
    expect(screen.getByText('CPU total 100 to 150 tf')).toBeInTheDocument();
  });

  it('words a capacitor going from stable to unstable as worse', () => {
    const { container } = render(
      <StatChange change={{ key: 'capacitor', before: 60, after: -90 }} />
    );

    expect(container.querySelector('[data-verdict]')).toHaveClass('text-danger');
    expect(container).toHaveTextContent('Capacitor stable at 60% → depletes in');
  });
});
