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
import { DataAgeBadge, IconButton, SEVERITY_TONE } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BoardSeverity } from '@/engine/severity';
import { cx } from '@/lib/cx';

export interface SummaryStripProps {
  deadline: { label: string; note: string; severity: BoardSeverity; to: string } | null;
  training: { label: string; note: string; to: string } | null;
  wallet: { label: string; to: string } | null;
  /** Stalest of the board's own reads: every countdown above is only as fresh as this. */
  fetchedAt: Date | null;
  onRefresh: () => void;
  refreshing: boolean;
}

export function SummaryStrip({
  deadline,
  training,
  wallet,
  fetchedAt,
  onRefresh,
  refreshing,
}: SummaryStripProps) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-3">
        <Cell label={t('overview.board.nextDeadline')} grow>
          {deadline === null ? (
            <Value muted>{t('overview.board.noDeadline')}</Value>
          ) : (
            <Link to={deadline.to} className="min-w-0 hover:underline">
              <Value className={`text-2xl ${SEVERITY_TONE[deadline.severity]}`}>
                {deadline.label}
              </Value>
              <Note>{deadline.note}</Note>
            </Link>
          )}
        </Cell>

        <Cell label={t('overview.board.trainingNow')} grow>
          {training === null ? (
            <Value muted>{t('overview.board.notTraining')}</Value>
          ) : (
            <Link to={training.to} className="min-w-0 hover:underline">
              <Value>{training.label}</Value>
              <Note>{training.note}</Note>
            </Link>
          )}
        </Cell>

        <Cell label={t('overview.wallet')} grow>
          {wallet === null ? (
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

function Cell({
  label,
  children,
  grow = false,
}: {
  label: string;
  children: ReactNode;
  grow?: boolean;
}) {
  return (
    // `basis-40` is what makes the row wrap rather than crush: `flex-1` with
    // `min-w-0` alone lets a cell shrink below its own content, which at phone
    // width overlapped the three labels and clipped each value to a character.
    // A floor means the third cell drops to its own line instead.
    <span className={cx('flex min-w-0 basis-40 flex-col gap-0.5', grow && 'flex-1')}>
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
