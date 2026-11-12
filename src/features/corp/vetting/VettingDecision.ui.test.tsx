import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import {
  VETTING_DEFAULT_SETTINGS,
  type VettingReview,
  type VettingSettings,
} from '@/engine/vetting';
import type { MailRun } from '@/features/corpTaxBook/officerMail';
import { VettingDecision } from './VettingDecision';

const review = (over: Partial<VettingReview> = {}): VettingReview => ({
  id: 'r-1',
  kind: 'application',
  state: 'open',
  pilot: { characterId: 1, name: 'Tamsin Vell', corporationName: 'Hollow Reach Mining' },
  characters: 1,
  flags: 0,
  missing: 0,
  signed: 0,
  needed: 1,
  yours: true,
  readAt: 1,
  createdAt: 1,
  decidedAt: null,
  corporationId: 98000001,
  note: '',
  answers: [],
  barred: false,
  reportCharacters: [],
  parties: [],
  assessment: null,
  signOffs: [],
  log: [],
  deleteAt: null,
  ...over,
});

/** The signed-in reviewer: Kestrel Vane in the rows below. */
const REVIEWER = 6;

function setup(
  over: Partial<VettingReview> = {},
  settings: VettingSettings | null = VETTING_DEFAULT_SETTINGS
) {
  const onDecide = vi.fn(async () => {});
  render(
    <VettingDecision
      review={review(over)}
      reviewerId={REVIEWER}
      settings={settings}
      onDecide={onDecide}
    />
  );
  return onDecide;
}

