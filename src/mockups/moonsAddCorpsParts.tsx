import { useState, type ReactNode } from 'react';
import {
  Button,
  CharacterAvatar,
  Checkbox,
  Disclosure,
  Modal,
  NativeSelect,
  Panel,
  ProgressBar,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import { MAIN_CORP, type CorpState, type MyCorp } from './moonsAddCorpsFixtures';

const noop = () => {};

const STATE: Record<
  CorpState,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }
> = {
  ready: { label: 'Ready', tone: 'neutral' },
  connected: { label: 'Connected', tone: 'success' },
  'needs-sign-in': { label: 'Needs sign-in', tone: 'warning' },
  'needs-role': { label: 'Needs a role', tone: 'warning' },
  'own-book': { label: 'Has its own book', tone: 'warning' },
  'gone-quiet': { label: 'Gone quiet', tone: 'danger' },
  hidden: { label: 'Hidden', tone: 'neutral' },
};

/** One line of plain-language help under a status, with the fix button it names. */
const FIX: Partial<Record<CorpState, { text: string; action: string }>> = {
  'needs-sign-in': { text: 'The EVE sign-in did not finish.', action: 'Sign in again' },
  'needs-role': {
    text: 'This character is not the CEO any more, so EVE refuses the mining ledger.',
    action: 'Sign in as another character',
  },
  'own-book': {
    text: 'This corp runs its own tax book. A corp can run its own book or be a moon owner here, not both.',
    action: 'Move it into this book…',
  },
  'gone-quiet': {
    text: 'EVE has not answered for this corp for a while. It may be closed.',
    action: 'Remove',
  },
};

function StatePill({ state }: { state: CorpState }) {
  return <Pill tone={STATE[state].tone}>{STATE[state].label}</Pill>;
}

/** Page chrome the new pieces sit in: header with the entry button, then the tabs line. */
export function MoonsHeader({ onAdd = noop }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold">Moons</h1>
        <p className="text-xs text-text-dim">{MAIN_CORP} · Synced 2 hours ago by Mira Soltane</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost">Invite a moon owner</Button>
        <Button variant="primary" onClick={onAdd}>
          Add my other corps
        </Button>
      </div>
    </div>
  );
}

/** The one-time prompt for a corp that appeared since the last visit. */
export function NewCorpBanner({ corp }: { corp: MyCorp }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xs border border-accent/40 bg-panel p-3"
    >
      <p className="min-w-0 text-sm">
        <span className="font-semibold">New corp found: {corp.name}.</span>{' '}
        <span className="text-text-dim">
          {corp.ceo} is its CEO. If it owns moons, connect it so they show up in this book.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm">Connect it</Button>
        <Button size="sm">Not now</Button>
        <Button size="sm">Don’t ask again</Button>
      </div>
    </div>
  );
}

