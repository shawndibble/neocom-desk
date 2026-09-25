/**
 * The board's top line: the next thing with a clock on it, what is training,
 * and the wallet.
 *
 * "Next deadline" leads, at the largest type on the page, because it is the
 * one question this board is asked every single time it opens. It is a real
 * deadline drawn from the cards below it — the soonest colony batch, industry
 * job or skill completion — not a fourth number with its own idea of urgency.
 *
 * There is deliberately no ISK-owed cell. An earlier draft had one and it
 * printed the same figure as the Mining Tax card's own tile two panels away;
 * one number in two places is a number you end up checking against itself.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { DataAgeBadge, IconButton, SEVERITY_TEXT, SeverityIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { DeadlineSeverity } from '@/engine/severity';
import { cx } from '@/lib/cx';

export interface SummaryStripProps {
  deadline: { label: string; note: string; severity: DeadlineSeverity; to: string } | null;
  training: { label: string; note: string; to: string } | null;
  wallet: { label: string; to: string } | null;
  /**
   * The queue scope has lapsed, so "nothing in training" is not something this
   * strip actually knows. Distinguishing the two is the whole reason these are
   * separate props rather than a null value: an unreadable cell that reads as
   * an idle one is the silence this board was rebuilt to remove.
   */
  trainingUnavailable: boolean;
  /**
   * Whether this Character would actually raise the `characterNotTraining`
   * alert — false only when that alert is muted in its feed channel for this
   * Character (its one existing per-pilot opt-out, e.g. a deliberately
   * parked alt). An idle queue otherwise gets the same warning treatment the
   * alert itself uses, so the board and the alert feed never disagree about
   * how urgent this is (issue #1731).
   */
  notTrainingAlertEnabled: boolean;
  walletUnavailable: boolean;
  /** The board's own read threw. Rarer than a lapsed grant and not fixable by logging in, so it says something different. */
  failed: boolean;
  /** Stalest of the board's own reads: every countdown above is only as fresh as this. */
  fetchedAt: Date | null;
  onRefresh: () => void;
  refreshing: boolean;
}

export function SummaryStrip({
  deadline,
  training,
  wallet,
  trainingUnavailable,
  notTrainingAlertEnabled,
  walletUnavailable,
  failed,
  fetchedAt,
  onRefresh,
  refreshing,
}: SummaryStripProps) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:gap-x-8">
        <Cell label={t('overview.board.nextDeadline')}>
          {deadline === null ? (
            <Value muted>{t('overview.board.noDeadline')}</Value>
          ) : (
            <Link to={deadline.to} className="min-w-0 hover:underline">
              <Value className={`text-3xl ${SEVERITY_TEXT[deadline.severity]}`}>
                {deadline.label}
              </Value>
              <Note>{deadline.note}</Note>
            </Link>
          )}
        </Cell>

        <Cell label={t('overview.board.trainingNow')}>
          {trainingUnavailable ? (
            <WarningLine>{t('overview.board.trainingUnavailable')}</WarningLine>
          ) : training === null ? (
            notTrainingAlertEnabled ? (
              <WarningLine to="/skills/plans">{t('overview.board.notTraining')}</WarningLine>
            ) : (
              <Value muted>{t('overview.board.notTraining')}</Value>
            )
          ) : (
            <Link to={training.to} className="min-w-0 hover:underline">
              <Value>{training.label}</Value>
              <Note>{training.note}</Note>
            </Link>
          )}
        </Cell>

        <Cell label={t('overview.wallet')}>
          {walletUnavailable ? (
            <WarningLine>{t('overview.board.walletUnavailable')}</WarningLine>
          ) : failed ? (
            <WarningLine>{t('common.loadFailedTitle')}</WarningLine>
          ) : wallet === null ? (
            <Value muted>—</Value>
          ) : (
            <Link to={wallet.to} className="min-w-0 hover:underline">
              <Value className="text-isk-pos">{wallet.label}</Value>
            </Link>
          )}
        </Cell>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {fetchedAt && <DataAgeBadge date={fetchedAt} />}
          <IconButton
            size="sm"
            icon={<Icon.Refresh />}
            label={t('overview.board.refresh')}
            onClick={onRefresh}
            disabled={refreshing}
          />
        </span>
      </div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    // The basis is what makes the row wrap rather than crush: `flex-1` with
    // `min-w-0` alone lets a cell shrink below its own content, which at phone
    // width overlapped the three labels and clipped each value to a character.
    // A floor means a cell drops to its own line instead.
    //
    // It is `basis-32` under `sm`, not `basis-40`, because a phone hands this
    // strip about 334px: 390px of viewport less the shell's `p-4` and the
    // panel's own `p-3`. Two 160px cells and a 32px gap need 352px, so every
    // cell used to take a line of its own with 174px of it empty. 128px cells
    // and a 16px gap need 272px, which fits the deadline and what is training
    // side by side — the two the board is opened to read — at 360px, the
    // common Android width, as well as at 375 and 390.
    //
    // 144px cells were tried first and are the wrong floor by a hair: they
    // need 304px against the 304px a 360px viewport has, so that width lands
    // exactly on the boundary and renders stacked. Below 360 the strip goes
    // back to a cell per line, which is the old behaviour and still readable.
    //
    // This is a wrap floor, not a width. Both cells still `flex-1`, so at 390
    // they take about 159px each and only a long skill name truncates.
    //
    // From `sm` the floor is each cell's own content instead (`basis-auto`):
    // there the three values need nearly the whole row (about 600px from
    // `sm` with no sidebar, about 775px at 1024 with one), and a fixed 160px
    // floor let one shrink a pixel under its text and truncate — the wallet's
    // ten-figure balance, in a font a hair wider than this one. Sized to
    // content, a value that doesn't fit wraps to the next line whole. The
    // cost is a strip whose line count follows the text: a long skill name
    // pushes the wallet down rather than cutting the name short.
    <span className="flex min-w-0 flex-1 basis-32 flex-col gap-0.5 sm:basis-auto">
      <span className="text-[0.6875rem] tracking-widest text-text-dim uppercase">{label}</span>
      {children}
    </span>
  );
}

function Value({
  children,
  className = '',
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cx(
        'block text-xl font-medium tabular-nums',
        // A muted value is a fixed empty-state sentence ("Nothing on a clock"),
        // not a long name, so on a phone it wraps rather than clipping.
        muted ? 'text-text-dim md:truncate' : 'truncate',
        className
      )}
    >
      {children}
    </span>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <span className="block truncate text-[0.6875rem] text-text-dim">{children}</span>;
}

/**
 * A cell that could not be read, or a known state worth the same alarm (an
 * idle queue, which already has its own `characterNotTraining` alert — issue
 * #1731). Toned `warning` rather than dimmed either way: both are the single
 * thing on this strip the reader can act on immediately. `SeverityIcon`
 * carries the shape so the tone is never the only signal (DESIGN.md §7). A
 * `to` makes it a link, for the idle case's "go fix this" destination.
 */
function WarningLine({ to, children }: { to?: string; children: ReactNode }) {
  const className = `flex min-w-0 items-center gap-1.5 text-base font-medium text-warning${to ? ' hover:underline' : ''}`;
  const content = (
    <>
      <SeverityIcon severity="warning" />
      <span className="truncate">{children}</span>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}
