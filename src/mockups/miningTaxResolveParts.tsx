import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Checkbox,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Modal,
  NativeSelect,
  PageHeader,
  Panel,
  Radio,
  Tabs,
  TextArea,
  plainTextActionClassName,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { AttentionStrip, type AttentionItem } from '@/features/miningTax/AttentionStrip';
import { OwedBalances } from '@/features/miningTax/OwedBalances';
import type { ConflictSummary } from '@/features/miningTax/corpBook/conflictSummary';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';
import {
  ASHFALL,
  BALANCES,
  BUH,
  CONFLICT,
  DONATED,
  DONATIONS,
  PILOT,
  RATE_DAY,
  ROCK,
  UNLINKED,
  isk,
} from './miningTaxResolveFixtures';

const noop = () => {};
const textAction = plainTextActionClassName('min-h-9 md:min-h-6');

export function TaxTabFrame({ children }: { children: ReactNode }) {
  const tabsId = useTabsId();
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <PageHeader
        title="Mining"
        subNav={
          <Tabs
            tabsId={tabsId}
            label="Mining"
            value="tax"
            onChange={noop}
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'tax', label: 'Tax' },
              { id: 'survey', label: 'Survey' },
            ]}
          />
        }
      />
      {children}
    </div>
  );
}

export function OpenedStrip({ items }: { items: AttentionItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
  }, []);
  return (
    <div ref={ref}>
      <AttentionStrip items={items} />
    </div>
  );
}

export function Balances({ conflicts }: { conflicts: ConflictSummary }) {
  return (
    <OwedBalances
      balances={BALANCES}
      unassigned={{ entryCount: 0, estimatedValue: 0 }}
      unlinkedPaymentCount={1}
      unlinkedOf={(b) =>
        b.payee.id === 'rock' ? { count: 1, amount: UNLINKED.amount } : undefined
      }
      uncreditedOf={(b) =>
        b.payee.id === 'corp-book:1'
          ? { amount: DONATED, accounts: 'Master wallet', everyDivision: true }
          : undefined
      }
      hideLinkPayment={(b) => b.payee.id === 'corp-book:1'}
      onSettleUp={noop}
      onLinkPayment={noop}
      onOpenLedger={noop}
      onAssignNext={noop}
      onReviewPayments={noop}
      conflicts={conflicts}
      onReviewConflicts={noop}
    />
  );
}

