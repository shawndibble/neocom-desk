import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import { composeStatementMail } from '@/engine/corpTaxBook/statementMail';
import { formatIsk } from '@/lib/isk';
import { MailLimitNotice } from './MailLimitNotice';
import { MailQueueChip } from './MailQueueChip';
import { MailQueuePanel } from './MailQueuePanel';
import { StatementMailPreview } from './StatementMailPreview';

function item(n: number, patch: Partial<MailQueueItem> = {}): MailQueueItem {
  return {
    id: `m${n}`,
    batchId: 'b',
    corporationId: 1,
    statementId: `s${n}`,
    kind: 'statement',
    senderCharacterId: 7,
    recipientId: 100 + n,
    recipientName: `Miner ${n}`,
    amount: 6_000_000,
    subject: 's',
    body: 'b',
    order: n,
    status: 'waiting',
    createdAt: 0,
    attempts: 0,
    ...patch,
  };
}

const NOW = 1_000_000;
const actions = { onRetry: vi.fn(), onOpenInEve: vi.fn(async () => 'Opened in your EVE client.') };

describe('MailLimitNotice', () => {
  it('works the minutes out from EVE’s 5 a minute', () => {
    render(<MailLimitNotice count={19} senderName="Kestrel Vane" />);
    expect(
      screen.getByText(
        'EVE lets a character send about 5 mails a minute, so 19 mails take about 4 minutes.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/from Kestrel Vane/)).toBeInTheDocument();
  });

  it('says a single mail takes about a minute', () => {
    render(<MailLimitNotice count={1} />);
    expect(screen.getByText(/this mail takes about 1 minute\./)).toBeInTheDocument();
  });
});

describe('MailQueuePanel', () => {
  const items = [
    item(1, { status: 'sent', sentAt: Date.UTC(2026, 9, 18, 14, 2), logged: true, mailId: 1 }),
    item(2, { status: 'failed', failureReason: 'cspa' }),
    item(3, { notBefore: NOW + 48_000, holdReason: 'rateLimit' }),
    item(4),
  ];

  it('summarises, shows the 520 wait on the paused head, and a Retry on the failure only', async () => {
    render(<MailQueuePanel items={items} now={NOW} {...actions} />);
    expect(screen.getByText('Sending 3 of 4')).toBeInTheDocument();
    expect(screen.getByText('1 sent')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
    expect(screen.getByText('EVE asked us to wait 48s (too many mails)')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry mail to Miner 2' });
    expect(screen.getAllByRole('button', { name: /Retry mail/ })).toHaveLength(1);
    await userEvent.click(retry);
    expect(actions.onRetry).toHaveBeenCalledWith(items[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Open mail to Miner 2 in EVE' }));
    expect(await screen.findByText('Opened in your EVE client.')).toBeInTheDocument();
  });

  it('labels the sent time as EVE time on a 24-hour clock, whatever the Time format', () => {
    render(<MailQueuePanel items={[items[0]]} now={NOW} {...actions} />);
    expect(screen.getByText('14:02 EVE')).toBeInTheDocument();
  });

  it('says Done with a note when nothing is waiting', () => {
    render(
      <MailQueuePanel
        items={[items[0], items[1]]}
        now={NOW}
        {...actions}
        onClearSent={() => undefined}
      />
    );
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText(/Every mail is logged on its Miner/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear sent mail' })).toBeInTheDocument();
  });

  it('labels moon owner mail by kind and shows no amount for it', () => {
    render(
      <MailQueuePanel
        items={[item(1, { kind: 'rate-change', amount: 0, recipientName: 'Owner CEO' })]}
        now={NOW}
        {...actions}
      />
    );
    expect(screen.getAllByText('(Rate change)').length).toBeGreaterThan(0);
    expect(screen.queryByText(formatIsk(0))).not.toBeInTheDocument();
  });
});

describe('MailQueueChip', () => {
  it('shows progress and the failure count, and opens the queue', async () => {
    render(
      <MailQueueChip
        items={[
          item(1, { status: 'sent', logged: true }),
          item(2, { status: 'failed' }),
          item(3),
          item(4),
        ]}
        now={NOW}
        {...actions}
      />
    );
    const chip = screen.getByRole('button', { name: 'Statement mail: 50% sent, 1 failed' });
    expect(within(chip).getByText('Statements 1 of 4')).toBeInTheDocument();
    await userEvent.click(chip);
    expect(await screen.findByText('Statement mail queue')).toBeInTheDocument();
  });

  it('reads 100% sent when done', () => {
    render(
      <MailQueueChip items={[item(1, { status: 'sent', logged: true })]} now={NOW} {...actions} />
    );
    expect(
      screen.getByRole('button', { name: 'Statement mail: 100% sent, done' })
    ).toBeInTheDocument();
  });
});

describe('StatementMailPreview', () => {
  it('shows recipient, subject and the simple table, with no pricing columns', () => {
    const mail = composeStatementMail({
      kind: 'statement',
      corporationName: 'Ore & Glory',
      recipientName: 'Varro',
      periodLabel: 'Sep 2026',
      code: 'MT-1',
      lines: [
        {
          kind: 'mined',
          date: '2026-09-03',
          structureId: 1,
          estimatedValue: 12_000_000,
          tax: 1_200_000,
        },
      ],
      refineryName: () => 'Efa - Brass Anvil',
      amountDue: 1_200_000,
      carried: 0,
      dueDate: '2026-10-15',
      verifyUrl: 'https://app.test/v/t',
    });
    render(<StatementMailPreview to="Varro" subject={mail.subject} body={mail.body} />);
    expect(screen.getByText('Subject:').parentElement).toHaveTextContent(mail.subject);
    expect(screen.getByText(/Efa - Brass Anvil/)).toBeInTheDocument();
    expect(screen.getByText(/Total tax: 1,200,000 ISK/)).toBeInTheDocument();
  });
});
