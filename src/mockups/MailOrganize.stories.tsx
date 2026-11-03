import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  Checkbox,
  FilterChip,
  HeaderMoreMenu,
  SearchInput,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';

/**
 * Mail with the organize actions that need no new permission (mark unread,
 * delete) and the custom-label tags. Reads and writes go to ESI; nothing new is
 * stored in Dexie or synced (docs/design/mockups/mail-organize/README.md).
 *
 * New components in this mockup: `SelectionBar` (the "N selected" bar with
 * Mark read / Mark unread / Delete). Everything else is an existing primitive:
 * `FilterChip`, `SearchInput`, `Checkbox`, `Pill` (label tags), `DropdownMenu`,
 * `HeaderMoreMenu`, `ConfirmDialog`.
 */

interface Row {
  id: number;
  subject: string;
  party: string;
  folder: string;
  date: string;
  unread: boolean;
  labels: string[];
}

const ROWS: Row[] = [
  {
    id: 1,
    subject: 'Fuel block run, Thursday',
    party: 'Mira Kallen',
    folder: 'Corp',
    date: 'Nov 2',
    unread: true,
    labels: ['Industry'],
  },
  {
    id: 2,
    subject: 'RE: Invoice for the Jita hauls',
    party: 'Tovan Reis',
    folder: 'Inbox',
    date: 'Nov 2',
    unread: false,
    labels: ['Haulers', 'Invoices'],
  },
  {
    id: 3,
    subject: 'Moon rental, ring 3 renewal',
    party: 'Halden Ore Co.',
    folder: 'Inbox',
    date: 'Nov 1',
    unread: true,
    labels: ['Moons'],
  },
  {
    id: 4,
    subject: 'Alliance bulletin: sov timers',
    party: 'Standing Fleet',
    folder: 'Alliance',
    date: 'Oct 31',
    unread: false,
    labels: [],
  },
  {
    id: 5,
    subject: 'Your buyback contract',
    party: 'Quiet Freight',
    folder: 'Inbox',
    date: 'Oct 30',
    unread: false,
    labels: ['Invoices'],
  },
];

function LabelTags({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {labels.map((l) => (
        <Pill key={l}>{l}</Pill>
      ))}
    </span>
  );
}

