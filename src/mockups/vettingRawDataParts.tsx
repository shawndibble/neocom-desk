import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  DataTable,
  Eyebrow,
  Panel,
  Spinner,
  ValueList,
  ValueRow,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { Pill } from '@/components/ui/Pill';
import { SeverityIcon } from '@/components/ui';
import {
  VETTING_DEFAULT_SETTINGS,
  VETTING_KEEP_DAYS,
  VETTING_OPEN_KEEP_DAYS,
  type VettingReview,
} from '@/engine/vetting';
import { VettingDecision } from '@/features/corp/vetting/VettingDecision';
import { VettingFlagList } from '@/features/corp/vetting/VettingFlagList';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import {
  createVettingFixture,
  VETTING_FIXTURE_CORPORATION,
  VETTING_FIXTURE_REVIEWS,
} from '@/storybook/vettingFixture';
import { NewComponent } from './NewComponent';
import {
  PILOTS,
  ROWS,
  SOURCE_COVERS,
  SOURCE_IDS,
  SOURCE_LABEL,
  shared,
  type SourceId,
} from './vettingRawDataFixtures';

interface SourceLine {
  id: SourceId;
  rows: number;
  covers: string;
  notShared: string[];
}

const LINES: SourceLine[] = SOURCE_IDS.map((id) => ({
  id,
  rows: ROWS[id].length,
  covers: SOURCE_COVERS[id],
  notShared: PILOTS.filter((p) => !shared(p, id)).map((p) => p.name),
}));

/**
 * The report's "Data we read": one row per source with how many rows were read, what it covers
 * and who did not share it. A row opens that source's browser (row click and accent name, DESIGN
 * section 6c: no separate Open button).
 */
export function DataWeReadPanel() {
  const columns: DataTableColumn<SourceLine>[] = [
    {
      id: 'source',
      header: 'Source',
      primary: true,
      render: (row) => <a className={textActionClassName()}>{SOURCE_LABEL[row.id]}</a>,
    },
    {
      id: 'rows',
      header: 'Rows read',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => formatCount(row.rows),
    },
    {
      id: 'covers',
      header: 'Covers',
      className: 'text-text-dim',
      render: (row) => row.covers,
    },
    {
      id: 'shared',
      header: 'Shared by',
      render: (row) =>
        row.notShared.length > 0 ? (
          <Pill tone="warning">Not {row.notShared.map((n) => n.split(' ')[0]).join(', ')}</Pill>
        ) : (
          <span className="text-text-dim">All {PILOTS.length}</span>
        ),
    },
  ];
  return (
    <NewComponent name="DataWeRead">
      <Panel
        title="Data we read"
        meta={`${formatCount(LINES.reduce((n, l) => n + l.rows, 0))} rows`}
        padded={false}
      >
        <DataTable
          label="Data we read"
          columns={columns}
          rows={LINES}
          rowKey={(row) => row.id}
          onRowClick={() => undefined}
          responsive="table"
        />
        <p className="border-t border-line p-3 text-xs text-text-dim">
          Every row the read returned, kept with this report, not only the ones a check flagged.
          Mail is headers only: who wrote to whom, never a subject or text. Opening a source is
          logged with the other opens.
        </p>
      </Panel>
    </NewComponent>
  );
}

/** Under the flag list: each flag's rows in the data, one link per flag. In the build this is a link inside each flag's own disclosure. */
export function FlagDataLinks() {
  return (
    <NewComponent name="FlagDataLinks">
      <ul className="space-y-2 text-sm">
        <li id="flag-watchlistIsk" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SeverityIcon severity="critical" />
          <span className="font-semibold">Watchlist ISK</span>
          <a className={textActionClassName()}>Open the 3 rows in Wallet journal</a>
          <span className="text-text-dim">
            (the flag shows up to 10; the journal has all {formatCount(ROWS.wallet.length)})
          </span>
        </li>
        <li id="flag-cynoNoCapital" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SeverityIcon severity="warning" />
          <span className="font-semibold">Cyno skill, no capital</span>
          <a className={textActionClassName()}>Open the skill in Skills</a>
        </li>
      </ul>
    </NewComponent>
  );
}

/** Loads the flagged review from the in-memory fixture: the real flags, characters and decision rail. */
function useFlaggedReview(): VettingReview | null {
  const [review, setReview] = useState<VettingReview | null>(null);
  useEffect(() => {
    void createVettingFixture()
      .open(2119876543, VETTING_FIXTURE_CORPORATION.corporationId, VETTING_FIXTURE_REVIEWS.flagged)
      .then(setReview);
  }, []);
  return review;
}

