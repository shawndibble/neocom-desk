/* eslint-disable react-refresh/only-export-components -- mockup parts share constants with their stories */
/**
 * Pieces of the vetting review mockups: the corp's queue and one pilot's
 * report (result line, flags with their evidence, checks that found nothing,
 * checks that could not run, sign-offs). Sample data only.
 */
import { useState, type ReactNode } from 'react';
import {
  Button,
  CollapsiblePanel,
  DataTable,
  Disclosure,
  Eyebrow,
  PageHeader,
  Panel,
  SegmentedControl,
  SeverityIcon,
  Tabs,
  TextArea,
  ValueList,
  ValueRow,
  entityLinkClassName,
  textActionClassName,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListFlushClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import { Pill, type PillTone } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';
import { Portrait } from './vettingApplicantParts';
import {
  QUEUE,
  VIEW_LOG,
  type Check,
  type Flag,
  type Review,
  type SignOff,
  type VettingCharacter,
} from './vettingFixtures';

export const PHONE = { viewport: { value: 'mobile1', isRotated: false } };
export const VETTING_PARAMS = { layout: 'fullscreen', shell: { path: '/corp/vetting' } };
const noop = () => {};

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-page space-y-4 px-4 py-4">{children}</div>;
}

function CorpSubNav() {
  const entries = ['Overview', 'Members', 'Wallet', 'Assets', 'Moons', 'SRP', 'Vetting'];
  return (
    <div className={tabScrollerClassName}>
      <nav aria-label="Corp" className={tabListFlushClassName}>
        {entries.map((entry) => (
          <a
            key={entry}
            href={entry === 'Overview' ? '/corp' : `/corp/${entry.toLowerCase()}`}
            aria-current={entry === 'Vetting' ? 'page' : undefined}
            className={cx(
              tabItemClassName,
              entry === 'Vetting' ? tabItemActiveClassName : tabItemIdleClassName
            )}
          >
            {entry}
          </a>
        ))}
      </nav>
    </div>
  );
}

// --------------------------------------------------------------------- queue

/**
 * A review's result in words. "Nothing found" is neutral on purpose: a clean
 * read is not proof, so it never gets the success tone.
 */
export function ResultPill({ review }: { review: Review }) {
  const map: Record<Review['result'], { label: string; tone: PillTone }> = {
    flags: {
      label: `${review.flags} ${review.flags === 1 ? 'flag' : 'flags'}`,
      tone: review.worst === 'critical' ? 'danger' : 'warning',
    },
    nothing: { label: 'Nothing found', tone: 'neutral' },
    incomplete: { label: 'Incomplete', tone: 'warning' },
    waiting: { label: 'Waiting for pilot', tone: 'neutral' },
    declined: { label: 'Declined', tone: 'warning' },
  };
  const { label, tone } = map[review.result];
  return <Pill tone={tone}>{label}</Pill>;
}

function kindLabel(review: Review): string {
  return review.kind === 'Promotion' ? `Promotion to ${review.role}` : 'Application';
}

const queueColumns: DataTableColumn<Review>[] = [
  {
    id: 'pilot',
    header: 'Pilot',
    primary: true,
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <Portrait name={row.pilot} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-accent">{row.pilot}</span>
          <span className="block truncate text-xs text-text-dim">{row.from}</span>
        </span>
      </span>
    ),
  },
  { id: 'kind', header: 'For', render: (row) => kindLabel(row) },
  {
    id: 'characters',
    header: 'Characters',
    align: 'right',
    className: 'tabular-nums',
    render: (row) =>
      row.characters > 0 ? row.characters : <span className="text-text-faint">-</span>,
  },
  { id: 'result', header: 'Result', render: (row) => <ResultPill review={row} /> },
  {
    id: 'signoffs',
    header: 'Sign-offs',
    className: 'whitespace-nowrap tabular-nums',
    render: (row) => (
      <span className="block">
        {row.signed} of {row.needed}
        {row.yours && row.result !== 'waiting' && (
          <span className="block text-xs text-warning">Yours needed</span>
        )}
      </span>
    ),
  },
  {
    id: 'read',
    header: 'Read',
    align: 'right',
    className: 'whitespace-nowrap text-text-dim tabular-nums',
    render: (row) => row.read,
  },
];

