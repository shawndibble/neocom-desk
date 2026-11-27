import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { DividedList } from '@/components/ui/DividedList';
import { Pill } from '@/components/ui/Pill';
import { Eyebrow } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatIskCompactSigned } from '@/lib/isk';
import { iskTone } from '@/lib/signedIsk';
import { groupByMonth, type Interaction } from '@/engine/interactions/interactions';

const rowClassName = cx(
  'grid grid-cols-[3rem_auto_1fr] items-start gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm',
  rowInteractiveClassName,
  'sm:grid-cols-[3rem_7.5rem_1fr_auto]',
  focusRingInsetClassName
);

function IskFigure({ value }: { value: number }) {
  return (
    <span className={cx('tabular-nums', iskTone(value, 0))}>
      {formatIskCompactSigned(value)} ISK
    </span>
  );
}

function RowBody({ row }: { row: Interaction }) {
  const { t, i18n } = useTranslation();
  const day = new Intl.DateTimeFormat(i18n.language, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(row.at);
  return (
    <>
      <span className="pt-0.5 text-xs tabular-nums text-text-dim">{day}</span>
      <span className="justify-self-start">
        <Pill tone={row.tone}>{t(row.type)}</Pill>
      </span>
      <div className="col-span-3 col-start-1 row-start-2 min-w-0 pl-[3.75rem] sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:pl-0">
        <div className="truncate">{row.title}</div>
        {row.state && (
          <span className="mt-0.5 inline-flex sm:hidden">
            <Pill tone={row.stateTone ?? 'neutral'}>{t(row.state)}</Pill>
          </span>
        )}
        {row.detail && <div className="truncate text-xs text-text-dim">{row.detail}</div>}
      </div>
      <div className="col-start-3 row-start-1 flex items-center justify-end gap-2 sm:col-start-4">
        {row.state && (
          <span className="hidden sm:inline-flex">
            <Pill tone={row.stateTone ?? 'neutral'}>{t(row.state)}</Pill>
          </span>
        )}
        {row.isk !== undefined && row.isk !== 0 && (
          <span className="text-right sm:min-w-[6.5rem]">
            <IskFigure value={row.isk} />
          </span>
        )}
      </div>
    </>
  );
}

function InteractionRow({ row }: { row: Interaction }) {
  if (/^https:\/\//.test(row.to)) {
    return (
      <li>
        <ExternalLink href={row.to} variant="bare" mark="text" className={rowClassName}>
          <RowBody row={row} />
        </ExternalLink>
      </li>
    );
  }
  return (
    <li>
      <Link to={row.to} className={rowClassName}>
        <RowBody row={row} />
      </Link>
    </li>
  );
}

export function InteractionsList({
  rows,
  showNet,
}: {
  rows: readonly Interaction[];
  showNet: boolean;
}) {
  const { t, i18n } = useTranslation();
  const monthFormat = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <div className="space-y-3">
      {groupByMonth(rows).map((group) => (
        <section key={group.month} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <Eyebrow as="h3">
              {monthFormat.format(Date.parse(`${group.month}-01T12:00:00Z`))}
            </Eyebrow>
            <span className="text-xs text-text-dim">
              {t('interactions.items', { count: group.items.length })}
              {showNet && group.net !== 0 && (
                <>
                  {` · ${t('interactions.net')} `}
                  <IskFigure value={group.net} />
                </>
              )}
            </span>
          </div>
          <DividedList as="ul">
            {group.items.map((row) => (
              <InteractionRow key={row.id} row={row} />
            ))}
          </DividedList>
        </section>
      ))}
    </div>
  );
}
