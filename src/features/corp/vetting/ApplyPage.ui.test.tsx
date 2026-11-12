import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { textActionClassName } from '@/components/ui';
import {
  createVettingFixture,
  VETTING_FIXTURE_APPLICANT,
  VETTING_FIXTURE_CONFIGURED,
  VETTING_FIXTURE_CORPORATION,
  type VettingFixture,
  type VettingFixtureOptions,
} from '@/storybook/vettingFixture';
import { ApplyPage } from './ApplyPage';
import { setVettingBackendOverride } from './vettingBackend';
import { readVettingDraft, writeVettingDraft } from './vettingDraft';
import { readVettingHandle, writeVettingHandle } from './vettingHandle';
import type { VettingLoginOutcome } from './vettingLoginState';

const CORP = VETTING_FIXTURE_CORPORATION.corporationId;
const SLOT = `apply:${CORP}` as const;
const [tamsin, mira] = VETTING_FIXTURE_APPLICANT;

const loginAs = (character: { characterId: number; name: string }): VettingLoginOutcome => ({
  status: 'ok',
  accessToken: `fixture:${character.characterId}`,
  characterId: character.characterId,
  name: character.name,
});

let fixture: VettingFixture;

function setup(
  options: VettingFixtureOptions = {},
  props: {
    login?: VettingLoginOutcome | null;
    corporationId?: number | null;
    invite?: string | null;
  } = {}
) {
  fixture = createVettingFixture(options);
  setVettingBackendOverride(fixture);
  if (options.application && options.application !== 'none') {
    writeVettingHandle(SLOT, fixture.applicationHandle);
  }
  const onSignIn = vi.fn();
  const view = render(
    <ApplyPage
      corporationId={props.corporationId === undefined ? CORP : props.corporationId}
      invite={props.invite}
      login={props.login ?? null}
      onSignIn={onSignIn}
      onOpenApp={vi.fn()}
    />
  );
  return { onSignIn, ...view };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => setVettingBackendOverride(null));

