import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { SharePicker } from './SharePicker';

const s = en.communities.share;
const groups = [
  { id: 1, name: 'Ships', parentId: null },
  { id: 102, name: 'Frigates', parentId: 1 },
  { id: 4, name: 'Modules', parentId: null },
];
const owned = [
  { typeId: 10, name: 'Rifter Blueprint', marketGroupId: 102 },
  { typeId: 11, name: 'Merlin Blueprint', marketGroupId: 102 },
  { typeId: 13, name: 'Armor Repairer Blueprint', marketGroupId: 4 },
  { typeId: 14, name: 'Hammerhead II Blueprint', marketGroupId: null },
];

function Harness({ initial = [] as number[] }) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set(initial));
  return <SharePicker owned={owned} groups={groups} selected={selected} onChange={setSelected} />;
}

// The worker's first render of the picker pays the cold module load once, here.
beforeAll(async () => {
  render(<Harness />).unmount();
}, 30_000);

describe('SharePicker', () => {
  it('shares nothing by default', () => {
    render(<Harness />);
    expect(screen.getByText('0 of 4 blueprints shared')).toBeInTheDocument();
  });

  it('shares all, then none, with a live count', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: s.all }));
    expect(screen.getByText('4 of 4 blueprints shared')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: s.none }));
    expect(screen.getByText('0 of 4 blueprints shared')).toBeInTheDocument();
  });

  it('shows a category as partial and toggles all of it from its checkbox', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[10]} />);
    await user.click(screen.getByRole('button', { name: 'Show Ships' }));
    await user.click(screen.getByRole('button', { name: 'Show Frigates' }));
    const frigates = screen.getByRole('checkbox', { name: /Frigates/ }) as HTMLInputElement;
    expect(frigates.indeterminate).toBe(true);
    expect(within(frigates.closest('label')!).getByText('1/2')).toBeInTheDocument();
    await user.click(frigates);
    expect(screen.getByText('2 of 4 blueprints shared')).toBeInTheDocument();
    await user.click(frigates);
    expect(screen.getByText('0 of 4 blueprints shared')).toBeInTheDocument();
  });

  it('opts a single blueprint out of a shared category', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[10, 11]} />);
    await user.click(screen.getByRole('button', { name: 'Show Ships' }));
    await user.click(screen.getByRole('button', { name: 'Show Frigates' }));
    await user.click(screen.getByRole('checkbox', { name: /Merlin Blueprint/ }));
    expect(screen.getByText('1 of 4 blueprints shared')).toBeInTheDocument();
  });

  it('searches by name, opening the matching categories', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: s.search }), 'merlin');
    expect(screen.getByRole('checkbox', { name: /Merlin Blueprint/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Rifter/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: s.search }));
    await user.type(screen.getByRole('searchbox', { name: s.search }), 'zzzz');
    expect(screen.getByText(s.noMatch)).toBeInTheDocument();
  });

  it('files blueprints the market does not list under Other', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: `Show ${s.other}` }));
    expect(screen.getByRole('checkbox', { name: /Hammerhead II Blueprint/ })).toBeInTheDocument();
  });
});
