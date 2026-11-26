import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
import { RAW_BUSY_WALLET_ROWS, RAW_CHUNK } from '@/storybook/vettingRawFixture';
import { VettingConsentTerms } from './VettingConsentTerms';
import { VettingPage } from './VettingPage';
import { setVettingBackendOverride } from './vettingBackend';
import { forgetVettingReview } from './vettingReviewCache';
import { clearVettingRawStore } from './vettingRawStore';

vi.mock('@/sde/loadSde', () => ({
  loadSkills: async () => [
    { typeID: 21603, name: 'Cynosural Field Theory', groupName: 'Navigation' },
    { typeID: 3300, name: 'Gunnery', groupName: 'Gunnery' },
    { typeID: 3301, name: 'Small Hybrid Turret', groupName: 'Gunnery' },
  ],
}));

const CHARACTER = 2119876543;
const FLAGGED = VETTING_FIXTURE_REVIEWS.flagged;
let fixture: VettingFixture;

function Where() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="where">{pathname + search + hash}</output>;
}

async function setup(path: string, options: VettingFixtureOptions = {}) {
  fixture = createVettingFixture(options);
  setVettingBackendOverride(fixture);
  await seedCharacter(CHARACTER);
  await db.characters.update(CHARACTER, {
    corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
  });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/corp/vetting/*" element={<VettingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(async () => {
  setVettingBackendOverride(null);
  forgetVettingReview();
  clearVettingRawStore();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  await db.characters.clear();
});

const rawCalls = () => fixture.calls.filter((call) => call.method === 'rawRows');
const dataPage = (source: string, query = '') =>
  `/corp/vetting/open/${FLAGGED}/data/${source}${query}`;

describe('the report points at the data', () => {
  it('lists every source with its rows and opens one on a row click, without a second open', async () => {
    await setup(`/corp/vetting/open/${FLAGGED}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tamsin Vell' })
    ).toBeInTheDocument();
    const panel = within(
      (await screen.findByRole('table', { name: 'Data we read' })).closest('section')!
    );
    expect(panel.getByText('Wallet journal').closest('tr')).toHaveTextContent('4,652');
    expect(panel.getByText('Corporation history')).toBeInTheDocument();
    expect(screen.getByText('Rows kept')).toBeInTheDocument();
    expect(screen.getByText('All of them')).toBeInTheDocument();

    await userEvent.click(panel.getByText('Skills').closest('tr')!);
    expect(await screen.findByTestId('where')).toHaveTextContent(dataPage('skills'));
    expect(await screen.findByRole('tab', { name: /Skills/, selected: true })).toBeInTheDocument();
    expect(fixture.calls.filter((call) => call.method === 'open')).toHaveLength(1);
  });

  it('links each flag to its rows, inside its rows behind this', async () => {
    await setup(`/corp/vetting/open/${FLAGGED}`);
    const isk = await screen.findByRole('link', { name: 'Open the 3 rows in Wallet journal' });
    await userEvent.click(isk);
    expect(await screen.findByTestId('where')).toHaveTextContent(
      `${dataPage('wallet')}?character=2118000001&flagged=1`
    );
  });

  it('links the Cyno flag to the skill, which has no rows to open', async () => {
    await setup(`/corp/vetting/open/${FLAGGED}`);
    expect(
      await screen.findByRole('link', { name: 'Open the skill in Skills' })
    ).toBeInTheDocument();
  });

  it('offers nothing to browse for a review stored before rows were kept', async () => {
    fixture = createVettingFixture();
    const open = fixture.open;
    fixture.open = async (...args) => {
      const review = await open(...args);
      delete review.rawCounts;
      return review;
    };
    setVettingBackendOverride(fixture);
    await seedCharacter(CHARACTER);
    await db.characters.update(CHARACTER, {
      corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
    render(
      <MemoryRouter initialEntries={[`/corp/vetting/open/${FLAGGED}`]}>
        <Routes>
          <Route path="/corp/vetting/*" element={<VettingPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('heading', { level: 1, name: 'Tamsin Vell' });
    expect(screen.queryByText('Data we read')).toBeNull();
    expect(screen.queryByText('Rows kept')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Open the/ })).toBeNull();
  });
});

describe('the data page', () => {
  it('has a tab per source with its count, and loads every page of the open one', async () => {
    await setup(dataPage('wallet'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Data we read' })
    ).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: 'Data sources' }));
    expect(tabs.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      expect.stringMatching(/^Wallet journal\s*4,?652$/),
      expect.stringMatching(/^Contacts\s*0$/),
      expect.stringMatching(/^Mail headers\s*12$/),
      expect.stringMatching(/^Contracts\s*3$/),
      expect.stringMatching(/^Skills\s*31$/),
      expect.stringMatching(/^Corporation history\s*9$/),
    ]);
    expect(
      await screen.findByText('All 4,652 rows read. Scroll for the rest.')
    ).toBeInTheDocument();
    expect(rawCalls()).toHaveLength(Math.ceil(RAW_BUSY_WALLET_ROWS / RAW_CHUNK));
    expect(rawCalls().map((call) => call.args[4])).toEqual([
      undefined,
      ...Array.from({ length: rawCalls().length - 1 }, (_, index) => String(index + 1)),
    ]);
  });

  it('does not read a source again when its tab is switched back to', async () => {
    await setup(dataPage('skills'));
    await screen.findByText('All 31 rows read. Scroll for the rest.');
    await userEvent.click(screen.getByRole('tab', { name: /Mail headers/ }));
    await screen.findByText('All 12 rows read. Scroll for the rest.');
    await userEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    await screen.findByText('All 31 rows read. Scroll for the rest.');
    expect(rawCalls().filter((call) => call.args[3] === 'skills')).toHaveLength(3);
  });

  it('switches character, and counts the filtered rows', async () => {
    await setup(dataPage('skills'));
    await screen.findByText('All 31 rows read. Scroll for the rest.');
    const group = screen.getByRole('group', { name: 'Character' });
    await userEvent.click(within(group).getByRole('button', { name: 'Tamsin Vell' }));
    expect(await screen.findByText('All 11 rows read. Scroll for the rest.')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('character=2118000001');
    expect(screen.queryByRole('columnheader', { name: 'Character' })).toBeNull();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Skills' }), 'cynosural');
    expect(await screen.findByText('1 of 11 rows')).toBeInTheDocument();
    expect(screen.getByText('Cynosural Field Theory')).toBeInTheDocument();
  });

  it('tints a flagged skill row and links it back to its flag', async () => {
    await setup(dataPage('skills'));
    const row = (await screen.findByText('Cynosural Field Theory')).closest('tr')!;
    const link = within(row).getByRole('link', { name: 'Cyno skills, no capital pilot declared' });
    expect(link).toHaveAttribute('href', `/corp/vetting/open/${FLAGGED}#flag-cynoNoCapital`);
    expect(row.className).toMatch(/bg-warning/);
  });

  it('links a resolved skill name to the skill info route', async () => {
    await setup(dataPage('skills'));
    const link = await screen.findByRole('link', { name: 'Cynosural Field Theory' });
    expect(link).toHaveAttribute('href', expect.stringContaining('?info=skill-21603'));
  });

  it('says so when filters match nothing, and clears them', async () => {
    await setup(dataPage('skills'));
    await screen.findByText('All 31 rows read. Scroll for the rest.');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Skills' }), 'zzzz');
    expect(await screen.findByText('No rows match')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByText('All 31 rows read. Scroll for the rest.')).toBeInTheDocument();
  });

  it('shows an empty source as a result, apart from "no rows match"', async () => {
    await setup(dataPage('contact'));
    expect(await screen.findByText('No contacts rows')).toBeInTheDocument();
    expect(screen.getByText(/We read this source and found nothing/)).toBeInTheDocument();
    expect(screen.queryByText('No rows match')).toBeNull();
  });

  it('reads a bad source in the path as the first one', async () => {
    await setup(`/corp/vetting/open/${FLAGGED}/data/nonsense`);
    expect(
      await screen.findByRole('tab', { name: /Wallet journal/, selected: true })
    ).toBeInTheDocument();
  });

  it('keeps what loaded and offers Retry when a page fails', async () => {
    fixture = createVettingFixture();
    const rawRows = fixture.rawRows;
    let calls = 0;
    fixture.rawRows = async (...args) => {
      calls += 1;
      if (calls === 3) throw new Error('boom');
      return rawRows(...args);
    };
    setVettingBackendOverride(fixture);
    await seedCharacter(CHARACTER);
    await db.characters.update(CHARACTER, {
      corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
    render(
      <MemoryRouter initialEntries={[dataPage('wallet')]}>
        <Routes>
          <Route path="/corp/vetting/*" element={<VettingPage />} />
        </Routes>
      </MemoryRouter>
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the rest. 1,000 of 4,652 rows loaded.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('All 4,652 rows read. Scroll for the rest.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says how many rows could not be loaded, and never claims all of them', async () => {
    fixture = createVettingFixture();
    const rawRows = fixture.rawRows;
    fixture.rawRows = async (...args) => {
      const page = await rawRows(...args);
      return { ...page, next: null };
    };
    setVettingBackendOverride(fixture);
    await seedCharacter(CHARACTER);
    await db.characters.update(CHARACTER, {
      corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
    render(
      <MemoryRouter initialEntries={[dataPage('skills')]}>
        <Routes>
          <Route path="/corp/vetting/*" element={<VettingPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('20 of 31 rows could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText(/^All \d+ rows read/)).toBeNull();
  });

  it('draws a row with a malformed date instead of throwing', async () => {
    fixture = createVettingFixture();
    const rawRows = fixture.rawRows;
    fixture.rawRows = async (...args) => {
      const page = await rawRows(...args);
      return {
        ...page,
        rows: page.rows.map((row) => (row.at ? { ...row, at: 'not-a-date' } : row)),
      };
    };
    setVettingBackendOverride(fixture);
    await seedCharacter(CHARACTER);
    await db.characters.update(CHARACTER, {
      corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
    render(
      <MemoryRouter initialEntries={[dataPage('mail')]}>
        <Routes>
          <Route path="/corp/vetting/*" element={<VettingPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect((await screen.findAllByText('not-a-date')).length).toBeGreaterThan(0);
  });

  it('says so, with no rows, when the review is about the reviewer', async () => {
    await setup(`/corp/vetting/open/${VETTING_FIXTURE_REVIEWS.aboutYou}/data/wallet`, {
      extra: 'requests',
    });
    expect(
      await screen.findByText('This review is about you, so you cannot open it.')
    ).toBeInTheDocument();
    expect(rawCalls()).toHaveLength(0);
  });

  it('has a Select past three characters', async () => {
    fixture = createVettingFixture();
    const open = fixture.open;
    fixture.open = async (...args) => {
      const review = await open(...args);
      review.reportCharacters = [
        ...review.reportCharacters,
        { ...review.reportCharacters[0]!, characterId: 2118000099, name: 'Fourth Vell' },
      ];
      return review;
    };
    setVettingBackendOverride(fixture);
    await seedCharacter(CHARACTER);
    await db.characters.update(CHARACTER, {
      corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
    render(
      <MemoryRouter initialEntries={[dataPage('skills')]}>
        <Routes>
          <Route path="/corp/vetting/*" element={<VettingPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole('combobox', { name: 'Character' })).toHaveTextContent(
      'All characters'
    );
    expect(screen.queryByRole('group', { name: 'Character' })).toBeNull();
    expect(await screen.findByText(/rows read/)).toBeInTheDocument();
  });
});

describe('the consent terms', () => {
  it('say the rows are kept after Send, until the same dates, and the login is not', () => {
    render(<VettingConsentTerms readers="officers" />);
    expect(screen.getByText('Kept after you press Send')).toBeInTheDocument();
    expect(screen.getByText('Every row listed here, kept with your report')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Deleted 30 days after the decision, or 90 days after you share if nobody decides, or when you delete it'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('You can delete it at any time')).toBeInTheDocument();
    expect(screen.getByText('The subject or text of your mail')).toBeInTheDocument();
    expect(screen.getByText('We do not keep your login')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is read again/)).toBeNull();
    expect(screen.queryByText(/when you withdraw/)).toBeNull();
  });
});
