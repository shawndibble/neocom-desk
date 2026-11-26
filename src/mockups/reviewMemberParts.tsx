import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Button,
  DataTable,
  DisabledMenuItem,
  EmptyState,
  Eyebrow,
  MenuItem,
  Modal,
  PageHeader,
  Panel,
  RowActionsMenu,
  TextInput,
  ValueList,
  ValueRow,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { VETTING_ROLE_MAX } from '@/engine/vetting';
import { ActionResult } from '@/features/settings/settingsFields';
import { VettingCharacterList } from '@/features/corp/vetting/VettingCharacterList';
import { VettingConsentTerms } from '@/features/corp/vetting/VettingConsentTerms';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';
import {
  CORP_NAME,
  CORP_TITLES,
  EVE_ROLES,
  MAIL,
  OFFICER,
  PICKED,
  REVIEW_LINK,
  ROLE_PICKED,
  ROSTER,
  ROSTER_COUNT,
  SHARED_ROWS,
  WAITING_ROWS,
  type RosterMember,
  type WaitingRow,
} from './reviewMemberFixtures';

function Matched({ name, query }: { name: string; query: string }) {
  const at = query === '' ? -1 : name.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, at)}
      <b className="font-semibold text-accent">{name.slice(at, at + query.length)}</b>
      {name.slice(at + query.length)}
    </>
  );
}

function memberLine(member: RosterMember): string {
  if (member.waiting) return `Review asked by ${member.waiting.by}, ${member.waiting.ago}`;
  return [member.title, member.seen && `seen ${member.seen}`].filter(Boolean).join(' · ');
}

function narrow(members: readonly RosterMember[], query: string): RosterMember[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...members].sort((a, b) => a.name.localeCompare(b.name));
  const starts = members.filter((m) => m.name.toLowerCase().startsWith(q));
  const inside = members.filter(
    (m) => !m.name.toLowerCase().startsWith(q) && m.name.toLowerCase().includes(q)
  );
  return [...starts, ...inside];
}

interface MemberComboboxProps {
  query: string;
  onQuery: (query: string) => void;
  onPick: (member: RosterMember) => void;
  rosterMissing?: boolean;
}