describe('ApplyPage', () => {
  it('starts with how it works, what is shared, and the EVE login', async () => {
    const { onSignIn } = setup();
    expect(
      await screen.findByRole('heading', { level: 1, name: /Apply to Brass Meridian Logistics/ })
    ).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
    expect(screen.getByText('Who you wrote with. No subject or text is kept')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log in with EVE Online' }));
    expect(onSignIn).toHaveBeenCalledWith(undefined);
    expect(fixture.calls.map((call) => call.method)).toEqual(['corpInfo']);
  });

  it('reads the first character it comes back from EVE with, and keeps the handle, never the token', async () => {
    setup({}, { login: loginAs(tamsin) });
    const list = await screen.findByRole('list');
    expect(await within(list).findByText('Tamsin Vell')).toBeInTheDocument();
    expect(await within(list).findByText('Read')).toBeInTheDocument();
    expect(fixture.calls.find((call) => call.method === 'start')?.args).toEqual([
      CORP,
      `fixture:${tamsin.characterId}`,
    ]);
    expect(readVettingHandle(SLOT)).toEqual(fixture.applicationHandle);
    expect(JSON.stringify({ ...localStorage })).not.toContain('fixture:');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('fixture:');
  });

  it('shows the row as Reading while the server reads it', async () => {
    setup({ delayMs: 50 }, { login: loginAs(tamsin) });
    expect(await screen.findByText('Reading')).toBeInTheDocument();
    expect(await screen.findByText('Read')).toBeInTheDocument();
  });

  it('adds a second character to the draft it already holds', async () => {
    setup({ application: 'none' }, { login: loginAs(tamsin) });
    await screen.findByText('Read');
    // A return visit: the handle is in storage, and the next login adds to the same draft.
    setVettingBackendOverride(fixture);
    render(<ApplyPage corporationId={CORP} login={loginAs(mira)} onSignIn={vi.fn()} />);
    expect(await screen.findAllByText('Mira Vell')).not.toHaveLength(0);
    expect(fixture.calls.filter((call) => call.method === 'addCharacter')).toHaveLength(1);
  });

  it('marks a character that did not share everything, and offers the login again', async () => {
    const { onSignIn } = setup({ application: 'draft' });
    expect(await screen.findByText('Part missing')).toBeInTheDocument();
    expect(screen.getByText('Mail not shared. That check will not run.')).toBeInTheDocument();
    // Goes to EVE's login, so a Button; Remove beside it acts in place and stays a text action.
    const again = screen.getByRole('button', { name: 'Log in again as Mira Vell' });
    const remove = screen.getByRole('button', { name: 'Remove Mira Vell' });
    const textAction = textActionClassName().split(' ');
    expect(again).toHaveTextContent('Log in again');
    expect(again).not.toHaveClass(...textAction);
    expect(remove).toHaveClass(...textAction);
    await userEvent.click(again);
    expect(onSignIn).toHaveBeenCalledWith(fixture.applicationHandle.reviewId);
  });

  it('keeps Send inert until the pilot says these are all their characters, then lands on the status', async () => {
    setup({ application: 'draft' });
    const send = await screen.findByRole('button', { name: 'Send to Brass Meridian Logistics' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(send);
    expect(fixture.calls.some((call) => call.method === 'submit')).toBe(false);

    await userEvent.click(screen.getByRole('checkbox', { name: /These are all my characters/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Note to the recruiters/ }), ' Hi ');
    expect(send).not.toHaveAttribute('aria-disabled');
    await userEvent.click(send);

    expect(await screen.findByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('3 characters read. The report is with the recruiters.')).toBeVisible();
    expect(screen.getByText('Nobody yet')).toBeInTheDocument();
    expect(fixture.calls.find((call) => call.method === 'submit')?.args[1]).toBe('Hi');
  });

  it('keeps the answers, the note and the tick across the EVE login for another character', async () => {
    const first = setup({ application: 'draft', settings: VETTING_FIXTURE_CONFIGURED });
    const timezone = await screen.findByRole('textbox', { name: /What timezone do you play in/ });
    await userEvent.type(timezone, 'EU evenings');
    await userEvent.type(screen.getByRole('textbox', { name: /Note to the recruiters/ }), 'Hi');
    await userEvent.click(screen.getByRole('checkbox', { name: /These are all my characters/ }));
    // Leaves for EVE: the page is gone until the login comes back.
    await userEvent.click(screen.getByRole('button', { name: 'Log in again as Mira Vell' }));
    first.unmount();

    setVettingBackendOverride(fixture);
    render(<ApplyPage corporationId={CORP} login={loginAs(mira)} onSignIn={vi.fn()} />);
    expect(
      await screen.findByRole('textbox', { name: /What timezone do you play in/ })
    ).toHaveValue('EU evenings');
    expect(screen.getByRole('textbox', { name: /Note to the recruiters/ })).toHaveValue('Hi');
    expect(screen.getByRole('checkbox', { name: /These are all my characters/ })).toBeChecked();
    // In this tab only, and never a token.
    expect(JSON.stringify({ ...localStorage })).not.toContain('EU evenings');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('fixture:');
  });

  it('forgets what was typed once sent, and on Start over', async () => {
    const reviewId = () => fixture.applicationHandle.reviewId;
    const sent = setup({ application: 'draft' });
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Note to the recruiters/ }),
      'Hi'
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /These are all my characters/ }));
    writeVettingDraft(reviewId(), { answers: {}, note: 'Hi', allMine: true });
    await userEvent.click(screen.getByRole('button', { name: 'Send to Brass Meridian Logistics' }));
    expect(await screen.findByText('Waiting')).toBeInTheDocument();
    expect(readVettingDraft(reviewId())).toBeNull();
    sent.unmount();

    localStorage.clear();
    setup({ application: 'draft' });
    writeVettingDraft(reviewId(), { answers: {}, note: 'Hi', allMine: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start over' })
    );
    expect(await screen.findByRole('button', { name: 'Log in with EVE Online' })).toBeVisible();
    expect(readVettingDraft(reviewId())).toBeNull();
  });

  it('removes a character from the draft', async () => {
    setup({ application: 'draft' });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Vell Hauling' }));
    expect(await screen.findByText('2 added')).toBeInTheDocument();
    expect(screen.queryByText('Vell Hauling')).not.toBeInTheDocument();
  });

  it('shows who opened a sent report, and withdraws only after a confirm', async () => {
    setup({ application: 'opened' });
    expect(await screen.findByText('Kestrel Vane')).toBeInTheDocument();
    // Opens a confirm, so a Button, not a text action.
    const withdraw = screen.getByRole('button', { name: 'Withdraw and delete the report' });
    expect(withdraw).not.toHaveClass(...textActionClassName().split(' '));
    await userEvent.click(withdraw);
    expect(fixture.calls.some((call) => call.method === 'withdraw')).toBe(false);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete the report' }));
    expect(await screen.findByText('The report is deleted. Nothing is kept.')).toBeInTheDocument();
    expect(readVettingHandle(SLOT)).toBeNull();
  });

  it('says when a waiting report is deleted either way', async () => {
    setup({ application: 'sent' });
    expect(
      await screen.findByText(/^30 days after the decision, or .+ if nobody decides$/)
    ).toBeInTheDocument();
  });

  it('starts over from the draft only after a confirm, deleting it and forgetting the handle', async () => {
    setup({ application: 'draft' });
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }));
    expect(fixture.calls.some((call) => call.method === 'withdraw')).toBe(false);
    const dialog = within(await screen.findByRole('dialog', { name: 'Start over?' }));
    expect(
      dialog.getByText(
        'The characters read so far are deleted. Nothing is sent to Brass Meridian Logistics.'
      )
    ).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByRole('button', { name: 'Log in with EVE Online' })).toBeVisible();
    expect(fixture.calls.find((call) => call.method === 'withdraw')?.args).toEqual([
      fixture.applicationHandle,
    ]);
    expect(readVettingHandle(SLOT)).toBeNull();
    expect(screen.queryByText('Tamsin Vell')).not.toBeInTheDocument();
  });

  it('starts over even when the draft has already expired on the server', async () => {
    setup({ application: 'draft' });
    await screen.findByText('Part missing');
    fixture.withdraw = async () => {
      throw Object.assign(new Error('x'), { details: { reason: 'bad-key' } });
    };
    setVettingBackendOverride(fixture);
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start over' })
    );
    expect(await screen.findByRole('button', { name: 'Log in with EVE Online' })).toBeVisible();
    expect(readVettingHandle(SLOT)).toBeNull();
  });

  it('names the in-game step once accepted', async () => {
    setup({ application: 'accepted' });
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
    expect(
      screen.getByText(/open Brass Meridian Logistics's corporation window and press Apply to join/)
    ).toBeInTheDocument();
  });

  it('says a cancelled login read nothing', async () => {
    setup({}, { login: { status: 'cancelled' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Login cancelled. Nothing was read.'
    );
    expect(fixture.calls.some((call) => call.method === 'start')).toBe(false);
  });

  it('says so when the corp has vetting off or the link names no corp', async () => {
    const off = setup({ on: false });
    expect(await screen.findByText('Not taking applications here')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in with EVE Online' })).toBeNull();
    off.unmount();

    setup({}, { corporationId: 1 });
    expect(await screen.findByText('No such apply link')).toBeInTheDocument();
    setup({}, { corporationId: null });
    expect(await screen.findAllByText('No such apply link')).toHaveLength(2);
  });

  it('words a refusal from its reason and falls back for an unknown one', async () => {
    setup({ application: 'draft' });
    await screen.findByText('Part missing');
    fixture.removeCharacter = async () => {
      throw Object.assign(new Error('x'), { details: { reason: 'wrong-state' } });
    };
    setVettingBackendOverride(fixture);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Vell Hauling' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The report is already sent.');
    fixture.removeCharacter = async () => {
      throw new Error('boom');
    };
    await userEvent.click(screen.getByRole('button', { name: 'Remove Vell Hauling' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not work. Try again.');
  });
});

describe('ApplyPage with what the corp set', () => {
  const draft = { application: 'draft', settings: VETTING_FIXTURE_CONFIGURED } as const;
  const sendButton = () =>
    screen.findByRole('button', { name: 'Send to Brass Meridian Logistics' });
  const tick = () =>
    userEvent.click(screen.getByRole('checkbox', { name: /These are all my characters/ }));

  it('opens with the welcome and what the corp asks, above how it works', async () => {
    setup({ settings: VETTING_FIXTURE_CONFIGURED });
    expect(await screen.findByText(/We fly out of Hollow Reach/)).toBeInTheDocument();
    expect(screen.getByText('What this corp asks')).toBeInTheDocument();
    expect(screen.getByText('A character at least 365 days old')).toBeInTheDocument();
    expect(screen.getByText('20,000,000 skill points')).toBeInTheDocument();
    expect(screen.getByText('At least 2 characters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in with EVE Online' })).toBeInTheDocument();
  });

  it('shows neither block for a corp that set nothing', async () => {
    setup();
    await screen.findByText('How it works');
    expect(screen.queryByText('What this corp asks')).toBeNull();
    expect(screen.queryByText(/^From /)).toBeNull();
  });

  it('says to ask a recruiter, with no login, when the corp is invite-only and the link has no live code', async () => {
    const bare = setup({ settings: { inviteOnly: true } });
    expect(
      await screen.findByText('Brass Meridian Logistics takes applications by invite')
    ).toBeInTheDocument();
    expect(screen.getByText('Ask a recruiter for a link.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in with EVE Online' })).toBeNull();
    bare.unmount();

    setup({ settings: { inviteOnly: true } }, { invite: 'revoked-code' });
    expect(
      await screen.findByText('Brass Meridian Logistics takes applications by invite')
    ).toBeInTheDocument();
    expect(fixture.calls.find((call) => call.method === 'corpInfo')?.args).toEqual([
      CORP,
      'revoked-code',
    ]);
  });

  it('takes a live invite: the login is offered, and the code goes with the first read', async () => {
    const start = setup({ settings: { inviteOnly: true } }, { invite: 'inv-forum' });
    expect(await screen.findByRole('button', { name: 'Log in with EVE Online' })).toBeVisible();
    start.unmount();

    setup({ settings: { inviteOnly: true } }, { invite: 'inv-forum', login: loginAs(tamsin) });
    const list = await screen.findByRole('list');
    expect(await within(list).findByText('Read')).toBeInTheDocument();
    expect(fixture.calls.find((call) => call.method === 'start')?.args).toEqual([
      CORP,
      `fixture:${tamsin.characterId}`,
      'inv-forum',
    ]);
  });

  it('asks the corp’s questions above the note and keeps Send inert until the required ones are answered', async () => {
    setup(draft);
    const send = await sendButton();
    await tick();
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Answer the required questions to send.')).toBeInTheDocument();
    await userEvent.click(send);
    expect(fixture.calls.some((call) => call.method === 'submit')).toBe(false);

    const timezone = screen.getByRole('textbox', {
      name: 'What timezone do you play in? (required)',
    });
    expect(timezone).toHaveAttribute('aria-required', 'true');
    expect(timezone).toHaveAttribute('maxlength', '500');
    expect(screen.getByRole('textbox', { name: 'Who told you about us?' })).not.toHaveAttribute(
      'aria-required'
    );
    await userEvent.type(timezone, 'EU');
    expect(send).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'What do you fly most? (required)' }),
      ' Orca '
    );
    expect(send).not.toHaveAttribute('aria-disabled');
    await userEvent.click(send);

    expect(await screen.findByText('Waiting')).toBeInTheDocument();
    expect(fixture.calls.find((call) => call.method === 'submit')?.args.slice(1)).toEqual([
      '',
      [
        { questionId: 'q-timezone', answer: 'EU' },
        { questionId: 'q-referral', answer: '' },
        { questionId: 'q-ships', answer: ' Orca ' },
      ],
    ]);
  });

  it('lists the minimums not met and keeps Send inert while any is', async () => {
    setup({
      application: 'draft',
      settings: { minimums: { ageDays: 4000, skillPoints: 20_000_000, characters: 5 } },
    });
    const send = await sendButton();
    await tick();
    const unmet = within(screen.getByText(/^Not met yet/).parentElement!);
    expect(unmet.getByText('A character at least 4,000 days old')).toBeInTheDocument();
    expect(unmet.getByText('At least 5 characters')).toBeInTheDocument();
    expect(unmet.queryByText(/skill points/)).toBeNull();
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('This application does not meet what Brass Meridian Logistics asks yet.')
    ).toBeInTheDocument();
    await userEvent.click(send);
    expect(fixture.calls.some((call) => call.method === 'submit')).toBe(false);
  });

  it('lists what the server says is unmet when Send is refused for it', async () => {
    setup({ application: 'draft' });
    const send = await sendButton();
    await tick();
    fixture.submit = async () => {
      throw Object.assign(new Error('skillPoints'), { details: { reason: 'below-minimum' } });
    };
    setVettingBackendOverride(fixture);
    await userEvent.click(send);
    expect(await screen.findByText(/^Not met yet/)).toBeInTheDocument();
    expect(screen.getByText('0 skill points')).toBeInTheDocument();
    expect(send).toHaveAttribute('aria-disabled', 'true');
  });

  it('words an answers-required refusal', async () => {
    setup({ application: 'draft' });
    const send = await sendButton();
    await tick();
    fixture.submit = async () => {
      throw Object.assign(new Error('x'), { details: { reason: 'answers-required' } });
    };
    setVettingBackendOverride(fixture);
    await userEvent.click(send);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Answer the required questions first.'
    );
  });

  it('shows the contact line and the pilot’s own answers once sent', async () => {
    setup({ application: 'sent', settings: VETTING_FIXTURE_CONFIGURED });
    expect(await screen.findByText('Contact')).toBeInTheDocument();
    expect(screen.getByText(/Ilse Marrow or Bram Soto/)).toBeInTheDocument();
    expect(screen.queryByText('EU, most evenings from 19:00 EVE time.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show your answers' }));
    expect(screen.getByText('What timezone do you play in?')).toBeInTheDocument();
    expect(screen.getByText('EU, most evenings from 19:00 EVE time.')).toBeInTheDocument();
  });

  it('says a no in the corp’s wording, with its reasons when the corp shows them', async () => {
    const soft = setup({ application: 'rejected', settings: VETTING_FIXTURE_CONFIGURED });
    expect(await screen.findByText('Not at this time')).toBeInTheDocument();
    expect(screen.getByText(/^Not at this time\. Decided /)).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText(/We are full on haulers this month/)).toBeInTheDocument();
    expect(screen.queryByText('Rejected')).toBeNull();
    soft.unmount();

    setup({ application: 'rejected' });
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText(/^Rejected\. Decided /)).toBeInTheDocument();
    expect(screen.queryByText('Reason')).toBeNull();
    expect(screen.queryByText(/full on haulers/)).toBeNull();
  });
});