/** The report page with the new section, the real flags and rail around it. */
export function ProposedReport({ children }: { children?: ReactNode }) {
  const review = useFlaggedReview();
  if (review === null || review.assessment === null)
    return <Spinner block="page" label="Loading" />;
  const assessment = review.assessment;
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <a className={cx(textActionClassName(), 'inline-flex w-fit text-sm')}>
        <span aria-hidden="true">‹&nbsp;</span>Vetting
      </a>
      <div className="flex items-center gap-3">
        <CharacterAvatar characterId={PILOTS[0].characterId} size="lg" />
        <div className="min-w-0 space-y-0.5">
          <h1 className="truncate text-xl font-semibold">Tamsin Vell</h1>
          <p className="text-sm text-text-dim">Application · Hollow Reach Mining</p>
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Flags" padded={false}>
            <VettingFlagList
              flags={assessment.flags}
              parties={review.parties}
              characters={review.reportCharacters}
            />
          </Panel>
          <FlagDataLinks />
          <DataWeReadPanel />
          {children}
        </div>
        <div className="space-y-4 lg:sticky lg:top-4">
          <VettingDecision
            review={review}
            reviewerId={2119876543}
            settings={VETTING_DEFAULT_SETTINGS}
            onDecide={async () => undefined}
          />
          <Panel title="About this report">
            <ValueList>
              <ValueRow label="Read" value="14 Nov 2026, 10:00" note="2 hours ago" />
              <ValueRow
                label="Kept until"
                value="12 Feb 2027"
                note={`or ${VETTING_KEEP_DAYS} days after a decision`}
              />
              <ValueRow label="Rows kept" value="All of them" tone="warning" />
              <ValueRow label="Sign-in kept" value="None" />
            </ValueList>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const READS: { name: string; note?: string }[] = [
  { name: 'Corporation history', note: 'Public. Every corporation you have been in' },
  { name: 'Wallet journal', note: 'Every row from the last 30 days' },
  { name: 'Contacts and standings', note: 'Every contact' },
  { name: 'Mail', note: 'Who sent and who received each mail. Never the subject or the text' },
  { name: 'Contracts', note: 'Every contract from the last 30 days' },
  { name: 'Skills', note: 'Every trained skill' },
];

/**
 * The member's "What you share" with the new truth in it: the rows are kept after Send, how long,
 * and who can open them. Same two-column shape as today's `VettingConsentTerms`.
 */
export function ProposedConsentTerms() {
  return (
    <NewComponent name="ConsentTermsKept">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xs border border-line bg-panel-2 p-3 text-sm">
          <p>
            <Pill tone="accent">Changed</Pill>{' '}
            <span className="font-semibold">When you press Send, we keep every row we read,</span>{' '}
            not only the ones that looked unusual. Officers can look through them.
          </p>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="space-y-2">
            <Eyebrow>The officers reviewing you will see</Eyebrow>
            <ul className="space-y-1.5">
              {READS.map((read) => (
                <li key={read.name}>
                  {read.name}
                  <span className="block text-xs text-text-dim">{read.note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Eyebrow>Kept after you press Send</Eyebrow>
              <ul className="space-y-1.5">
                <li>Every row listed here, kept with your report</li>
                <li>
                  Deleted {VETTING_KEEP_DAYS} days after the decision, or {VETTING_OPEN_KEEP_DAYS}{' '}
                  days after you share if nobody decides, or when you delete it
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <Eyebrow>You stay in control</Eyebrow>
              <ul className="space-y-1.5">
                <li>Only officers (CEO, Director, Personnel Manager) can open it</li>
                <li>You see who opened it, and when</li>
                <li>You can delete it at any time</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Eyebrow>Not read, not kept</Eyebrow>
              <ul className="space-y-1.5">
                <li>The subject or text of your mail</li>
                <li>
                  Your EVE login
                  <span className="block text-xs text-text-dim">
                    No key is kept. Nothing is read again
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </NewComponent>
  );
}

/** The member's /vetting consent step with Share and Decline under the terms. */
export function ProposedMemberConsent() {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <h1 className="text-xl font-semibold">Review for Accountant</h1>
      <p className="text-sm text-text-dim">
        Kestrel Vane asked for this before a promotion in Brass Meridian Logistics. Other officers
        decide it, not Kestrel.
      </p>
      <Panel title="What you share">
        <ProposedConsentTerms />
      </Panel>
      <div className="flex flex-wrap gap-2 [&>button]:w-full sm:[&>button]:w-auto">
        <Button variant="primary">Share my characters</Button>
        <Button>Decline</Button>
      </div>
    </div>
  );
}