describe('VettingDecision', () => {
  it('accepts at once, with the note', async () => {
    const onDecide = setup();
    expect(screen.getByText('Not decided')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Note, kept with your decision'), 'Looks fine');
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onDecide).toHaveBeenCalledWith('yes', 'Looks fine');
  });

  it('rejects only through a confirm that needs a reason', async () => {
    const onDecide = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onDecide).not.toHaveBeenCalled();
    const dialog = within(await screen.findByRole('dialog', { name: 'Reject Tamsin Vell' }));
    const confirm = dialog.getByRole('button', { name: 'Reject' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(confirm);
    expect(onDecide).not.toHaveBeenCalled();
    await userEvent.type(dialog.getByLabelText('Reason, kept with your decision'), 'ISK from BKS');
    await userEvent.click(confirm);
    expect(onDecide).toHaveBeenCalledWith('no', 'ISK from BKS');
  });

  it('keeps another reviewer’s decision hidden until the caller decides', () => {
    setup({
      kind: 'promotion',
      needed: 2,
      signed: 1,
      signOffs: [{ characterId: 5, name: 'Ilse Marrow', you: false, at: Date.UTC(2026, 10, 11) }],
    });
    const row = within(screen.getByText('Ilse Marrow').closest('li')!);
    expect(row.getByText(/Hidden until you decide/)).toBeInTheDocument();
    expect(row.getByText('Decided')).toBeInTheDocument();
    expect(row.queryByText('Approved')).toBeNull();
    expect(row.queryByText('Objected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Object' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 sign-offs')).toBeInTheDocument();
    expect(
      screen.getByText('Decided once 2 sign-offs are in. Any no rejects it.')
    ).toBeInTheDocument();
  });

  it('does not explain the count when one sign-off decides it', () => {
    setup();
    expect(screen.queryByText(/Decided once/)).toBeNull();
  });

  it('shows every decision and its note once the caller has decided, with nothing left to press', () => {
    setup({
      kind: 'promotion',
      yours: false,
      needed: 2,
      signed: 2,
      signOffs: [
        {
          characterId: 5,
          name: 'Ilse Marrow',
          you: false,
          at: 1,
          decision: 'no',
          note: 'Too soon.',
        },
        { characterId: 6, name: 'Kestrel Vane', you: true, at: 2, decision: 'yes', note: '' },
      ],
    });
    expect(screen.getByText('Objected')).toBeInTheDocument();
    expect(screen.getByText('Too soon.')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Object' })).toBeNull();
  });

  it('bars whoever asked for the review from signing it off', () => {
    setup({
      kind: 'promotion',
      barred: true,
      yours: false,
      needed: 2,
      requestedBy: { characterId: 6, name: 'Kestrel Vane' },
    });
    expect(screen.getByText('Cannot sign')).toBeInTheDocument();
    expect(screen.getByText('Asked for this review')).toBeInTheDocument();
    expect(
      screen.getByText('You asked for this review, so you cannot sign it off.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does not say the caller asked when someone else did and they are barred all the same', () => {
    setup({
      kind: 'promotion',
      barred: true,
      yours: false,
      needed: 2,
      requestedBy: { characterId: 9, name: 'Bram Soto' },
    });
    expect(screen.getByText('You cannot sign off this review.')).toBeInTheDocument();
    expect(screen.queryByText(/You asked for this review/)).toBeNull();
    // The asker's row is theirs, not the caller's.
    const row = within(screen.getByText('Bram Soto').closest('li')!);
    expect(row.getByText('Asked for this review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('keeps the reason and says why when the server refuses', async () => {
    const onDecide = vi.fn(async () => {
      throw Object.assign(new Error('x'), { details: { reason: 'already-signed' } });
    });
    render(
      <VettingDecision
        review={review()}
        reviewerId={REVIEWER}
        settings={VETTING_DEFAULT_SETTINGS}
        onDecide={onDecide}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Reason, kept with your decision'), 'No');
    await userEvent.click(dialog.getByRole('button', { name: 'Reject' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'You already signed this review off.'
    );
    expect(dialog.getByLabelText('Reason, kept with your decision')).toHaveValue('No');
  });

  it('says who reads the reason: the pilot too, where the corp shows it or it is not known', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(
      await screen.findByText('The other reviewers see this note. The pilot will not.')
    ).toBeInTheDocument();
  });

  it.each([
    ['the corp shows the reason', shown],
    ['the settings could not be read', null],
  ])('tells the reviewer the pilot sees the reason when %s', async (_, settings) => {
    setup({}, settings);
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(
      await screen.findByText('The pilot will see this note. So do the other reviewers.')
    ).toBeInTheDocument();
  });
});

const shown: VettingSettings = {
  ...VETTING_DEFAULT_SETTINGS,
  rejection: { wording: 'notNow', showReason: true },
};

const MINE = {
  characterId: REVIEWER,
  name: 'Kestrel Vane',
  you: true,
  at: 5,
  decision: 'yes',
  note: '',
} as const;

/** The report page's part: the review the decision answers with replaces the one on screen. */
function Deciding({
  settings,
  onMail,
  closes = true,
}: {
  settings: VettingSettings;
  onMail?: () => Promise<MailRun>;
  closes?: boolean;
}) {
  const [current, setCurrent] = useState(review());
  return (
    <VettingDecision
      review={current}
      reviewerId={REVIEWER}
      settings={settings}
      onMail={onMail}
      onDecide={async () =>
        setCurrent(
          review(
            closes
              ? { state: 'accepted', yours: false, signed: 1, signOffs: [MINE] }
              : { yours: false, signOffs: [MINE] }
          )
        )
      }
    />
  );
}

describe('VettingDecision mail offer', () => {
  const run = (over: Partial<MailRun>): MailRun => ({
    queued: [],
    failed: [],
    missingScope: false,
    ...over,
  });

  it('offers the mail once the caller’s sign-off closes the review, and says it was queued', async () => {
    const onMail = vi.fn(async () => run({ queued: ['Tamsin Vell'] }));
    render(<Deciding settings={VETTING_DEFAULT_SETTINGS} onMail={onMail} />);
    expect(screen.queryByRole('button', { name: /Mail Tamsin Vell/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mail Tamsin Vell the decision' })
    );
    expect(onMail).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Mail queued for 1 pilot.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mail Tamsin Vell/ })).toBeNull();
  });

  it('says a failed mail left the decision saved, and keeps the offer', async () => {
    render(
      <Deciding
        settings={VETTING_DEFAULT_SETTINGS}
        onMail={async () => run({ failed: ['Tamsin Vell'] })}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await userEvent.click(await screen.findByRole('button', { name: /Mail Tamsin Vell/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mail failed for Tamsin Vell, status still saved.'
    );
    expect(screen.getByRole('button', { name: /Mail Tamsin Vell/ })).toBeInTheDocument();
  });

  it('offers it on a later visit to a review the caller signed, and says when this device already queued it', async () => {
    const onMail = vi.fn(async () => run({}));
    render(
      <VettingDecision
        review={review({ state: 'rejected', yours: false, signed: 1, signOffs: [MINE] })}
        reviewerId={REVIEWER}
        settings={VETTING_DEFAULT_SETTINGS}
        onMail={onMail}
        onDecide={async () => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mail Tamsin Vell the decision' }));
    expect(await screen.findByText('Already queued from this device.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mail Tamsin Vell/ })).toBeNull();
  });

  it('offers none to a reviewer who did not sign the decided review', () => {
    render(
      <VettingDecision
        review={review({
          state: 'accepted',
          yours: false,
          signed: 1,
          signOffs: [{ ...MINE, characterId: 7, name: 'Ilse Marrow', you: false }],
        })}
        reviewerId={REVIEWER}
        settings={VETTING_DEFAULT_SETTINGS}
        onMail={async () => run({})}
        onDecide={async () => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /Mail Tamsin Vell/ })).toBeNull();
  });

  it('offers none when the corp turned it off, or while the review is still open', async () => {
    const onMail = vi.fn(async () => run({}));
    const { unmount } = render(
      <Deciding settings={{ ...VETTING_DEFAULT_SETTINGS, mailDecision: false }} onMail={onMail} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull());
    expect(screen.queryByRole('button', { name: /Mail Tamsin Vell/ })).toBeNull();
    unmount();

    render(<Deciding settings={VETTING_DEFAULT_SETTINGS} onMail={onMail} closes={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull());
    expect(screen.queryByRole('button', { name: /Mail Tamsin Vell/ })).toBeNull();
  });
});
