import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import {
  createVettingFixture,
  VETTING_FIXTURE_APPLICANT,
  VETTING_FIXTURE_CORPORATION,
  type VettingFixture,
  type VettingFixtureOptions,
} from '@/storybook/vettingFixture';
import { ApplyPage } from './ApplyPage';
import { setVettingBackendOverride } from './vettingBackend';
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
  props: { login?: VettingLoginOutcome | null; corporationId?: number | null } = {}
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
      login={props.login ?? null}
      onSignIn={onSignIn}
      onOpenApp={vi.fn()}
    />
  );
  return { onSignIn, ...view };
}

beforeEach(() => localStorage.clear());
afterEach(() => setVettingBackendOverride(null));

describe('ApplyPage', () => {
  it('starts with how it works, what is shared, and the EVE login', async () => {
    const { onSignIn } = setup();
    expect(
      await screen.findByRole('heading', { level: 1, name: /Apply to Brass Meridian Logistics/ })
    ).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
    expect(screen.getByText('Who and subject, never the message')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Log in again as Mira Vell' }));
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

  it('removes a character from the draft', async () => {
    setup({ application: 'draft' });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Vell Hauling' }));
    expect(await screen.findByText('2 added')).toBeInTheDocument();
    expect(screen.queryByText('Vell Hauling')).not.toBeInTheDocument();
  });

  it('shows who opened a sent report, and withdraws only after a confirm', async () => {
    setup({ application: 'opened' });
    expect(await screen.findByText('Kestrel Vane')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw and delete the report' }));
    expect(fixture.calls.some((call) => call.method === 'withdraw')).toBe(false);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete the report' }));
    expect(await screen.findByText('The report is deleted. Nothing is kept.')).toBeInTheDocument();
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