function RowActions({ row, open }: { row: Row; open: boolean }) {
  return (
    <DropdownMenu open={open} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${row.subject}`}
          className="shrink-0 rounded-xs p-1 text-text-dim hover:bg-panel-2"
        >
          <Icon.More aria-hidden="true" size={Icon.ICON_SIZE.md} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Reply</DropdownMenuItem>
        <DropdownMenuItem>Forward</DropdownMenuItem>
        <DropdownMenuItem>{row.unread ? 'Mark as read' : 'Mark as unread'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-danger">Delete…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MailRow({
  row,
  selecting,
  checked,
  open,
  menuOpen,
}: {
  row: Row;
  selecting: boolean;
  checked: boolean;
  open: boolean;
  menuOpen: boolean;
}) {
  return (
    <li
      className={cx(
        'flex items-start gap-2 border-l-2 py-1.5 pr-2 pl-2.5',
        open ? 'border-l-accent bg-panel-2' : 'border-l-transparent hover:bg-panel-2'
      )}
    >
      {selecting ? (
        <Checkbox
          aria-label={`Select ${row.subject}`}
          checked={checked}
          readOnly
          className="mt-1"
        />
      ) : (
        <span aria-hidden="true" className="mt-1.5 flex w-1.5 shrink-0 justify-center">
          {row.unread && <span className="size-1.5 rounded-full bg-accent" />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cx(
            'line-clamp-2 text-sm',
            row.unread ? 'font-semibold text-text' : 'text-text-dim'
          )}
        >
          {row.subject}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-text-dim">
          <span className="tracking-widest uppercase">{row.folder}</span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{row.party}</span>
          <span className="ml-auto shrink-0 tabular-nums">{row.date}</span>
        </span>
        <LabelTags labels={row.labels} />
      </span>
      {!selecting && <RowActions row={row} open={menuOpen} />}
    </li>
  );
}

function SelectionBar({ count }: { count: number }) {
  return (
    <NewComponent name="SelectionBar">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Selected mail">
        <span className="text-sm font-semibold text-text">{count} selected</span>
        <Button size="sm">Mark read</Button>
        <Button size="sm">Mark unread</Button>
        <Button size="sm" variant="danger">
          Delete…
        </Button>
      </div>
    </NewComponent>
  );
}

function Reader({ menuOpen }: { menuOpen: boolean }) {
  const row = ROWS[1]!;
  return (
    <section
      aria-label="Reading pane"
      className="min-w-0 flex-1 rounded-xs border border-line bg-panel p-4"
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-text">{row.subject}</h2>
          <p className="text-xs text-text-dim">From Tovan Reis · Nov 2, 14:05 · to you</p>
          <div className="mt-1.5">
            <LabelTags labels={row.labels} />
          </div>
        </div>
        <Button size="sm">Reply</Button>
        <Button size="sm">Forward</Button>
        {menuOpen ? (
          <DropdownMenu open modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="rounded-xs p-1 text-text-dim"
              >
                <Icon.More aria-hidden="true" size={Icon.ICON_SIZE.md} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Mark as unread</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-danger">Delete…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <HeaderMoreMenu>
            <DropdownMenuItem>Mark as unread</DropdownMenuItem>
            <DropdownMenuItem>Delete…</DropdownMenuItem>
          </HeaderMoreMenu>
        )}
      </header>
      <p className="mt-4 text-sm text-text">
        Invoice attached for the three Jita runs this week. Pay into the usual wallet and I will
        mark them settled.
      </p>
    </section>
  );
}

interface MockProps {
  selecting?: boolean;
  selectedIds?: number[];
  rowMenuId?: number;
  readerMenu?: boolean;
  confirmDelete?: boolean;
  phone?: boolean;
}

function MailOrganizeMock({
  selecting = false,
  selectedIds = [],
  rowMenuId,
  readerMenu = false,
  confirmDelete = false,
  phone = false,
}: MockProps) {
  const [folders, setFolders] = useState(['Inbox', 'Corp', 'Alliance']);
  return (
    <div className="mx-auto max-w-page space-y-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-text">Mail</h1>
        <Button size="sm" className="ml-auto" aria-pressed={selecting}>
          {selecting ? 'Done' : 'Select'}
        </Button>
        <Button size="sm" variant="primary">
          Compose
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {['Inbox', 'Corp', 'Alliance', 'Sent'].map((f) => (
          <FilterChip
            key={f}
            size="md"
            label={f}
            count={f === 'Inbox' ? 2 : undefined}
            selected={folders.includes(f)}
            onToggle={() =>
              setFolders((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))
            }
          />
        ))}
        <SearchInput
          value=""
          onChange={() => undefined}
          placeholder="Search subject or sender"
          aria-label="Search mail"
          className="min-w-0 flex-1"
        />
      </div>
      <div className={cx('flex gap-3', phone && 'flex-col')}>
        <div
          className={cx(
            'rounded-xs border border-line bg-panel',
            phone ? 'w-full' : 'w-[26rem] shrink-0'
          )}
        >
          {selecting && (
            <div className="border-b border-line p-2">
              <SelectionBar count={selectedIds.length} />
            </div>
          )}
          <ul className="divide-y divide-line">
            {ROWS.map((r) => (
              <MailRow
                key={r.id}
                row={r}
                selecting={selecting}
                checked={selectedIds.includes(r.id)}
                open={!selecting && r.id === 2}
                menuOpen={rowMenuId === r.id}
              />
            ))}
          </ul>
        </div>
        {!phone && !selecting && <Reader menuOpen={readerMenu} />}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this mail?"
        body="It is deleted in EVE too and cannot be undone. Replies you already sent are not affected."
        actionLabel="Delete mail"
        cancelLabel="Cancel"
        onConfirm={async () => undefined}
        onClose={() => undefined}
      />
    </div>
  );
}

const meta = {
  title: 'mockups/MailOrganize',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today's two-pane Mail plus label tags on rows and in the reader; the row ⋮ menu gains Mark as unread and Delete…. */
export const RowMenu: Story = { render: () => <MailOrganizeMock rowMenuId={2} /> };

/** @summary The reader's existing ⋮ menu gains Mark as unread and Delete…. */
export const ReaderMenu: Story = { render: () => <MailOrganizeMock readerMenu /> };

/** @summary Select mode: checkboxes replace unread dots, a selection bar offers Mark read, Mark unread, Delete…. New component: SelectionBar. */
export const Selecting: Story = {
  render: () => <MailOrganizeMock selecting selectedIds={[1, 3, 5]} />,
};

/** @summary Delete asks once, in words: it is deleted in EVE too and cannot be undone. */
export const DeleteConfirm: Story = {
  render: () => <MailOrganizeMock rowMenuId={undefined} confirmDelete />,
};

/** @summary Select mode in the phone shell. New component: SelectionBar. */
export const SelectingPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <MailOrganizeMock selecting selectedIds={[1, 3]} phone />,
};

/** @summary Label tags and the row menu in the phone shell. */
export const RowMenuPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => <MailOrganizeMock rowMenuId={2} phone />,
};
