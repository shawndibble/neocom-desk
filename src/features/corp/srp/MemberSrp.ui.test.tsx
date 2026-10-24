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

  describe('doctrine check', () => {
    const paste = async (link: string) =>
      userEvent.type(await screen.findByLabelText('Killmail link'), link);

    it('shows Off doctrine with the diff for a checked hull, and the pilot can still file', async () => {
      setup({ doctrine: true });
      await paste('https://zkillboard.com/kill/123/hurricane');
      expect(await screen.findByText('Off doctrine', undefined, { timeout: 3000 })).toBeTruthy();
      expect(screen.getByText(/Hurricane - artillery/)).toBeTruthy();
      expect(screen.getByText('Missing modules')).toBeTruthy();
      expect(await screen.findByText('2× Hull 519')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'File claim' }));
      await waitFor(() => expect(file).toHaveBeenCalledTimes(1));
    });

    it('shows Matches <fit> when the fit is on doctrine', async () => {
      setup({ doctrine: true });
      await paste('https://zkillboard.com/kill/123/ondoctrine');
      expect(
        await screen.findByText('Matches Hurricane - artillery', undefined, { timeout: 3000 })
      ).toBeTruthy();
      expect(screen.queryByText('Off doctrine')).toBeNull();
    });

    it('shows nothing for a hull the corp does not check, and never asks when no hull is checked', async () => {
      setup({ doctrine: true });
      await paste('https://zkillboard.com/kill/8003/unchecked');
      await waitFor(
        () =>
          expect(
            screen.queryByText('Checking your fit against the corp’s Doctrine Fits…')
          ).toBeNull(),
        { timeout: 3000 }
      );
      expect(screen.queryByText('Off doctrine')).toBeNull();
      expect(screen.queryByText(/Matches/)).toBeNull();
      cleanup();
      setup();
      const preview = vi.spyOn(backend, 'previewDoctrine');
      await paste('https://zkillboard.com/kill/123/hurricane');
      await new Promise((r) => setTimeout(r, 600));
      expect(preview).not.toHaveBeenCalled();
    });

    it('asks in a dialog before filing an off-doctrine lost ship, and File anyway files it with the note', async () => {
      setup({ doctrine: true });
      await userEvent.click(
        await screen.findByRole('button', { name: 'File claim for Hurricane' })
      );
      const dialog = await screen.findByRole('dialog', undefined, { timeout: 3000 });
      expect(within(dialog).getByText('Off doctrine')).toBeTruthy();
      expect(file).not.toHaveBeenCalled();
      await userEvent.type(within(dialog).getByLabelText('Fleet or FC (optional)'), 'Kestrel');
      await userEvent.click(within(dialog).getByRole('button', { name: 'File anyway' }));
      await waitFor(() =>
        expect(file).toHaveBeenCalledWith(7, 98765432, {
          killmail: esiKillmailLink(8001, HASH),
          fleetOrFc: 'Kestrel',
        })
      );
    });

    it('blocks File anyway with the reason while a required Fleet or FC is empty, then files once a note is typed', async () => {
      setup({ doctrine: true, requireFleetOrFc: true });
      await userEvent.click(
        await screen.findByRole('button', { name: 'File claim for Hurricane' })
      );
      const dialog = await screen.findByRole('dialog', undefined, { timeout: 3000 });
      const fileAnyway = within(dialog).getByRole('button', { name: 'File anyway' });
      expect(fileAnyway).toHaveAttribute('aria-disabled', 'true');
      expect(within(dialog).getByText('Fleet or FC is required by your corp.')).toBeTruthy();
      await userEvent.click(fileAnyway);
      expect(file).not.toHaveBeenCalled();
      await userEvent.type(within(dialog).getByLabelText('Fleet or FC'), 'Kestrel');
      expect(within(dialog).queryByText('Fleet or FC is required by your corp.')).toBeNull();
      await userEvent.click(within(dialog).getByRole('button', { name: 'File anyway' }));
      await waitFor(() => expect(file).toHaveBeenCalledTimes(1));
    });

    it('files straight away when the doctrine preview fails', async () => {
      setup({ doctrine: true });
      vi.spyOn(backend, 'previewDoctrine').mockRejectedValue(new Error('down'));
      await userEvent.click(
        await screen.findByRole('button', { name: 'File claim for Hurricane' })
      );
      await waitFor(() => expect(file).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('Cancel in the off-doctrine dialog files nothing', async () => {
      setup({ doctrine: true });
      await userEvent.click(
        await screen.findByRole('button', { name: 'File claim for Hurricane' })
      );
      const dialog = await screen.findByRole('dialog', undefined, { timeout: 3000 });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(file).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('files an on-doctrine lost ship directly, with its toast', async () => {
      setup({ doctrine: true });
      vi.spyOn(backend, 'previewDoctrine').mockResolvedValue({
        killmailId: 8001,
        hullTypeId: 24702,
        check: { status: 'matched', doctrineName: 'Hurricane - artillery' },
      } as never);
      await userEvent.click(
        await screen.findByRole('button', { name: 'File claim for Hurricane' })
      );
      await waitFor(() => expect(file).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect((await screen.findAllByText('Claim filed for Hurricane.')).length).toBeGreaterThan(0);
    });
  });
});
