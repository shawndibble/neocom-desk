import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { seedCharacter } from '@/test/seed';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  createVettingFixture,
  VETTING_FIXTURE_CONFIGURED,
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
    // The ISK flag says how far back the wallet goes.
    expect(screen.getByText(/from Wallet journal, about the last 30 days$/)).toBeInTheDocument();
    // The first flag's rows are open, each party an entity link.
    expect(screen.getAllByRole('link', { name: 'Corvin Hale' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Could not check')).toBeInTheDocument();
    expect(screen.getByText('Mira Vell did not share Mail.')).toBeInTheDocument();
    expect(fixture.calls.filter((call) => call.method === 'open')).toHaveLength(1);
    expect(fixture.calls.find((call) => call.method === 'open')?.args[2]).toBe(
      VETTING_FIXTURE_REVIEWS.flagged
    );
  });

  it('says so, with no retry, when the review is about the reviewer', async () => {
    fixture = createVettingFixture();
    fixture.open = async () => {
      throw Object.assign(new Error('x'), { details: { reason: 'own-review' } });
    };
    setVettingBackendOverride(fixture);
    await seedCharacter(CHARACTER);
    await db.characters.update(CHARACTER, {
      corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
    });
    useActiveCharacter.setState({ activeCharacterId: CHARACTER, hydrated: true });
    render(
      <MemoryRouter initialEntries={[`/corp/vetting/open/${VETTING_FIXTURE_REVIEWS.flagged}`]}>
        <Routes>
          <Route path="/corp/vetting/*" element={<VettingPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(
      await screen.findByText('This review is about you, so you cannot open it.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again|Retry/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Vetting' })).toBeInTheDocument();
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
    expect(
      screen.getByText('Vetting is off. The CEO or a Director turns it on.')
    ).toBeInTheDocument();
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

  it('saves a watchlist entry and on or off, each by itself', async () => {
    await setup('/corp/vetting/settings/watchlist');
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
    await userEvent.click(screen.getByRole('link', { name: 'General' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('shows where an application came from, in the queue and on the report', async () => {
    await setup('/corp/vetting/open', { settings: VETTING_FIXTURE_CONFIGURED });
    const pell = await rowOf('Pell Okonru');
    expect(within(pell).getByText('Invite: Pell Okonru')).toBeInTheDocument();
    expect(within(await rowOf('Tamsin Vell')).queryByText(/^Invite:/)).toBeNull();
    await userEvent.click(pell);
    expect(await screen.findByText(/Invite: Pell Okonru/)).toBeInTheDocument();
    const answers = within(screen.getByText('Their answers').closest('section')!);
    expect(answers.getByText('What timezone do you play in?')).toBeInTheDocument();
    expect(answers.getByText('EU, most evenings from 19:00 EVE time.')).toBeInTheDocument();
  });

  it('has no answers panel when the corp asks nothing', async () => {
    await setup(`/corp/vetting/open/${VETTING_FIXTURE_REVIEWS.flagged}`);
    expect(await screen.findByText('Their note')).toBeInTheDocument();
    expect(screen.queryByText('Their answers')).toBeNull();
  });
});

const saved = () => fixture.calls.filter((call) => call.method === 'saveSettings');
const lastPatch = () => saved().at(-1)?.args[2];

describe('VettingPage settings', () => {
  it('shows a corp that set nothing its defaults, with nothing to save', async () => {
    await setup('/corp/vetting/settings');
    expect(await screen.findByLabelText('Welcome message')).toHaveValue('');
    expect(screen.getByLabelText('Contact line')).toHaveValue('');
    expect(screen.getByText('0 / 600')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('link', { name: 'Applicants' }));
    expect(await screen.findByLabelText('Character age')).toHaveValue('0');
    expect(screen.getByLabelText('Skill points')).toHaveValue('0');
    expect(screen.getByLabelText('Characters declared')).toHaveValue('1');
    expect(screen.getByText('No questions')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Invite-only' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('link', { name: 'Decisions' }));
    const pressed = (group: string, name: string) =>
      within(screen.getByRole('group', { name: group })).getByRole('button', { name });
    expect(pressed('Applications', '1')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('Promotions', '2')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('A no reads as', 'Rejected')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Show the pilot the reason' })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Offer a mail to the pilot when decided' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Tell reviewers about a new report' })
    ).toBeChecked();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(saved()).toHaveLength(0);
  });

  it('keeps edits across sections in one draft and saves only what changed', async () => {
    await setup('/corp/vetting/settings/general');
    await userEvent.type(await screen.findByLabelText('Welcome message'), 'Fly safe.');
    expect(screen.getByText('9 / 600')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: /^Applicants/ }));
    const age = await screen.findByLabelText('Character age');
    await userEvent.clear(age);
    await userEvent.type(age, '99999');
    await userEvent.tab();
    expect(age).toHaveValue('3,650');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Invite-only' }));

    await userEvent.click(screen.getByRole('link', { name: /^Decisions/ }));
    await userEvent.click(
      within(await screen.findByRole('group', { name: 'A no reads as' })).getByRole('button', {
        name: 'Not at this time',
      })
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show the pilot the reason' }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Tell reviewers about a new report' })
    );
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Applications' })).getByRole('button', { name: '2' })
    );
    expect(saved()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findAllByText('Settings saved')).length).toBeGreaterThan(0);
    expect(saved()).toHaveLength(1);
    expect(lastPatch()).toEqual({
      welcome: 'Fly safe.',
      minimums: { ageDays: 3650, skillPoints: 0, characters: 1 },
      inviteOnly: true,
      signOffs: { application: 2, promotion: 2 },
      rejection: { wording: 'notNow', showReason: true },
      notifyReviewers: false,
    });
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    // By invite now: the header makes an invite link instead of copying the bare one.
    expect(screen.getByRole('button', { name: 'New invite link' })).toBeInTheDocument();
  });

  it('moves focus to the neighbouring question when one is removed, and keeps an end button focusable', async () => {
    await setup('/corp/vetting/settings/applicants', { settings: VETTING_FIXTURE_CONFIGURED });
    const remove = (n: number) => screen.getByRole('button', { name: `Remove question ${n}` });
    await screen.findByRole('button', { name: 'Remove question 1' });
    const count = screen.getAllByRole('button', { name: /^Remove question/ }).length;
    expect(count).toBeGreaterThanOrEqual(2);

    // Inert at the ends, but not `disabled`: Tab still reaches it.
    const up = screen.getByRole('button', { name: 'Move question 1 up' });
    expect(up).toHaveAttribute('aria-disabled', 'true');
    expect(up).not.toBeDisabled();
    // Moving the second question up leaves its button at the top: focus stays on it.
    await userEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move question 1 up' })).toHaveFocus()
    );

    // Not the last: the question that takes its place.
    await userEvent.click(remove(1));
    await waitFor(() => expect(remove(1)).toHaveFocus());
    // The last: the one before it.
    for (let left = count - 1; left > 1; left -= 1) {
      await userEvent.click(remove(left));
      await waitFor(() => expect(remove(left - 1)).toHaveFocus());
    }
    // None left: Add question.
    await userEvent.click(remove(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add a question' })).toHaveFocus()
    );
  });

  it('moves focus to the next watchlist entry when one is removed', async () => {
    await setup('/corp/vetting/settings/watchlist');
    const buttons = await screen.findAllByRole('button', { name: /^Remove / });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const nextName = buttons[1].getAttribute('aria-label')!;
    await userEvent.click(buttons[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: nextName })).toHaveFocus());
  });

  it('discards a draft, and blocks Save on a minimum that is not a number', async () => {
    await setup('/corp/vetting/settings/applicants');
    const points = await screen.findByLabelText('Skill points');
    await userEvent.clear(points);
    await userEvent.type(points, 'lots');
    expect(screen.getByText('Enter a whole number.')).toBeInTheDocument();
    expect(screen.getByText('1 problem to fix before saving')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Skill points')).toHaveValue('0');
    expect(screen.queryByText(/problem to fix/)).toBeNull();
  });

  it('adds, reorders and removes questions, and sends the list whole', async () => {
    await setup('/corp/vetting/settings/applicants', { settings: VETTING_FIXTURE_CONFIGURED });
    expect(await screen.findByLabelText('Question 1')).toHaveValue('What timezone do you play in?');
    expect(screen.getByText('3 of 8')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Question 1 is required' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Move question 1 up' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Move question 3 down' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add a question' }));
    // A question with no wording blocks Save until it is written or removed.
    expect(screen.getByText('Write the question, or remove it.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Question 4'), 'Voice?');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Question 4 is required' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move question 4 up' }));
    expect(screen.getByLabelText('Question 3')).toHaveValue('Voice?');
    await userEvent.click(screen.getByRole('button', { name: 'Remove question 2' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Question 1 is required' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findAllByText('Settings saved')).length).toBeGreaterThan(0);
    expect(lastPatch()).toEqual({
      questions: [
        { id: 'q-timezone', label: 'What timezone do you play in?', required: false },
        { label: 'Voice?', required: true },
        { id: 'q-ships', label: 'What do you fly most?', required: true },
      ],
    });
    expect(screen.getByLabelText('Question 2')).toHaveValue('Voice?');
  });

  it('says why a save was refused and keeps the draft', async () => {
    await setup('/corp/vetting/settings/general');
    await userEvent.type(await screen.findByLabelText('Contact line'), 'Ilse');
    fixture.saveSettings = async () => {
      throw Object.assign(new Error('x'), { details: { reason: 'role-required' } });
    };
    setVettingBackendOverride(fixture);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This needs CEO or Director.');
    expect(screen.getByLabelText('Contact line')).toHaveValue('Ilse');
  });
});