export function TodayCompareDialog() {
  return (
    <Modal open onClose={noop} title={`Compare with the book · ${RATE_DAY.date}`}>
      <div className="space-y-3 text-sm">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="text-text-dim">
            <tr>
              <th className="py-1 font-normal" />
              <th className="py-1 font-normal">You</th>
              <th className="py-1 font-normal">{BUH.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 text-text-dim">Rate</td>
              <td>{RATE_DAY.yours}</td>
              <td>{RATE_DAY.book}</td>
            </tr>
            <tr>
              <td className="py-1 text-text-dim">Tax</td>
              <td>{isk(RATE_DAY.yourTax)}</td>
              <td>{isk(RATE_DAY.bookTax)}</td>
            </tr>
          </tbody>
        </table>
        <div className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs">
          <p className="font-semibold text-warning">Disputed: rate</p>
          <p className="font-semibold">
            The book&apos;s rate is higher than the one you recorded, so it bills more. Ask a{' '}
            {BUH.name} officer to correct the book.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export function InlineChoices() {
  return (
    <NewComponent name="ResolveOptions">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm">I already paid — send proof</Button>
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              Other ways
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Settle it yourself</DropdownMenuLabel>
            <DropdownMenuItem>Pay it again · {isk(DONATED)}</DropdownMenuItem>
            <DropdownMenuItem>Not paying — hide this</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Ask {BUH.name}</DropdownMenuLabel>
            <DropdownMenuItem>I already paid — send proof</DropdownMenuItem>
            <DropdownMenuItem>I don&apos;t owe this — ask them to change it</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </NewComponent>
  );
}

export function Choice({
  checked,
  title,
  hint,
  children,
}: {
  checked?: boolean;
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <label
      className={cx(
        'block cursor-pointer rounded-xs border p-2.5',
        checked ? 'border-accent bg-accent/5' : 'border-line'
      )}
    >
      <span className="flex items-start gap-2">
        <Radio name="outcome" checked={checked ?? false} onChange={noop} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-text-dim">{hint}</span>
        </span>
      </span>
      {checked && children && <span className="mt-2 block space-y-2 pl-6">{children}</span>}
    </label>
  );
}

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <p className={eyebrowClassName}>{label}</p>
      {children}
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <div className="space-y-1 rounded-xs bg-panel-2 p-2.5 text-xs">{children}</div>;
}

export function SendsTo() {
  return (
    <p className="text-xs text-text-dim">
      Goes to {BUH.name}&apos;s Needs you queue, and as an EVE mail to {BUH.ceo} (CEO). Until they
      answer, it leaves your attention list; their answer comes back here.
    </p>
  );
}

export function ResolveDialog({
  title,
  facts,
  footer,
  children,
}: {
  title: string;
  facts: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Modal open onClose={noop} title={title} placement="medium" footer={footer}>
      <NewComponent name="ResolveDialog">
        <div className="space-y-4">
          <Facts>{facts}</Facts>
          {children}
        </div>
      </NewComponent>
    </Modal>
  );
}

const footer = (label: string) => (
  <div className="flex justify-end gap-2">
    <Button variant="ghost">Cancel</Button>
    <Button variant="primary">{label}</Button>
  </div>
);

export function ResolveUncredited() {
  return (
    <ResolveDialog
      title="2 donations not credited"
      footer={footer('Send proof')}
      facts={
        <>
          <p>
            You sent {isk(DONATED)}. Its book synced today and still doesn&apos;t hold them, so 3
            days you had paid are billed again.
          </p>
          <ul className="space-y-0.5 tabular-nums">
            {DONATIONS.map((d) => (
              <li key={d.ref}>
                <span className="font-semibold">{isk(d.amount)}</span> · {d.at} · journal ref{' '}
                {d.ref} · paid {d.days}
              </li>
            ))}
          </ul>
        </>
      }
    >
      <Group label="Settle it yourself">
        <Choice
          title={`Pay it again · ${isk(DONATED)}`}
          hint="Only if that ISK went somewhere else. The book credits a new payment on its next sync."
        />
        <Choice
          title="Not paying — hide this"
          hint={`Gone from your tab. ${BUH.name} still bills it.`}
        />
      </Group>
      <Group label={`Ask ${BUH.name}`}>
        <Choice
          checked
          title="I already paid — send them the proof"
          hint="Both transfers, with their journal refs, so an officer can find them in seconds."
        >
          <TextArea rows={2} placeholder="Add a note (optional)" />
          <SendsTo />
        </Choice>
        <Choice
          title="I don't owe this — ask them to change it"
          hint="You say why; they waive it or keep the bill and tell you what to do next."
        />
      </Group>
    </ResolveDialog>
  );
}

export function ResolveConflict() {
  return (
    <ResolveDialog
      title={`${CONFLICT.date} claimed twice`}
      footer={footer('Take it off my entry')}
      facts={
        <>
          <p>
            You gave this ore to {ROCK.name}. {BUH.name}&apos;s book also recorded it, and bills it
            on {CONFLICT.resolvesOn} unless something changes first.
          </p>
          <p className="tabular-nums">
            {CONFLICT.ore} · <span className="font-semibold">{isk(CONFLICT.amount)}</span>
          </p>
        </>
      }
    >
      <Group label="Settle it yourself">
        <Choice
          checked
          title={`Fix my records — ${BUH.name} is right`}
          hint={`Takes this ore off your ${ROCK.name} entry, so you owe it once, to ${BUH.name}.`}
        >
          <ul className="space-y-0.5 text-xs tabular-nums">
            <li>
              {ROCK.name} (its own rate): {isk(8_420_000)} →{' '}
              <span className="font-semibold">{isk(4_860_000)}</span>
            </li>
            <li>
              {BUH.name}: <span className="font-semibold">+{isk(CONFLICT.amount)}</span> on its next
              Late notice
            </li>
          </ul>
        </Choice>
        <Choice
          title="Not paying — hide this"
          hint={`Gone from your tab. ${BUH.name} still bills it.`}
        />
      </Group>
      <Group label={`Ask ${BUH.name}`}>
        <Choice
          title={`It went to ${ROCK.name} — tell ${BUH.name}`}
          hint={`They waive it or keep the bill. ${CONFLICT.resolvesOn} still stands until they answer.`}
        />
      </Group>
    </ResolveDialog>
  );
}

export function ResolveNotPaying() {
  return (
    <ResolveDialog
      title={`${RATE_DAY.date} billed at ${RATE_DAY.book}`}
      footer={footer('Hide it and tell them')}
      facts={
        <p className="tabular-nums">
          Its book bills <span className="font-semibold">{isk(RATE_DAY.bookTax)}</span>. At your{' '}
          {RATE_DAY.yours} it would be {isk(RATE_DAY.yourTax)}.
        </p>
      }
    >
      <Group label="Settle it yourself">
        <Choice
          title={`Pay it · ${isk(RATE_DAY.bookTax)}`}
          hint="Settles the day at the book's rate."
        />
        <Choice
          title={`Fix my records — use ${RATE_DAY.book}`}
          hint="Changes your entry's rate, so your figures and the book's agree."
        />
        <Choice
          checked
          title="Not paying — hide this"
          hint={`Gone from your tab. ${BUH.name} still bills it.`}
        >
          <label className={touchCheckboxLabelClassName}>
            <Checkbox checked onChange={noop} />
            Tell {BUH.name} why
          </label>
          <TextArea rows={2} defaultValue="The fleet boss said this op was untaxed." />
          <p className="text-xs text-text-dim">
            Their officers see it beside the bill and can write it off or send a reminder. Hidden
            days stay under Hidden on this tab, and come back with one click.
          </p>
        </Choice>
      </Group>
      <Group label={`Ask ${BUH.name}`}>
        <Choice
          title={`I don't owe ${RATE_DAY.book} — ask them to change it`}
          hint="You say why; they re-rate the day or keep it and tell you what to do next."
        />
      </Group>
    </ResolveDialog>
  );
}

export function QuietStatusLine() {
  return (
    <NewComponent name="QuietStatusLine">
      <p className="flex flex-wrap items-baseline gap-x-3 text-xs text-text-dim">
        <span>
          Waiting on {BUH.name}: <span className="text-text">2</span>
        </span>
        <span>
          Not paying: <span className="text-text">1</span>
        </span>
        <button type="button" className={textAction}>
          Show them
        </button>
      </p>
    </NewComponent>
  );
}

interface LedgerRow {
  date: string;
  system: string;
  payee: string;
  tax: number;
  status: string;
  tone: PillTone;
  note: string;
}

const AFTER_ROWS: LedgerRow[] = [
  {
    date: RATE_DAY.date,
    system: 'Mobit',
    payee: BUH.name,
    tax: RATE_DAY.bookTax,
    status: 'Not paying',
    tone: 'neutral',
    note: `${BUH.name} still bills this`,
  },
  {
    date: CONFLICT.date,
    system: 'Mobit',
    payee: BUH.name,
    tax: CONFLICT.amount,
    status: 'Sent',
    tone: 'neutral',
    note: `Bills ${CONFLICT.resolvesOn} unless they answer`,
  },
  {
    date: '2026-11-03',
    system: 'Mobit',
    payee: BUH.name,
    tax: 3_980_000,
    status: 'Proof sent',
    tone: 'neutral',
    note: 'Sent 16 Nov',
  },
  {
    date: '2026-10-30',
    system: 'Mobit',
    payee: BUH.name,
    tax: 6_120_000,
    status: 'Billed again',
    tone: 'warning',
    note: 'Bill kept — see above',
  },
  {
    date: '2026-10-29',
    system: 'Mobit',
    payee: BUH.name,
    tax: 5_870_000,
    status: 'Billed again',
    tone: 'warning',
    note: 'Bill kept — see above',
  },
];

const ledgerColumns: DataTableColumn<LedgerRow>[] = [
  {
    id: 'date',
    header: 'Date',
    className: 'tabular-nums whitespace-nowrap',
    render: (r) => r.date,
  },
  { id: 'system', header: 'System', render: (r) => r.system },
  { id: 'payee', header: 'Payee', render: (r) => r.payee },
  {
    id: 'tax',
    header: 'Tax',
    align: 'right',
    className: 'tabular-nums',
    render: (r) => isk(r.tax),
  },
  {
    id: 'status',
    header: 'Status',
    render: (r) => (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <Pill tone={r.tone}>{r.status}</Pill>
        <span className="text-xs text-text-dim">{r.note}</span>
      </span>
    ),
  },
];

export function AfterLedger() {
  return (
    <Panel title="Open" padded={false}>
      <DataTable
        label="Open entries"
        columns={ledgerColumns}
        rows={AFTER_ROWS}
        rowKey={(r) => r.date}
      />
    </Panel>
  );
}

export function LeftCorpNotice() {
  return (
    <NewComponent name="LeftCorpNotice">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xs border border-line bg-panel-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-sm font-semibold">
            You left {ASHFALL.name} on {ASHFALL.leftOn}
          </p>
          <p className="text-xs text-text-dim">
            Its book still lists {isk(ASHFALL.owed)} from your time there, and nothing new is added.
            Its officers already see that you left.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button size="sm">Pay {isk(ASHFALL.owed)}</Button>
          <button type="button" className={textAction}>
            Stop showing {ASHFALL.name}
          </button>
        </div>
      </div>
    </NewComponent>
  );
}

export function QueueCard({
  tone,
  title,
  status,
  body,
  primary,
  secondary,
  newName,
}: {
  tone: 'danger' | 'warning' | 'neutral';
  title: string;
  status?: ReactNode;
  body: ReactNode;
  primary: string;
  secondary: string;
  newName?: string;
}) {
  const card = (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
      <span
        aria-hidden="true"
        className={cx(
          'mt-1 h-8 w-0.5 shrink-0',
          tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-line'
        )}
      />
      <span className="min-w-0 flex-1 basis-60">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{title}</span>
          {status}
        </span>
        <span className="block text-xs text-text-dim">{body}</span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2 max-sm:pl-3">
        <Button size="sm">{primary}</Button>
        <button type="button" className={textAction}>
          {secondary}
        </button>
      </span>
    </li>
  );
  return newName ? <NewComponent name={newName}>{card}</NewComponent> : card;
}

export function OfficerNeedsYou() {
  return (
    <Panel
      title="Needs you · 4"
      meta={
        <span className="text-xs text-text-dim">
          Members&apos; questions also mail {BUH.ceo} (CEO) ·{' '}
          <button type="button" className={textAction}>
            Change
          </button>
        </span>
      }
      padded={false}
    >
      <ul className="divide-y divide-line">
        <QueueCard
          tone="danger"
          title={`${PILOT} says they paid · ${isk(DONATED)}`}
          body={
            <>
              2 donations the book&apos;s sync doesn&apos;t hold: {isk(25_000_000)} on 2 Nov
              (journal ref 7788991), {isk(15_000_000)} on 9 Nov (journal ref 7790034). Overdue is
              paused for up to 14 days.
            </>
          }
          primary="Confirm paid"
          secondary="Keep the bill"
        />
        <QueueCard
          tone="warning"
          title={`${PILOT} says ${CONFLICT.date}'s ore went to ${ROCK.name}`}
          body={`${CONFLICT.ore} · ${isk(CONFLICT.amount)}. Bills on ${CONFLICT.resolvesOn} unless you answer.`}
          primary="Waive their ore"
          secondary="Keep the bill"
        />
        <QueueCard
          newName="QueueCard: won't pay"
          tone="neutral"
          title={`${PILOT} isn't paying ${RATE_DAY.date} · ${isk(RATE_DAY.bookTax)}`}
          body="“The fleet boss said this op was untaxed.” Same two answers as a member who left."
          primary="Write off"
          secondary="Send reminder"
        />
        <QueueCard
          tone="neutral"
          title="Orsa Tellemar left the corp · owes 3,100,000 ISK"
          body="No new Late notice goes out unless they mine again. Send a reminder, or write it off once it is clear it will not be paid."
          primary="Send reminder"
          secondary="Write off"
        />
      </ul>
    </Panel>
  );
}

export function OfficerKeepBillDialog() {
  return (
    <Modal
      open
      onClose={noop}
      title={`Keep the bill on ${PILOT}'s donation?`}
      footer={footer('Keep the bill')}
    >
      <div className="space-y-3 text-sm">
        <p>
          {PILOT} says they paid {isk(25_000_000)} on 2 Nov (journal ref 7788991). Keeping the bill
          puts the 3 days it paid back on their next Late notice.
        </p>
        <NewComponent name="RequiredNextStep">
          <label className="block space-y-1">
            <span className="text-sm font-semibold">What should {PILOT} do next?</span>
            <TextArea
              rows={3}
              defaultValue={`Send a screenshot of the journal line to ${BUH.officer} — we can't find it in any division.`}
            />
            <span className="block text-xs text-text-dim">
              Required. {PILOT} sees this word for word beside the bill, with a Resolve button.
            </span>
          </label>
        </NewComponent>
      </div>
    </Modal>
  );
}

export function TaxContactSetting() {
  const [who] = useState<'ceo' | 'list' | 'officers'>('list');
  return (
    <Panel title="Book settings › Access">
      <NewComponent name="TaxContactSetting">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Who answers members&apos; tax questions</legend>
          <p className="text-xs text-text-dim">
            Proof, disputes and won&apos;t-pay notes always land in Needs you. This is who also gets
            an EVE mail, for officers who aren&apos;t in Neocom Desk when it happens.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <Radio name="who" checked={who === 'ceo'} onChange={noop} className="mt-0.5" />
            <span>
              The CEO, {BUH.ceo}
              <span className="block text-xs text-text-dim">The default.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Radio name="who" checked={who === 'list'} onChange={noop} className="mt-0.5" />
            <span className="min-w-0 flex-1 space-y-1">
              A mailing list
              <NativeSelect size="sm" className="max-w-xs" defaultValue="desk">
                <option value="desk">{BUH.list}</option>
              </NativeSelect>
              <span className="block text-xs text-text-dim">
                EVE only delivers to a list from its members, so a member who isn&apos;t on it mails
                the CEO instead.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Radio name="who" checked={who === 'officers'} onChange={noop} className="mt-0.5" />
            <span>
              These officers
              <span className="block text-xs text-text-dim">One mail each; up to 5.</span>
            </span>
          </label>
        </fieldset>
      </NewComponent>
    </Panel>
  );
}
