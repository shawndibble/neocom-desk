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
import { DataAgeBadge, IconButton, SEVERITY_STYLE, SeverityIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BoardSeverity } from '@/engine/severity';
import { cx } from '@/lib/cx';

export interface SummaryStripProps {
  deadline: { label: string; note: string; severity: BoardSeverity; to: string } | null;
  training: { label: string; note: string; to: string } | null;
  wallet: { label: string; to: string } | null;
  /**
   * The queue scope has lapsed, so "nothing in training" is not something this
   * strip actually knows. Distinguishing the two is the whole reason these are
   * separate props rather than a null value: an unreadable cell that reads as
   * an idle one is the silence this board was rebuilt to remove.
   */
  trainingUnavailable: boolean;
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
  walletUnavailable,
  failed,
  fetchedAt,
  onRefresh,
  refreshing,
}: SummaryStripProps) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-3">
        <Cell label={t('overview.board.nextDeadline')}>
          {deadline === null ? (
            <Value muted>{t('overview.board.noDeadline')}</Value>
          ) : (
            <Link to={deadline.to} className="min-w-0 hover:underline">
              <Value className={`text-2xl ${SEVERITY_STYLE[deadline.severity].tone}`}>
                {deadline.label}
              </Value>
              <Note>{deadline.note}</Note>
            </Link>
          )}
        </Cell>

        <Cell label={t('overview.board.trainingNow')}>
          {trainingUnavailable ? (
            <Unreadable>{t('overview.board.trainingUnavailable')}</Unreadable>
          ) : training === null ? (
            <Value muted>{t('overview.board.notTraining')}</Value>
          ) : (
            <Link to={training.to} className="min-w-0 hover:underline">
              <Value>{training.label}</Value>
              <Note>{training.note}</Note>
            </Link>
          )}
        </Cell>

        <Cell label={t('overview.wallet')}>
          {walletUnavailable ? (
            <Unreadable>{t('overview.board.walletUnavailable')}</Unreadable>
          ) : failed ? (
            <Unreadable>{t('common.loadFailedTitle')}</Unreadable>
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
    // `basis-40` is what makes the row wrap rather than crush: `flex-1` with
    // `min-w-0` alone lets a cell shrink below its own content, which at phone
    // width overlapped the three labels and clipped each value to a character.
    // A floor means the third cell drops to its own line instead.
    <span className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
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
        'block truncate text-lg font-medium tabular-nums',
        muted && 'text-text-dim',
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
 * A cell that could not be read.
 *
 * Toned `warning` rather than dimmed, because it is not a quiet answer — it is
 * the absence of one, and it is the single thing on this strip the reader can
 * act on immediately. `SeverityIcon` carries the shape so the tone is never
 * the only signal (DESIGN.md §7).
 */
function Unreadable({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-base font-medium text-warning">
      <SeverityIcon severity="warning" />
      <span className="truncate">{children}</span>
    </span>
  );
}