describe('VettingPage invites', () => {
  const inviteOnly = { settings: { inviteOnly: true } } as const;

  it('copies the public link while the corp is not invite-only', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Copy apply link' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/apply/${VETTING_FIXTURE_CORPORATION.corporationId}`
      )
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('makes an invite link for an invite-only corp, and copies it', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await setup('/corp/vetting/open', inviteOnly);
    expect(screen.queryByRole('button', { name: 'Copy apply link' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'New invite link' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'New invite link' }));
    const create = dialog.getByRole('button', { name: 'Create link' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(dialog.getByLabelText('Who it is for'), 'Sio Tane');
    await userEvent.click(create);

    const link = await dialog.findByRole('textbox', { name: 'Link for Sio Tane' });
    const made = fixture.calls.find((call) => call.method === 'createInvite');
    expect(made?.args.slice(1)).toEqual([VETTING_FIXTURE_CORPORATION.corporationId, 'Sio Tane']);
    expect((link as HTMLInputElement).value).toMatch(
      new RegExp(`/apply/${VETTING_FIXTURE_CORPORATION.corporationId}\\?invite=inv-3-sio-tane$`)
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Copy link for Sio Tane' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith((link as HTMLInputElement).value));
    vi.unstubAllGlobals();
  });

  it('lists the invite links with who made each and how many started, and revokes after a confirm', async () => {
    await setup('/corp/vetting/open', inviteOnly);
    await userEvent.click(await screen.findByRole('button', { name: 'Invites' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Invite links' }));
    const forum = within(dialog.getByText('Forum post').closest('tr')!);
    expect(forum.getByText('Ilse Marrow')).toBeInTheDocument();
    expect(forum.getByText('4')).toBeInTheDocument();

    // One visible action per row; Revoke is in the row's menu.
    expect(forum.getByRole('button', { name: 'Copy link for Forum post' })).toBeInTheDocument();
    expect(forum.queryByRole('button', { name: /Revoke/ })).toBeNull();
    await userEvent.click(forum.getByRole('button', { name: 'More actions for Forum post' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Revoke' }));
    expect(fixture.calls.some((call) => call.method === 'revokeInvite')).toBe(false);
    const confirm = within(await screen.findByRole('dialog', { name: 'Revoke this invite link?' }));
    expect(confirm.getByText(/The link for Forum post stops working/)).toBeInTheDocument();
    await userEvent.click(confirm.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(dialog.queryByText('Forum post')).toBeNull());
    expect(fixture.calls.find((call) => call.method === 'revokeInvite')?.args[2]).toBe('inv-forum');
    expect(dialog.getByText('Pell Okonru')).toBeInTheDocument();
    // The row and its menu button are gone: focus lands on a link that is left.
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: 'Copy link for Pell Okonru' })).toHaveFocus()
    );
  });

  it('offers Invites to every reviewer, by invite only or not, with or without a link made', async () => {
    await setup('/corp/vetting/open', { empty: true, canConfigure: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Invites' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Invite links' }));
    expect(dialog.getByText('No invite links')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Create link' })).toBeInTheDocument();
  });

  it('opens the invite links from Settings, for a Director', async () => {
    await setup('/corp/vetting/settings/applicants', { empty: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Invites (0)' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Invite links' }));
    expect(dialog.getByText('No invite links')).toBeInTheDocument();
    expect(dialog.getByText(/Invite-only is off/)).toBeInTheDocument();
  });
});