/** Moon owners list as the book shows it afterwards: his own corps carry a Yours pill. */
function MoonOwnersAfter({ corps }: { corps: MyCorp[] }) {
  const rows = corps.filter((c) => c.state === 'connected');
  return (
    <Panel title="Moon owners" meta={`${rows.length} corps`}>
      <ul className="divide-y divide-line text-sm">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{c.name}</span>
              <Pill tone="accent">Yours</Pill>
            </span>
            <span className="text-text-dim">
              {c.refineries} refiner{c.refineries === 1 ? 'y' : 'ies'} · no owner rate · no payouts
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CorpRow({
  corp,
  checked,
  onToggle,
  trailing,
}: {
  corp: MyCorp;
  checked?: boolean;
  onToggle?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      {onToggle && (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox checked={checked} onChange={onToggle} aria-label={`Connect ${corp.name}`} />
        </label>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{corp.name}</p>
        <p className="truncate text-xs text-text-dim">CEO: {corp.ceo}</p>
      </div>
      {trailing}
    </li>
  );
}

/** Step 1: tick the corps that own moons. Nothing is ticked: the app cannot see moons yet. */
export function PickCorps({ corps, selected }: { corps: MyCorp[]; selected: number[] }) {
  const [sel, setSel] = useState(selected);
  const shown = corps.filter((c) => c.state !== 'hidden');
  const hidden = corps.filter((c) => c.state === 'hidden').length;
  return (
    <Modal
      open
      onClose={noop}
      placement="wide"
      title="Add my other corps"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hidden > 0 ? <Button size="sm">Hidden corps ({hidden})</Button> : <span />}
          <Button variant="primary" disabled={sel.length === 0}>
            Continue with {sel.length} {sel.length === 1 ? 'corp' : 'corps'}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-sm text-text-dim">
        These are corps where one of your characters is CEO. Tick the ones that own moons. We can’t
        see moons from here, the sign-in on the next step confirms it.
      </p>
      <div className="mb-1 flex gap-2">
        <Button size="sm" onClick={() => setSel(shown.map((c) => c.id))}>
          Tick all
        </Button>
        <Button size="sm" onClick={() => setSel([])}>
          Clear
        </Button>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((c) => (
          <CorpRow
            key={c.id}
            corp={c}
            checked={sel.includes(c.id)}
            onToggle={() =>
              setSel((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
            }
            trailing={
              <Button size="sm" className="shrink-0">
                Don’t ask again
              </Button>
            }
          />
        ))}
      </ul>
    </Modal>
  );
}

/** Step 2: one confirm for the whole batch, with how far back to read. */
export function ConfirmBatch({ corps }: { corps: MyCorp[] }) {
  return (
    <Modal
      open
      onClose={noop}
      placement="wide"
      title={`Connect ${corps.length} corps`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button>Back</Button>
          <Button variant="primary">Connect {corps.length} corps</Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title="What this book will see" fill>
            <ul className="list-disc space-y-1 pl-4 text-text-dim">
              <li>Each corp’s mining ledger: who mined what, and where.</li>
              <li>The names of its refineries.</li>
            </ul>
          </Panel>
          <Panel title="What it will not see" fill>
            <ul className="list-disc space-y-1 pl-4 text-text-dim">
              <li>Wallets, mail or notifications.</li>
              <li>Anything you can’t see in this book already.</li>
            </ul>
          </Panel>
        </div>
        <p className="text-text-dim">
          Because you own these corps, they are marked <Pill tone="accent">Yours</Pill>: no owner
          rate and no payouts between them. You can stop any corp later from its row.
        </p>
        <label className="block space-y-1">
          <span className="font-semibold">How far back should we count mining?</span>
          <NativeSelect defaultValue="today" aria-label="How far back">
            <option value="today">From today</option>
            <option value="7">The last 7 days</option>
            <option value="14">The last 14 days</option>
            <option value="30">The last 30 days</option>
          </NativeSelect>
          <span className="block text-xs text-text-dim">
            Applies to all {corps.length} corps. EVE only keeps about 30 days of mining, so anything
            older can’t be recovered; you would have to record it yourself. Mining already taxed by
            a previous owner would be counted again if you go back.
          </span>
        </label>
        <Disclosure
          label={`Corps in this batch (${corps.length})`}
          expanded={false}
          onToggle={noop}
        >
          <ul className="columns-2 space-y-0.5 text-xs text-text-dim">
            {corps.map((c) => (
              <li key={c.id}>
                {c.name} · {c.ceo}
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </Modal>
  );
}

/** What happened on the last return from EVE, shown above the next sign-in. */
export type SignInOutcome =
  { kind: 'connected'; corp: string } | { kind: 'wrong-character'; signedInAs: string };

/**
 * Step 3: the guided sign-in sequence. `done` corps are finished and the next is
 * current. The run lives in the browser, so EVE's redirect back reopens this
 * dialog on the next corp (or the same one after a wrong character).
 */
export function SignInSequence({
  corps,
  done,
  skipped,
  outcome,
}: {
  corps: MyCorp[];
  done: number;
  skipped: number[];
  outcome?: SignInOutcome;
}) {
  const current = corps[done]!;
  return (
    <Modal
      open
      onClose={noop}
      placement="wide"
      title={`Signing in: corp ${done + 1} of ${corps.length}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button>Stop here</Button>
          <Button variant="primary">Sign in as {current.ceo} with EVE</Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {outcome?.kind === 'connected' && (
          <p role="status" className="rounded-xs border border-success/40 p-2 text-success">
            Connected {outcome.corp}. Next up is {current.name}.
          </p>
        )}
        {outcome?.kind === 'wrong-character' && (
          <p role="alert" className="rounded-xs border border-danger/40 p-2 text-danger">
            You signed in as {outcome.signedInAs}. {current.name} needs {current.ceo}. Nothing was
            connected; try again with the character below.
          </p>
        )}
        <ProgressBar label="Corps connected" value={done} max={corps.length} />
        <div className="flex items-center gap-3 rounded-xs border border-accent/40 bg-panel p-3">
          <CharacterAvatar characterId={current.ceoId} size="lg" alt={current.ceo} />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-text-dim">
              Choose this character on EVE’s login page
            </p>
            <p className="truncate text-lg font-semibold">{current.ceo}</p>
            <p className="truncate text-text-dim">CEO of {current.name}</p>
          </div>
        </div>
        <p className="text-xs text-text-dim">
          Signed in to EVE as someone else? Pick{' '}
          <span className="font-semibold">{current.ceo}</span> from the account list, or use “Log in
          with a different character”. EVE brings you back here and this window opens on the next
          corp. You can close the tab between corps; your place is kept.
        </p>
        <ul className="divide-y divide-line">
          {corps.map((c, i) => {
            const state: CorpState = skipped.includes(c.id)
              ? 'needs-sign-in'
              : i < done
                ? 'connected'
                : 'ready';
            return (
              <CorpRow
                key={c.id}
                corp={c}
                trailing={i === done ? <Pill tone="accent">Now</Pill> : <StatePill state={state} />}
              />
            );
          })}
        </ul>
        <p className="text-xs text-text-dim">
          If a sign-in fails it is skipped and listed under Needs sign-in, so you never have to
          start over.
        </p>
      </div>
    </Modal>
  );
}

/** After the run: every corp with its status and, where there is one, the one-line fix. */
export function CorpStatusList({ corps }: { corps: MyCorp[] }) {
  const attention = corps.flatMap((c) => {
    const fix = FIX[c.state];
    return fix ? [{ corp: c, fix }] : [];
  });
  const ok = corps.filter((c) => !FIX[c.state]);
  return (
    <div className="space-y-4">
      <Panel
        title={`Needs you (${attention.length})`}
        meta={`${ok.length} of ${corps.length} connected`}
      >
        <ul className="divide-y divide-line">
          {attention.map(({ corp: c, fix }) => (
            <li key={c.id} className="space-y-1 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <StatePill state={c.state} />
                </span>
                <Button size="sm" variant={c.state === 'gone-quiet' ? 'danger' : 'ghost'}>
                  {fix.action}
                </Button>
              </div>
              <p className="text-xs text-text-dim">{fix.text}</p>
              {c.state === 'gone-quiet' && (
                <p className="text-xs text-text-dim">
                  Removing keeps its past mining and billing records.
                </p>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <MoonOwnersAfter corps={corps} />
    </div>
  );
}

/**
 * Opened from the picker's "Hidden corps (N)" button, never shown on the page: a
 * corp dismissed with "Don't ask again" stays out of the banner and the picker
 * until it is added back here.
 */
export function HiddenCorps({ corps }: { corps: MyCorp[] }) {
  const hidden = corps.filter((c) => c.state === 'hidden');
  return (
    <Modal
      open
      onClose={noop}
      title="Hidden corps"
      footer={
        <div className="flex justify-end">
          <Button>Done</Button>
        </div>
      }
    >
      <p className="mb-2 text-sm text-text-dim">
        You chose not to be asked about these. Add one back and it appears in the list again.
      </p>
      <ul className="divide-y divide-line">
        {hidden.map((c) => (
          <CorpRow key={c.id} corp={c} trailing={<Button size="sm">Add</Button>} />
        ))}
      </ul>
    </Modal>
  );
}