export function MemberCombobox({ query, onQuery, onPick, rosterMissing }: MemberComboboxProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const rows = useMemo(() => narrow(ROSTER, query), [query]);
  const disabled = (m: RosterMember) => Boolean(m.waiting || m.you);
  const move = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[active];
      if (row && !disabled(row)) onPick(row);
    } else if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      event.stopPropagation();
      onQuery('');
    }
  };
  if (rosterMissing) {
    return (
      <div className="space-y-1">
        <label className="block space-y-1">
          <span className="text-xs text-text-dim">Member</span>
          <TextInput
            className="w-full"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-text-dim">
          The member list could not be read. Type the name exactly as in game; it is checked when
          you ask.
        </p>
      </div>
    );
  }
  const none = rows.length === 0;
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">Member</span>
        <span className="relative block">
          <Icon.Search
            aria-hidden="true"
            size={Icon.ICON_SIZE.md}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-dim"
          />
          <TextInput
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={none ? undefined : `${listId}-${active}`}
            className="w-full pl-8"
            placeholder={`Search ${ROSTER_COUNT} members`}
            value={query}
            onChange={(e) => {
              onQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={move}
            autoComplete="off"
            spellCheck={false}
          />
        </span>
      </label>
      {none ? (
        <div
          id={listId}
          role="status"
          className="space-y-1 rounded-xs border border-line bg-panel-2 px-3 py-3 text-sm"
        >
          <p className="font-semibold">
            No member named &ldquo;{query.trim()}&rdquo; in {CORP_NAME}
          </p>
          <p className="text-xs text-text-dim">
            Check the spelling. Someone who left, or has not joined yet, cannot be reviewed. For
            someone applying, send them the apply link instead.
          </p>
        </div>
      ) : (
        <>
          <ul
            id={listId}
            role="listbox"
            aria-label="Members"
            className="max-h-64 divide-y divide-line overflow-y-auto rounded-xs border border-line bg-panel-2"
          >
            {rows.map((member, index) => {
              const off = disabled(member);
              return (
                <li
                  key={member.characterId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  aria-disabled={off || undefined}
                  onClick={off ? undefined : () => onPick(member)}
                  className={cx(
                    'flex min-h-11 items-center gap-2.5 px-2.5 py-1.5',
                    off ? 'cursor-not-allowed' : cx('cursor-pointer', rowInteractiveClassName),
                    index === active &&
                      'bg-panel outline outline-1 -outline-offset-1 outline-accent'
                  )}
                >
                  <CharacterAvatar characterId={member.characterId} size="sm" loading="lazy" />
                  <span className={cx('min-w-0 flex-1', off && 'opacity-60')}>
                    <span className="block truncate text-sm font-semibold">
                      <Matched name={member.name} query={query.trim()} />
                    </span>
                    <span className="block truncate text-xs text-text-dim">
                      {memberLine(member)}
                    </span>
                  </span>
                  {member.waiting && <Pill tone="warning">Review waiting</Pill>}
                  {member.you && <Pill>You</Pill>}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-dim" aria-live="polite">
            {query.trim() === ''
              ? `${ROSTER_COUNT} members. Type to narrow.`
              : `${rows.length} of ${ROSTER_COUNT} members`}
          </p>
        </>
      )}
    </div>
  );
}

export function PickedMember({
  member,
  onChange,
}: {
  member: RosterMember;
  onChange?: () => void;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-xs text-text-dim">Member</span>
      <div className="flex items-center gap-3 rounded-xs border border-line bg-panel-2 px-3 py-2">
        <CharacterAvatar characterId={member.characterId} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{member.name}</span>
          <span className="block truncate text-xs text-text-dim">{memberLine(member)}</span>
        </span>
        <Button size="sm" onClick={onChange}>
          Change
        </Button>
      </div>
    </div>
  );
}

export function RoleField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const q = value.trim().toLowerCase();
  const fit = (list: readonly string[]) =>
    list.filter((r) => r.toLowerCase().includes(q) && r.toLowerCase() !== q);
  const titles = fit(CORP_TITLES);
  const roles = fit(EVE_ROLES);
  const group = (label: string, list: string[]) =>
    list.length > 0 && (
      <div className="space-y-1">
        <Eyebrow>{label}</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {list.map((role) => (
            <Button key={role} size="sm" onClick={() => onChange(role)}>
              {role}
            </Button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">Role they are up for</span>
        <TextInput
          className="w-full"
          value={value}
          maxLength={VETTING_ROLE_MAX}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Pick one below or type your own"
          autoComplete="off"
        />
      </label>
      {group(`Titles in ${CORP_NAME}`, titles)}
      {group('EVE roles', roles)}
    </div>
  );
}

export type AskStep = 'ask' | 'asked' | 'mailed';

interface ReviewMemberDialogProps {
  query?: string;
  picked?: RosterMember | null;
  role?: string;
  rosterMissing?: boolean;
  step?: AskStep;
  previewing?: boolean;
}

export function ProposedReviewMemberDialog({
  query: initialQuery = '',
  picked: initialPicked = null,
  role: initialRole = '',
  rosterMissing,
  step: initialStep = 'ask',
  previewing: initialPreviewing = false,
}: ReviewMemberDialogProps) {
  const phone = useIsPhone();
  const [query, setQuery] = useState(initialQuery);
  const [picked, setPicked] = useState<RosterMember | null>(initialPicked);
  const [role, setRole] = useState(initialRole);
  const [step, setStep] = useState<AskStep>(initialStep);
  const [previewing, setPreviewing] = useState(initialPreviewing);
  const who = picked ?? PICKED;
  const ready = (picked !== null || (rosterMissing && query.trim() !== '')) && role.trim() !== '';

  if (step !== 'ask') {
    const mailed = step === 'mailed';
    const done = (
      <Button variant={mailed ? 'primary' : 'ghost'} onClick={() => undefined}>
        Done
      </Button>
    );
    return (
      <>
        <Modal
          open
          onClose={() => undefined}
          title="Review asked"
          placement={phone ? 'sheet' : 'center'}
          dismissOnOutsidePress={false}
          footer={<div className="flex justify-end gap-2">{done}</div>}
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <CharacterAvatar characterId={who.characterId} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{who.name}</span>
                <span className="block truncate text-xs text-text-dim">
                  Promotion to {role || ROLE_PICKED}
                </span>
              </span>
              <Pill>Waiting for {firstName(who.name)}</Pill>
            </div>
            <NewComponent name="TellMemberStep">
              <div className="space-y-3">
                <p>
                  {firstName(who.name)} sees this only when they open Neocom Desk. Mail them the
                  link so they can sign in and share their characters.
                </p>
                {mailed ? (
                  <ActionResult kind="success">
                    Mail queued for {firstName(who.name)}. It goes out in about a minute.
                  </ActionResult>
                ) : (
                  <p className="text-xs text-text-dim">
                    Nothing is sent until you press Send. It goes from {OFFICER.name}, with your
                    other mail.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 [&>button]:w-full sm:[&>button]:w-auto">
                  {mailed ? (
                    <Button onClick={() => setPreviewing(true)}>Preview mail</Button>
                  ) : (
                    <>
                      <Button variant="primary" onClick={() => setStep('mailed')}>
                        Send mail to {firstName(who.name)}
                      </Button>
                      <Button onClick={() => setPreviewing(true)}>Preview mail</Button>
                    </>
                  )}
                  <Button>Copy link</Button>
                </div>
                <p className="text-xs text-text-dim">
                  The queue row's menu keeps Send mail and Copy link, so you can come back to them.
                </p>
              </div>
            </NewComponent>
          </div>
        </Modal>
        {previewing && (
          <MailPreviewDialog
            onClose={() => setPreviewing(false)}
            sent={mailed}
            onSend={() => {
              setPreviewing(false);
              setStep('mailed');
            }}
          />
        )}
      </>
    );
  }

  const buttons = (
    <>
      <Button variant="ghost">Cancel</Button>
      <Button
        variant="primary"
        aria-disabled={!ready || undefined}
        onClick={ready ? () => setStep('asked') : undefined}
      >
        Ask for a review
      </Button>
    </>
  );
  return (
    <Modal
      open
      onClose={() => undefined}
      title="Review a member"
      placement={phone ? 'sheet' : 'center'}
      dismissOnOutsidePress={false}
      footer={
        phone ? (
          <div className="flex flex-col-reverse gap-2 [&>button]:w-full">{buttons}</div>
        ) : (
          <div className="flex justify-end gap-2">{buttons}</div>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <NewComponent name="MemberCombobox">
          {picked ? (
            <PickedMember
              member={picked}
              onChange={() => {
                setPicked(null);
                setQuery('');
              }}
            />
          ) : (
            <MemberCombobox
              query={query}
              onQuery={setQuery}
              onPick={setPicked}
              rosterMissing={rosterMissing}
            />
          )}
        </NewComponent>
        <NewComponent name="RoleField">
          <RoleField value={role} onChange={setRole} />
        </NewComponent>
        <p className="text-xs text-text-dim">
          They are asked to share. You cannot sign off a review you asked for. Next you can mail
          them the link.
        </p>
      </div>
    </Modal>
  );
}

function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

export function MailPreviewDialog({
  onClose,
  sent = false,
  onSend,
}: {
  onClose: () => void;
  sent?: boolean;
  onSend?: () => void;
}) {
  const phone = useIsPhone();
  const buttons = (
    <>
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
      <Button variant={sent ? 'ghost' : 'primary'} onClick={onSend}>
        {sent ? 'Resend mail' : `Send mail to ${firstName(MAIL.to)}`}
      </Button>
    </>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Mail to ${MAIL.to}`}
      placement={phone ? 'sheet' : 'detail'}
      footer={
        phone ? (
          <div className="flex flex-col-reverse gap-2 [&>button]:w-full">{buttons}</div>
        ) : (
          <div className="flex justify-end gap-2">{buttons}</div>
        )
      }
    >
      <NewComponent name="ReviewMailPreview">
        <div className="space-y-2 rounded-xs border border-line bg-bg p-3 font-mono text-xs leading-relaxed">
          <p>
            <span className="text-text-dim">From:</span> {MAIL.from}
            <br />
            <span className="text-text-dim">To:</span> {MAIL.to}
            <br />
            <span className="text-text-dim">Subject:</span> {MAIL.subject}
          </p>
          {MAIL.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p>
            Open it: <span className="text-accent underline">{REVIEW_LINK}</span>
            <br />
            {MAIL.signInAs}
          </p>
          <p>{MAIL.sign}</p>
        </div>
      </NewComponent>
      <p className="mt-2 text-xs text-text-dim">
        The text is fixed, so what is read is always said the same way. It is queued with your other
        mail and goes out from {OFFICER.name}.
      </p>
    </Modal>
  );
}

function mailCell(row: WaitingRow) {
  if (row.mail === 'none') return <span className="text-warning">Mail not sent</span>;
  return <span className="text-text-dim">Mail sent {row.mailAgo}</span>;
}

const QUEUE_COLUMNS = (
  phone: boolean
): DataTableColumn<WaitingRow | (typeof SHARED_ROWS)[number]>[] => [
  {
    id: 'pilot',
    header: 'Pilot',
    primary: true,
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <CharacterAvatar characterId={row.characterId} size="sm" loading="lazy" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-accent">{row.name}</span>
          <span className="block truncate text-xs text-text-dim">{CORP_NAME}</span>
        </span>
      </span>
    ),
  },
  {
    id: 'for',
    header: 'For',
    render: (row) => ('role' in row ? `Promotion to ${row.role}` : row.kind),
  },
  {
    id: 'result',
    header: 'Result',
    cardCorner: true,
    render: (row) =>
      'role' in row ? <Pill>Waiting</Pill> : <Pill tone="warning">{row.result}</Pill>,
  },
  {
    id: 'signoffs',
    header: 'Sign-offs',
    className: 'whitespace-nowrap tabular-nums',
    render: (row) => ('role' in row ? '0 of 2 signed' : `${row.signed} signed`),
  },
  {
    id: 'asked',
    header: 'Request',
    className: 'whitespace-nowrap',
    render: (row) =>
      'role' in row ? (
        <span className={phone ? undefined : 'block'}>
          <span className="text-text-dim">Asked {row.asked}</span>
          <span className={phone ? undefined : 'block text-xs'}>
            {phone && ' · '}
            {mailCell(row)}
          </span>
        </span>
      ) : (
        <span className="text-text-dim">Read {row.read}</span>
      ),
  },
];

function rowMenu(row: WaitingRow | (typeof SHARED_ROWS)[number], tr: React.ReactElement) {
  if (!('role' in row)) return tr;
  const name = firstName(row.name);
  return (
    <RowActionsMenu
      name={row.name}
      items={
        <>
          {row.mail === 'none' && <MenuItem>Send mail to {name}</MenuItem>}
          {row.mail === 'sentOld' && <MenuItem>Resend mail to {name}</MenuItem>}
          {row.mail === 'sent' && (
            <DisabledMenuItem reason="Sent 6 hours ago. You can resend after a day.">
              <span>
                Resend mail to {name}
                <span className="block text-xs text-text-dim">
                  Sent 6 hours ago. You can resend after a day.
                </span>
              </span>
            </DisabledMenuItem>
          )}
          <MenuItem>Copy link</MenuItem>
        </>
      }
    >
      {tr}
    </RowActionsMenu>
  );
}

export function ProposedQueue({ only }: { only?: readonly string[] }) {
  const phone = useIsPhone();
  const rows = [...WAITING_ROWS, ...SHARED_ROWS].filter((r) => !only || only.includes(r.id));
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 pt-4">
      <PageHeader title="Vetting" meta={CORP_NAME} />
      <NewComponent name="WaitingQueueRows">
        <Panel padded={false} title="Open">
          <DataTable
            label="Open reviews"
            columns={QUEUE_COLUMNS(phone)}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={() => undefined}
            rowContextMenu={rowMenu}
            rowMoreActions
            stackLayout={phone ? 'dense' : 'labelled'}
          />
        </Panel>
      </NewComponent>
    </div>
  );
}

export function RequestedReviewPage({
  mail = 'sent',
  rail,
}: {
  mail?: 'none' | 'sent';
  rail: ReactNode;
}) {
  const member = PICKED;
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <a className={cx(textActionClassName(), 'inline-flex w-fit text-sm')}>
        <span aria-hidden="true">‹&nbsp;</span>Vetting
      </a>
      <div className="flex items-center gap-3">
        <CharacterAvatar characterId={member.characterId} size="lg" />
        <div className="min-w-0 space-y-0.5">
          <h1 className="truncate text-xl font-semibold">{member.name}</h1>
          <p className="text-sm text-text-dim">
            Promotion to {ROLE_PICKED} · {CORP_NAME}
          </p>
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <NewComponent name="RequestPanel">
            <Panel title="Request" actions={<Pill>Waiting for {firstName(member.name)}</Pill>}>
              <div className="space-y-3 text-sm">
                <ValueList>
                  <ValueRow label="Asked by" value={`${OFFICER.name} (you)`} />
                  <ValueRow label="Asked" value="2 days ago" />
                  <ValueRow label="For" value={ROLE_PICKED} />
                  <ValueRow
                    label="Mail"
                    value={mail === 'none' ? 'Not sent' : 'Sent by you, 6 hours ago'}
                    tone={mail === 'none' ? 'warning' : 'default'}
                  />
                </ValueList>
                <div className="flex flex-wrap gap-2 [&>button]:w-full sm:[&>button]:w-auto">
                  {mail === 'none' ? (
                    <Button variant="primary">Send mail to {firstName(member.name)}</Button>
                  ) : (
                    <Button aria-disabled>Resend mail</Button>
                  )}
                  <Button>Preview mail</Button>
                  <Button>Copy link</Button>
                </div>
                {mail === 'sent' && (
                  <p className="text-xs text-text-dim">You can resend after a day.</p>
                )}
              </div>
            </Panel>
          </NewComponent>
          <Panel>
            <EmptyState
              title="Nothing shared yet"
              hint={`The report shows here once ${firstName(member.name)} shares their characters. They can also decline.`}
            />
          </Panel>
        </div>
        <div className="space-y-4 lg:sticky lg:top-4">{rail}</div>
      </div>
    </div>
  );
}

export function OwnReviewPage() {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <a className={cx(textActionClassName(), 'inline-flex w-fit text-sm')}>
        <span aria-hidden="true">‹&nbsp;</span>Vetting
      </a>
      <h1 className="text-xl font-semibold">Review</h1>
      <Panel>
        <EmptyState
          title="This review is about you, so you cannot open it."
          hint="The other reviewers decide it."
        />
      </Panel>
    </div>
  );
}

const DEVICE_ROWS = [
  { characterId: 2118000009, name: 'Ren Halvard', corporationName: CORP_NAME, state: 'ready' },
  {
    characterId: 2118000040,
    name: 'Ren Freight',
    corporationName: CORP_NAME,
    state: 'ready',
  },
  {
    characterId: 2118000041,
    name: 'Halvard Mining',
    corporationName: CORP_NAME,
    state: 'needsSignIn',
    missing: ['wallet', 'mail'],
  },
] as const;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-bright text-xs font-semibold text-text-dim"
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-text-dim">{children}</span>
      </span>
    </li>
  );
}

export function MemberRequestPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <PageHeader title="Review requested" meta={CORP_NAME} />
      <NewComponent name="RequestIntro">
        <Panel title={`Promotion to ${ROLE_PICKED}`}>
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <CharacterAvatar characterId={2119876543} size="md" />
              <p>
                <span className="font-semibold">{OFFICER.name}</span> asked you to share your
                characters before you are made <span className="font-semibold">{ROLE_PICKED}</span>{' '}
                in {CORP_NAME}. Other officers decide it, not {firstName(OFFICER.name)}.
              </p>
            </div>
            <ol className="space-y-3">
              <Step n={1} title="Sign in your characters">
                2 of 3 are ready on this device. One more needs a new sign-in.
              </Step>
              <Step n={2} title="Choose which to share">
                Share the ones you want read. Ren Halvard has to be one of them.
              </Step>
              <Step n={3} title="Share, or decline">
                Declining tells the reviewers and reads nothing.
              </Step>
            </ol>
            <ul className="space-y-1 border-t border-line pt-3 text-xs text-text-dim">
              <li>Read once, when you press Share. No sign-in is kept.</li>
              <li>Mail: who wrote to whom only, never the subject or the text.</li>
              <li>You see who opens the report, and can delete it at any time.</li>
              <li>
                <a className="text-accent underline">See exactly what is read</a>
              </li>
            </ul>
          </div>
        </Panel>
      </NewComponent>
      <Panel
        title="Characters to share"
        meta="2 of 3 can be shared without another login"
        metaOwnRow
        padded={false}
      >
        <VettingCharacterList
          rows={DEVICE_ROWS.map((row) => ({ ...row }))}
          tick={{ checked: new Set([2118000009, 2118000040]), onToggle: () => undefined }}
          onSignIn={() => undefined}
        />
      </Panel>
      <Panel title="What the read covers">
        <VettingConsentTerms readers="officers" />
      </Panel>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary">Share 2 characters</Button>
        <Button>Decline</Button>
        <span className="text-xs text-text-dim">The reviewers are told if you decline.</span>
      </div>
    </div>
  );
}