/** Header, summary line, tabs and the queue. Only a row click opens a report: a decision needs the report read. */
export function QueuePage({ rows = QUEUE, empty }: { rows?: Review[]; empty?: ReactNode }) {
  const tabsId = useTabsId();
  const phone = useIsPhone();
  const yours = rows.filter((row) => row.yours).length;
  return (
    <Page>
      <PageHeader title="Vetting" subNav={<CorpSubNav />} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm tabular-nums" aria-live="polite">
          <span className="font-semibold">{rows.length} open</span>
          <span className="text-text-dim"> · </span>
          <span className="font-semibold">{yours}</span>
          <span className="text-text-dim"> need your sign-off</span>
        </p>
        <span className="flex flex-wrap gap-2">
          <Button>Copy apply link</Button>
          <Button>Review a member…</Button>
        </span>
      </div>
      {phone ? (
        <SegmentedControl
          label="Vetting reviews"
          fill
          uppercase={false}
          value="open"
          onChange={noop}
          options={[
            { value: 'open', label: `Open ${rows.length}` },
            { value: 'decided', label: 'Decided' },
            { value: 'watchlist', label: 'Watchlist' },
          ]}
        />
      ) : (
        <Tabs
          tabsId={tabsId}
          label="Vetting reviews"
          value="open"
          onChange={noop}
          tabs={[
            { id: 'open', label: 'Open', count: rows.length, countTone: 'warning' },
            { id: 'decided', label: 'Decided' },
            { id: 'watchlist', label: 'Watchlist', count: 14 },
          ]}
        />
      )}
      {empty ?? (
        <Panel padded={false} title="Open reviews">
          <DataTable
            label="Open vetting reviews"
            columns={queueColumns}
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={noop}
          />
        </Panel>
      )}
    </Page>
  );
}

// -------------------------------------------------------------------- report

/**
 * The report's one-line answer. Three states, never "safe": flags found,
 * nothing found (with how many checks ran), or incomplete.
 */
export function ResultLine({
  flags,
  checks,
  missing,
  worst,
}: {
  flags: number;
  checks: number;
  missing: number;
  worst: 'critical' | 'warning' | 'clear';
}) {
  return (
    <NewComponent name="VettingResultLine">
      <div className="flex items-start gap-3">
        <SeverityIcon severity={worst} size={Icon.ICON_SIZE.lg} className="mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-semibold tabular-nums">
            {flags === 0
              ? `Nothing found in ${checks} checks`
              : `${flags} ${flags === 1 ? 'flag' : 'flags'} in ${checks} checks`}
          </p>
          <p className="text-sm text-text-dim">
            {missing > 0 && (
              <span className="text-warning">
                {missing} {missing === 1 ? 'check' : 'checks'} could not run.{' '}
              </span>
            )}
            {flags === 0
              ? 'Not a verdict. An undeclared character cannot be checked.'
              : 'Each flag is a reason to ask.'}
          </p>
        </div>
      </div>
    </NewComponent>
  );
}

function Entity({ name }: { name: string }) {
  return (
    <a href="#entity" className={entityLinkClassName()}>
      {name}
    </a>
  );
}

