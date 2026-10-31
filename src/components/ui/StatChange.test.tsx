import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { StatChange, StatChangeList } from './StatChange';

describe('StatChange', () => {
  it('words a yes/no stat as yes → no, worse when it is lost', () => {
    const { container } = render(
      <StatChange change={{ key: 'warpsCloaked', before: 1, after: 0 }} />
    );

    expect(container).toHaveTextContent('Warps cloaked: yes → no');
    expect(container.querySelector('[data-verdict]')).toHaveClass('text-danger');
    expect(screen.getByText('Warps cloaked: yes to no, worse')).toBeInTheDocument();
  });

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
    // Just the level or the time: the Capacitor label already says what each is.
    expect(container).toHaveTextContent(/Capacitor\s*60% → \d/);
  });
});

describe('StatChangeList', () => {
  it('puts each change on its own row: the stat in one column, before → after and unit in the next', () => {
    render(
      <StatChangeList
        changes={[
          { key: 'maxVelocity', before: 2894, after: 2928 },
          { key: 'cpuUsed', before: 177, after: 186 },
        ]}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const [name, value] = Array.from(rows[0]!.children).filter((c) => !c.matches('.sr-only'));
    expect(name).toHaveTextContent(/^Max velocity$/);
    expect(value).toHaveTextContent('2,894 → 2,928 m/s');
    // Every row but the last ends in a pause, so a neutral one does not run into the next.
    expect(screen.getByText('Max velocity 2,894 to 2,928 m/s, better;')).toBeInTheDocument();
    expect(screen.getByText('CPU used 177 to 186 tf, worse')).toBeInTheDocument();
  });
});
