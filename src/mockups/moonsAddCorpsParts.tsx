import { useState, type ReactNode } from 'react';
import { Button, Checkbox, Modal, NativeSelect, Panel, ProgressBar } from '@/components/ui';
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
    text: 'This corp runs its own tax book. A corp can run its own or feed this one, not both.',
    action: 'Move it into this book…',
  },
  'gone-quiet': {
    text: 'EVE has not answered for this corp for a while. It may be closed.',
    action: 'Remove',
  },
};

export function StatePill({ state }: { state: CorpState }) {
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
        <Button variant="primary" size="sm">
          Connect it
        </Button>
        <Button size="sm">Not now</Button>
        <Button size="sm">Don’t ask again</Button>
      </div>
    </div>
  );
}

/** Moon owners list as the book shows it afterwards: his own corps carry a Yours pill. */
export function MoonOwnersAfter({ corps }: { corps: MyCorp[] }) {
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
        <Checkbox checked={checked} onChange={onToggle} aria-label={`Connect ${corp.name}`} />
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
        <details className="text-xs text-text-dim">
          <summary className="cursor-pointer">Corps in this batch ({corps.length})</summary>
          <ul className="mt-1 columns-2 space-y-0.5">
            {corps.map((c) => (
              <li key={c.id}>
                {c.name} · {c.ceo}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Modal>
  );
}

/** Step 3: the guided sign-in sequence. `done` corps are finished, the next one is current. */
export function SignInSequence({
  corps,
  done,
  skipped,
}: {
  corps: MyCorp[];
  done: number;
  skipped: number[];
}) {
  const current = corps[done];
  return (
    <Modal
      open
      onClose={noop}
      placement="wide"
      title={`Signing in: corp ${done + 1} of ${corps.length}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button>Stop here</Button>
          <Button variant="primary">Sign in as {current?.ceo} with EVE</Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <ProgressBar label="Corps connected" value={done} max={corps.length} />
        <p>
          Next: <span className="font-semibold">{current?.name}</span>. EVE will ask you to choose{' '}
          <span className="font-semibold">{current?.ceo}</span> on its login page.
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
          Each sign-in sends you straight to the next corp. If one fails it is skipped and listed
          under Needs sign-in, so you never have to start over.
        </p>
      </div>
    </Modal>
  );
}

/** After the run: every corp with its status and, where there is one, the one-line fix. */
export function CorpStatusList({ corps }: { corps: MyCorp[] }) {
  const attention = corps.filter((c) => FIX[c.state]);
  const ok = corps.filter((c) => !FIX[c.state]);
  return (
    <div className="space-y-4">
      <Panel
        title={`Needs you (${attention.length})`}
        meta={`${ok.length} of ${corps.length} connected`}
      >
        <ul className="divide-y divide-line">
          {attention.map((c) => (
            <li key={c.id} className="space-y-1 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{c.name}</span>
                  <StatePill state={c.state} />
                </span>
                <Button size="sm" variant={c.state === 'gone-quiet' ? 'danger' : 'ghost'}>
                  {FIX[c.state]!.action}
                </Button>
              </div>
              <p className="text-xs text-text-dim">{FIX[c.state]!.text}</p>
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

/** The list a corp can be brought back from after “Don’t ask again”. */
export function HiddenCorps({ corps }: { corps: MyCorp[] }) {
  const hidden = corps.filter((c) => c.state === 'hidden');
  return (
    <Panel title="Hidden corps" meta="You chose not to be asked about these">
      <ul className="divide-y divide-line">
        {hidden.map((c) => (
          <CorpRow key={c.id} corp={c} trailing={<Button size="sm">Add</Button>} />
        ))}
      </ul>
    </Panel>
  );
}