function EvidenceRows({ flag }: { flag: Flag }) {
  return (
    <ul className="divide-y divide-line border-y border-line text-sm">
      {flag.evidence.map((row) => (
        <li
          key={row.at + row.what}
          className="grid grid-cols-[6.5rem_1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-1.5 max-sm:grid-cols-1"
        >
          <span className="text-xs text-text-dim tabular-nums">{row.at}</span>
          <span className="min-w-0">
            <Entity name={row.who} />
            {row.whoNote && <span className="text-text-dim"> · {row.whoNote}</span>}
            <span className="block text-xs text-text-dim">{row.what}</span>
          </span>
          {row.amount && (
            <span className="text-right tabular-nums max-sm:text-left">{row.amount} ISK</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * One flag: severity glyph and word, a title, one sentence a recruiter can act
 * on, where it came from, and the rows behind it under a disclosure (the Pin
 * and Juicebox "criterion plus its evidence" pattern from the Mobbin sample).
 */
export function FlagItem({ flag, open }: { flag: Flag; open?: boolean }) {
  const [expanded, setExpanded] = useState(Boolean(open));
  const word = flag.severity === 'critical' ? 'Serious' : 'Ask about';
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-start gap-2">
        <SeverityIcon severity={flag.severity} className="mt-1" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            {flag.title}
            <Pill tone={flag.severity === 'critical' ? 'danger' : 'warning'}>{word}</Pill>
            {flag.isNew && <Pill tone="accent">New since last review</Pill>}
          </p>
          <p className="text-sm">{flag.finding}</p>
          <p className="text-xs text-text-dim">
            On {flag.on} · from {flag.source}
          </p>
        </div>
      </div>
      <div className="pl-6">
        <Disclosure
          label={`${flag.evidence.length} ${flag.evidence.length === 1 ? 'row' : 'rows'} behind this`}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
        >
          <EvidenceRows flag={flag} />
        </Disclosure>
      </div>
    </li>
  );
}

export function FlagList({ flags }: { flags: Flag[] }) {
  return (
    <NewComponent name="VettingFlag">
      <ul className="divide-y divide-line">
        {flags.map((flag, index) => (
          <FlagItem key={flag.id} flag={flag} open={index === 0} />
        ))}
      </ul>
    </NewComponent>
  );
}

function CheckRows({ checks, tone }: { checks: Check[]; tone?: 'warning' }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {checks.map((check) => (
        <li key={check.name} className="grid gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[16rem_1fr]">
          <span className={cx('font-semibold', tone === 'warning' && 'text-warning')}>
            {check.name}
          </span>
          <span className="text-text-dim">{check.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** Checks that could not run, kept apart from the ones that ran clean. */
export function MissingChecks({ checks }: { checks: Check[] }) {
  return (
    <Panel title="Could not check" padded={false}>
      <CheckRows checks={checks} tone="warning" />
      <div className="flex flex-wrap items-center gap-3 border-t border-line p-3">
        <Button size="sm">Ask for a fresh read</Button>
        <span className="text-xs text-text-dim">The pilot has to share again.</span>
      </div>
    </Panel>
  );
}

/** The checks that ran and raised nothing: collapsed by default, each with what it looked at. */
export function ClearChecks({ checks, open }: { checks: Check[]; open?: boolean }) {
  const [expanded, setExpanded] = useState(Boolean(open));
  return (
    <CollapsiblePanel
      title={`Nothing found in ${checks.length} checks`}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      labels={{ show: 'Show the checks', hide: 'Hide the checks' }}
      padded={false}
      collapsedSummary={
        <span className="block px-3 py-2 text-xs text-text-dim">
          {checks
            .slice(0, 3)
            .map((check) => check.name)
            .join(', ')}{' '}
          and {checks.length - 3} more
        </span>
      }
    >
      <CheckRows checks={checks} />
    </CollapsiblePanel>
  );
}

const characterColumns: DataTableColumn<VettingCharacter>[] = [
  {
    id: 'name',
    header: 'Character',
    primary: true,
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <Portrait name={row.name} size="sm" />
        <span className="min-w-0">
          <Entity name={row.name} />
          <span className="block truncate text-xs text-text-dim">{row.corp}</span>
        </span>
      </span>
    ),
  },
  { id: 'born', header: 'Born', className: 'whitespace-nowrap', render: (row) => row.born },
  {
    id: 'sp',
    header: 'Skill points',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.skillPoints,
  },
  {
    id: 'corps',
    header: 'Corporations',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.corps,
  },
  {
    id: 'state',
    header: 'Shared',
    render: (row) =>
      row.missing ? (
        <Pill tone="warning">No {row.missing}</Pill>
      ) : (
        <span className="text-text-dim">Everything</span>
      ),
  },
];

export function CharactersPanel({ characters }: { characters: VettingCharacter[] }) {
  return (
    <Panel
      title="Declared characters"
      padded={false}
      meta={<span className="text-xs text-text-dim">{characters.length}</span>}
    >
      <DataTable
        label="Declared characters"
        columns={characterColumns}
        rows={characters}
        rowKey={(row) => row.name}
      />
    </Panel>
  );
}

export function FactsPanel({
  title,
  meta,
  rows,
}: {
  title: string;
  meta?: string;
  rows: { label: string; value: string; note?: string }[];
}) {
  return (
    <Panel title={title} meta={meta && <span className="text-xs text-text-dim">{meta}</span>}>
      <ValueList>
        {rows.map((row) => (
          <ValueRow key={row.label} label={row.label} value={row.value} note={row.note} />
        ))}
      </ValueList>
    </Panel>
  );
}

const SIGN_TONE: Record<SignOff['state'], PillTone> = {
  you: 'warning',
  hidden: 'neutral',
  barred: 'neutral',
  open: 'neutral',
};
const SIGN_WORD: Record<SignOff['state'], string> = {
  you: 'Yours',
  hidden: 'Decided',
  barred: 'Cannot sign',
  open: 'Waiting',
};

/**
 * Who has to decide and where each stands. A second reviewer does not see the
 * first one's decision until they record their own; whoever asked for the
 * review cannot sign it off.
 */
export function Decision({
  signOffs,
  needed,
  verb,
}: {
  signOffs: SignOff[];
  needed: number;
  verb: { yes: string; no: string };
}) {
  return (
    <Panel
      title="Decision"
      meta={
        <span className="text-xs text-text-dim tabular-nums">
          {needed === 1 ? '1 sign-off needed' : `${needed} sign-offs needed`}
        </span>
      }
      metaOwnRow
    >
      <div className="space-y-3">
        <NewComponent name="VettingSignOffs">
          <ul className="space-y-2 text-sm">
            {signOffs.map((signOff) => (
              <li key={signOff.who} className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{signOff.who}</span>
                  <span className="text-text-dim"> · {signOff.role}</span>
                  <span className="block text-xs text-text-dim">{signOff.note}</span>
                </span>
                <Pill tone={SIGN_TONE[signOff.state]}>{SIGN_WORD[signOff.state]}</Pill>
              </li>
            ))}
          </ul>
        </NewComponent>
        <label className="block space-y-1">
          <span className="text-xs text-text-dim">Note, kept with your decision</span>
          <TextArea rows={2} placeholder="Optional" />
        </label>
        <div className="grid grid-cols-2 gap-2 [&>button]:w-full">
          <Button>{verb.no}…</Button>
          <Button variant="success">{verb.yes}</Button>
        </div>
      </div>
    </Panel>
  );
}

export function AboutReport({ read, kept }: { read: string; kept: string }) {
  return (
    <Panel title="About this report">
      <div className="space-y-3 text-sm">
        <ValueList>
          <ValueRow label="Read" value={read} />
          <ValueRow label="Kept until" value={kept} />
          <ValueRow label="Sign-in kept" value="None" />
        </ValueList>
        <div className="space-y-2">
          <Eyebrow>Who opened it</Eyebrow>
          <NewComponent name="VettingViewLog">
            <ol className="space-y-1.5">
              {VIEW_LOG.map((entry) => (
                <li
                  key={entry.at + entry.text}
                  className="grid grid-cols-[6.5rem_1fr] items-baseline gap-2"
                >
                  <span className="text-xs text-text-dim tabular-nums">{entry.at}</span>
                  <span>
                    <span className="font-semibold">{entry.actor}</span>{' '}
                    <span className="text-text-dim">{entry.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </NewComponent>
        </div>
      </div>
    </Panel>
  );
}

/** The report page: main column of findings, a rail for the decision; one column with a pinned bar on a phone. */
export function ReportPage({
  pilot,
  from,
  kind,
  note,
  main,
  rail,
}: {
  pilot: string;
  from: string;
  kind: string;
  note?: string;
  main: ReactNode;
  rail: ReactNode;
}) {
  return (
    <Page>
      <a href="/corp/vetting" className={cx(textActionClassName(), 'inline-flex text-sm')}>
        ‹ Vetting
      </a>
      <div className="flex items-center gap-3">
        <Portrait name={pilot} size="lg" />
        <div className="min-w-0 space-y-0.5">
          <h1 className="truncate text-xl font-semibold">{pilot}</h1>
          <p className="text-sm text-text-dim">
            {kind} · {from}
          </p>
        </div>
      </div>
      {note && (
        <Panel title="Their note">
          <p className="text-sm">{note}</p>
        </Panel>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">{main}</div>
        <div className="space-y-4 lg:sticky lg:top-4">{rail}</div>
      </div>
    </Page>
  );
}
