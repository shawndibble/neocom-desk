import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenuItem,
  HeaderMoreMenu,
  SEVERITY_TEXT,
  SeverityIcon,
  Tooltip,
  buttonClassName,
  CachedNotice,
} from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { DataAgePopover } from './DataAgePopover';
import { useOverviewRefresh } from './widgets/data/refreshContext';
import { useOverviewEdit } from './widgets/editContext';
import type { ChipTone } from './widgets/nextDeadline';
import type { OverviewSummary } from './useOverviewSummary';

const CHIP_TEXT: Record<ChipTone, string> = {
  neutral: 'text-text',
  warning: SEVERITY_TEXT.warning,
  danger: SEVERITY_TEXT.critical,
};

export function OverviewDataAge({ summary, note }: { summary: OverviewSummary; note?: string }) {
  const { fetchedAt, breakdown, now } = summary;
  const { refresh } = useOverviewRefresh();
  if (!fetchedAt) return null;
  return (
    <DataAgePopover
      fetchedAt={fetchedAt}
      breakdown={breakdown}
      now={now}
      onRefresh={refresh}
      note={note}
    />
  );
}

export function OverviewCachedNotice({ summary }: { summary: OverviewSummary }) {
  const { fetchedAt, fromCache } = summary;
  if (!fromCache) return null;
  return <CachedNotice fetchedAt={fetchedAt} />;
}

export function OverviewNext({ summary }: { summary: OverviewSummary }) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const { next, remaining, tone } = summary;
  if (!next) return null;
  const countdown = (
    <>
      {tone !== 'neutral' && <SeverityIcon severity={tone === 'danger' ? 'critical' : 'warning'} />}
      <b className={cx('font-semibold tabular-nums', CHIP_TEXT[tone])}>
        {formatCountdown(remaining / 1000)}
      </b>
    </>
  );
  if (narrow) {
    const row = (
      <>
        {countdown}
        <span className="min-w-0 truncate text-text-dim">{next.note}</span>
      </>
    );
    return next.to === undefined ? (
      <span className="flex min-w-0 items-center gap-2 border-t border-line pt-1 text-sm whitespace-nowrap">
        {row}
      </span>
    ) : (
      <Link
        to={next.to}
        className={cx(
          'flex min-w-0 items-center gap-2 border-t border-line pt-1 text-sm whitespace-nowrap',
          tappableRowClassName,
          interactiveClassName,
          focusRingClassName
        )}
      >
        {row}
        <Icon.GoTo aria-hidden="true" className="ml-auto shrink-0 text-text-dim" />
      </Link>
    );
  }
  const content = (
    <>
      <span className="text-text-dim">{t('overview.header.next')}</span>
      {countdown}
      <span className="min-w-0 truncate text-text-dim normal-case md:max-w-40 xl:max-w-80">
        {next.note}
      </span>
    </>
  );
  return (
    <div className="min-w-0">
      {next.to === undefined ? (
        <span className="flex min-w-0 items-center gap-2 text-sm whitespace-nowrap">{content}</span>
      ) : (
        <Tooltip content={t('overview.header.nextGoTo', { note: next.note })}>
          <Link
            to={next.to}
            className={buttonClassName({ size: 'md', className: 'min-w-0 whitespace-nowrap' })}
          >
            {content}
          </Link>
        </Tooltip>
      )}
    </div>
  );
}

export function OverviewCustomize() {
  const { t } = useTranslation();
  const { editing, startEditing } = useOverviewEdit();
  if (editing) return null;
  return (
    <Button className="w-9 shrink-0 max-md:px-0 md:w-auto" onClick={startEditing}>
      <Icon.EditBoard size={Icon.ICON_SIZE.md} aria-hidden="true" />
      <span className="sr-only md:not-sr-only">{t('overview.header.customize')}</span>
    </Button>
  );
}

export function OverviewMoreMenu({ summary }: { summary: OverviewSummary }) {
  const { t } = useTranslation();
  const { editing, startEditing } = useOverviewEdit();
  const { refresh } = useOverviewRefresh();
  const { fetchedAt, now } = summary;
  if (editing || !fetchedAt) return <OverviewCustomize />;
  return (
    <HeaderMoreMenu>
      <DropdownMenuItem onSelect={startEditing}>
        <Icon.EditBoard aria-hidden="true" />
        {t('overview.header.customize')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={refresh}>
        <Icon.Refresh aria-hidden="true" />
        {t('overview.header.refreshAll')}
        <span className="ml-auto pl-3 text-xs text-text-dim">
          {formatAge(Math.max(0, now - fetchedAt.getTime()), t)}
        </span>
      </DropdownMenuItem>
    </HeaderMoreMenu>
  );
}
