import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { seedCharacter } from '@/test/seed';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  createVettingFixture,
  VETTING_FIXTURE_CORPORATION,
  VETTING_FIXTURE_REVIEWS,
  type VettingFixture,
  type VettingFixtureOptions,
} from '@/storybook/vettingFixture';
import { VettingPage } from './VettingPage';
import { setVettingBackendOverride } from './vettingBackend';

const CHARACTER = 2119876543;
let fixture: VettingFixture;

async function setup(path = '/corp/vetting/open', options: VettingFixtureOptions = {}) {
  fixture = createVettingFixture(options);
  setVettingBackendOverride(fixture);
  await seedCharacter(CHARACTER);
  await db.characters.update(CHARACTER, {
    corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
  });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/corp/vetting/*" element={<VettingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(async () => {
  setVettingBackendOverride(null);
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  await db.characters.clear();
});

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('VettingPage queue', () => {
  it('lists each review with its result in words and whose sign-off is needed', async () => {
    await setup();
    const tamsin = within(await rowOf('Tamsin Vell'));
    expect(tamsin.getByText('Application')).toBeInTheDocument();
    expect(tamsin.getByText('3 flags')).toBeInTheDocument();
    expect(tamsin.getByText('0 of 1')).toBeInTheDocument();
    expect(tamsin.getByText('Yours needed')).toBeInTheDocument();

    const joss = within(await rowOf('Joss Arden'));
    expect(joss.getByText('Promotion to Director')).toBeInTheDocument();
    expect(joss.getByText('1 of 2')).toBeInTheDocument();

    expect(within(await rowOf('Pell Okonru')).getByText('Nothing found')).toBeInTheDocument();
    expect(within(await rowOf('Dara Quill')).getByText('Incomplete')).toBeInTheDocument();
    // Waiting on the pilot: nothing for the caller to sign yet.
    const ren = within(await rowOf('Ren Halvard'));
    expect(ren.getByText('Waiting for pilot')).toBeInTheDocument();
    expect(ren.queryByText('Yours needed')).toBeNull();

    expect(screen.getByText('5 open')).toBeInTheDocument();
    expect(screen.getByText('need your sign-off')).toBeInTheDocument();
    // Reading the queue opens no report: an open is logged where the pilot sees it.
    expect(fixture.calls.map((call) => call.method)).toEqual(['overview']);
  });

  it('opens the report on a row click, once, and shows its flags', async () => {
    await setup();
    await userEvent.click(await screen.findByText('Tamsin Vell'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tamsin Vell' })
    ).toBeInTheDocument();
    expect(await screen.findByText('3 flags in 9 checks')).toBeInTheDocument();
    expect(screen.getByText('ISK with the watchlist')).toBeInTheDocument();
    expect(screen.getByText('Serious')).toBeInTheDocument();
    expect(screen.getByText(/1,200,000,000 ISK in 3 wallet rows/)).toBeInTheDocument();
    // The first flag's rows are open, each party an entity link.
    expect(screen.getAllByRole('link', { name: 'Corvin Hale' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Could not check')).toBeInTheDocument();
    expect(screen.getByText('Mira Vell did not share Mail.')).toBeInTheDocument();
    expect(fixture.calls.filter((call) => call.method === 'open')).toHaveLength(1);
    expect(fixture.calls.find((call) => call.method === 'open')?.args[2]).toBe(
      VETTING_FIXTURE_REVIEWS.flagged
    );
  });

  it('does not open a request the pilot has not answered', async () => {
    await setup();
    await userEvent.click(await screen.findByText('Ren Halvard'));
    expect(fixture.calls.some((call) => call.method === 'open')).toBe(false);
  });

  it('says nothing found neutrally, with the checks listed', async () => {
    await setup(`/corp/vetting/open/${VETTING_FIXTURE_REVIEWS.nothing}`);
    expect(await screen.findAllByText('Nothing found in 9 checks')).toHaveLength(2);
    expect(
      screen.getByText('Not a verdict. An undeclared character cannot be checked.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Flags')).toBeNull();
    expect(screen.getByText('Corporation history against the watchlist')).toBeInTheDocument();
  });

  it('shows an empty queue with how a review starts, and the decided ones on their tab', async () => {
    await setup('/corp/vetting/open', { empty: true });
    expect(await screen.findByText('Nobody to review')).toBeInTheDocument();
  });

  it('lists decided reviews with their outcome', async () => {
    await setup('/corp/vetting/decided');
    const row = within(await rowOf('Hesper Lune'));
    expect(row.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByText('Tamsin Vell')).toBeNull();
  });

  it('leaves Copy apply link inert while vetting is off, and hides Settings from a non-Director', async () => {
    await setup('/corp/vetting/settings', { on: false, canConfigure: false });
    const copy = await screen.findByRole('button', { name: 'Copy apply link' });
    expect(copy).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Vetting is off. A Director turns it on.')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Settings' })).toBeNull();
    expect(screen.getByText('Open reviews')).toBeInTheDocument();
  });

  it('asks a member for a review by exact name and role', async () => {
    await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Review a member' }));
    const dialog = within(await screen.findByRole('dialog'));
    const ask = dialog.getByRole('button', { name: 'Ask for a review' });
    expect(ask).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(dialog.getByLabelText('Character name, exactly as in game'), 'Sio Tane');
    await userEvent.type(dialog.getByLabelText('Role they are up for'), 'Accountant');
    await userEvent.click(ask);
    expect(await rowOf('Sio Tane')).toHaveTextContent('Promotion to Accountant');
    expect(fixture.calls.find((call) => call.method === 'request')?.args.slice(2)).toEqual([
      'Sio Tane',
      'Accountant',
    ]);
  });

  it('saves a settings change and a watchlist entry, each by itself', async () => {
    await setup('/corp/vetting/settings');
    expect(await screen.findByText('Black Kite Syndicate')).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText('Exact name of a character, corporation or alliance'),
      'Grey Lantern'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Grey Lantern')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Black Kite Syndicate' }));
    expect(await screen.findByText('3 entries')).toBeInTheDocument();
    expect(screen.queryByText('Black Kite Syndicate')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });
});
