import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { createSrpMemberFixture } from '@/storybook/srpMemberFixture';
import { MemberSrp } from './MemberSrp';
import { setSrpMemberBackendOverride, type SrpMemberBackend } from './srpMemberBackend';
import { esiKillmailLink } from './srpMemberModel';

const granted = vi.hoisted(() => ({ value: true as boolean | undefined }));
vi.mock('@/app/useGrantedScopes', () => ({ useEndpointsGranted: () => granted.value }));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async (ids: number[]) =>
    new Map(
      ids.map((id) => [
        id,
        ({ 24702: 'Hurricane', 11993: 'Cerberus', 16227: 'Ferox' } as Record<number, string>)[id] ??
          `Hull ${id}`,
      ])
    ),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30000142, { id: 30000142, name: 'Jita' }]]),
}));

const HASH = 'c'.repeat(40);
let backend: SrpMemberBackend;
let file: ReturnType<typeof vi.spyOn>;

function setup(options: Parameters<typeof createSrpMemberFixture>[1] = {}) {
  backend = createSrpMemberFixture(Date.now(), options);
  file = vi.spyOn(backend, 'file');
  setSrpMemberBackendOverride(backend);
  render(
    <MemoryRouter>
      <MemberSrp characterId={7} corporationId={98765432} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  granted.value = true;
});
afterEach(() => {
  cleanup();
  setSrpMemberBackendOverride(null);
});

describe('MemberSrp', () => {
  it('explains a corporation without SRP instead of locking', async () => {
    setup({ enabled: false });
    expect(await screen.findByText('SRP is not set up for your corporation')).toBeTruthy();
    expect(screen.queryByLabelText('Killmail link')).toBeNull();
  });

  it('lists lost ships with their outcome and My claims with state, amount and reason', async () => {
    setup();
    const lost = await screen.findByRole('table', { name: 'My lost ships' });
    await within(lost).findByRole('button', { name: 'File claim for Hurricane' });
    const hull = within(lost).getAllByRole('link', { name: 'Hurricane' })[0]!;
    expect(hull.getAttribute('href')).toContain('info=type-');
    expect(
      within(lost)
        .getAllByRole('link')
        .some((l) => l.getAttribute('href')?.includes('stops='))
    ).toBe(true);
    expect(within(lost).getByText('Claimed')).toBeTruthy();
    expect(within(lost).getByText('Not covered')).toBeTruthy();
    expect(within(lost).getByText('Too old')).toBeTruthy();
    const claims = screen.getByRole('table', { name: 'My SRP claims' });
    expect(within(claims).getByText('Pending')).toBeTruthy();
    expect(within(claims).getAllByText('Officer sets amount').length).toBeGreaterThan(0);
    expect(within(claims).getByText(/no FC listed/)).toBeTruthy();
    expect(within(claims).getByText('Re-filed once, final.')).toBeTruthy();
  });

  it('files a lost ship in one tap with its ESI link, and refreshes My claims', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'File claim for Hurricane' }));
    await waitFor(() => expect(file).toHaveBeenCalledTimes(1));
    expect(file).toHaveBeenCalledWith(7, 98765432, {
      killmail: esiKillmailLink(8001, HASH),
    });
    expect((await screen.findAllByText('Claim filed for Hurricane.')).length).toBeGreaterThan(0);
  });

  it('asks for the killmail Permission instead of listing, and pasting still works', async () => {
    granted.value = false;
    setup();
    expect(await screen.findByRole('button', { name: 'Grant killmail access' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'My lost ships' })).toBeNull();
    await userEvent.type(
      screen.getByLabelText('Killmail link'),
      'https://zkillboard.com/kill/555/'
    );
    await userEvent.click(screen.getByRole('button', { name: 'File claim' }));
    await waitFor(() =>
      expect(file).toHaveBeenCalledWith(7, 98765432, {
        killmail: 'https://zkillboard.com/kill/555/',
      })
    );
  });

  it('sends the Fleet or FC text with a claim', async () => {
    setup();
    await userEvent.type(await screen.findByLabelText('Fleet or FC (optional)'), 'Kestrel Vane');
    await userEvent.click(await screen.findByRole('button', { name: 'File claim for Hurricane' }));
    await waitFor(() =>
      expect(file).toHaveBeenCalledWith(7, 98765432, {
        killmail: esiKillmailLink(8001, HASH),
        fleetOrFc: 'Kestrel Vane',
      })
    );
  });

  it('does not file a lost ship without the Fleet or FC the corp requires: it fills the form in and asks', async () => {
    setup({ requireFleetOrFc: true });
    await userEvent.click(await screen.findByRole('button', { name: 'File claim for Hurricane' }));
    expect(file).not.toHaveBeenCalled();
    expect(await screen.findByText('Fleet or FC is required by your corp.')).toBeTruthy();
    expect((screen.getByLabelText('Killmail link') as HTMLInputElement).value).toBe(
      esiKillmailLink(8001, HASH)
    );
  });

  it('says a hull the corp does not cover is not covered', async () => {
    setup();
    await userEvent.type(
      await screen.findByLabelText('Killmail link'),
      'https://zkillboard.com/kill/1/notcovered'
    );
    await userEvent.click(screen.getByRole('button', { name: 'File claim' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not covered/i);
  });

  it('puts a refusal beside the field that can fix it', async () => {
    setup();
    await userEvent.type(
      await screen.findByLabelText('Killmail link'),
      'https://zkillboard.com/kill/1/mine'
    );
    await userEvent.click(screen.getByRole('button', { name: 'File claim' }));
    expect(await screen.findByText('Paste a killmail where you were the victim.')).toBeTruthy();
  });

  it('re-files a Rejected claim once, with a required note', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Re-file claim for Ferox' }));
    const submit = screen.getByRole('button', { name: 'Re-file claim' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Note'), 'FC was Kestrel Vane.');
    await userEvent.click(submit);
    await waitFor(() =>
      expect(file).toHaveBeenCalledWith(7, 98765432, {
        killmail: esiKillmailLink(7004, HASH),
        note: 'FC was Kestrel Vane.',
      })
    );
  });

  it('asks for a Fleet or FC when re-filing if the corp requires one and the claim named none', async () => {
    setup({ requireFleetOrFc: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Re-file claim for Ferox' }));
    await userEvent.type(screen.getByLabelText('Note'), 'It was a fleet.');
    const submit = screen.getByRole('button', { name: 'Re-file claim' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    // The dialog's field is the last one in the document; the page form's comes first.
    await userEvent.type(screen.getAllByLabelText('Fleet or FC').at(-1)!, 'Kestrel Vane');
    await userEvent.click(submit);
    await waitFor(() =>
      expect(file).toHaveBeenCalledWith(7, 98765432, {
        killmail: esiKillmailLink(7004, HASH),
        fleetOrFc: 'Kestrel Vane',
        note: 'It was a fleet.',
      })
    );
  });

  it('shows No claims yet when there are none', async () => {
    setup({ noClaims: true });
    expect(await screen.findByText('No claims yet')).toBeTruthy();
  });

  it('opens a claim to its detail on a row click', async () => {
    setup();
    const claims = await screen.findByRole('table', { name: 'My SRP claims' });
    await userEvent.click(await within(claims).findByText('Cerberus'));
    expect(await screen.findByText('Waiting for an officer')).toBeTruthy();
    expect(screen.getByRole('link', { name: /View killmail/ })).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('link')
        .some((l) => l.getAttribute('href')?.includes('stops='))
    ).toBe(true);
  });
});
