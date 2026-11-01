import { useTranslation } from 'react-i18next';
import { Pill } from '@/components/ui/Pill';
import { Button, Panel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { canPayMoonOwner, type MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { focusRingClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { MoonOwnerStatusPill } from './MoonOwnerStatusPill';
import { isk, shortDate } from './moonsFormat';

const k = (key: string) => `corpTaxBook.moons.moonOwners.${key}`;

/**
 * The Moon owners list on a phone: one row per corporation, "Stacked". The name
 * gets the whole row width, then the state and one muted note, then the amount
 * owed on the left and Pay on the right, so a long name and an eleven-digit amount
 * never fight for the same line. Mined and the rates live on the page the row
 * opens. The row opens that page; Pay does not.
 */
export function MoonOwnerCards({
  rows,
  name,
  now,
  onOpen,
  onPay,
}: {
  rows: readonly MoonOwnerRow[];
  name: (corporationId: number) => string;
  /** Epoch ms the ages are read at. */
  now: number;
  onOpen: (row: MoonOwnerRow) => void;
  onPay?: (row: MoonOwnerRow) => void;
}) {
  const { t } = useTranslation();
  const note = (r: MoonOwnerRow) =>
    r.status === 'cant-read' && r.staleSince !== undefined
      ? t(k('cantReadSince'), { date: shortDate(new Date(r.staleSince).toISOString()) })
      : r.sameOwner
        ? t(k('yoursNote'))
        : r.lastReadWellAt !== undefined
          ? t(k('synced'), { age: formatAge(now - Date.parse(r.lastReadWellAt), t) })
          : '';
  return (
    <Panel padded={false} title={t(k('label'))} meta={t(k('summary'), { shown: rows.length })}>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li
            key={r.id}
            className={cx(
              'flex cursor-pointer items-center gap-3 px-3 py-3',
              rowInteractiveClassName
            )}
            onClick={() => onOpen(r)}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  className={cx(
                    'min-w-0 rounded-xs text-left text-sm font-semibold text-accent',
                    focusRingClassName
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(r);
                  }}
                >
                  {name(r.corporationId)}
                </button>
                {r.sameOwner && <Pill tone="accent">{t(k('yours'))}</Pill>}
                {r.status !== 'active' && <MoonOwnerStatusPill status={r.status} />}
              </p>
              <p className="text-xs text-text-dim">
                {t(k('refineries'), { count: r.refineryCount })}
                {note(r) ? ` · ${note(r)}` : ''}
              </p>
              <OwedLine r={r} name={name} onPay={onPay} />
            </div>
            <Icon.GoTo
              size={Icon.ICON_SIZE.sm}
              aria-hidden="true"
              className="shrink-0 text-text-dim"
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function OwedLine({
  r,
  name,
  onPay,
}: {
  r: MoonOwnerRow;
  name: (corporationId: number) => string;
  onPay: ((row: MoonOwnerRow) => void) | undefined;
}) {
  const { t } = useTranslation();
  if (r.mode === 'settled-otherwise')
    return <p className="pt-1 text-xs text-text-dim">{t(k('settled'))}</p>;
  if (r.theirRatePct === undefined)
    return <p className="pt-1 text-xs text-text-dim">{t(k('nothingDue'))}</p>;
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="min-w-0">
        <span className="block text-[0.6875rem] uppercase tracking-widest text-text-dim">
          {t(k('cols.owed'))}
        </span>
        <span className="block text-base font-semibold tabular-nums">{isk(r.owed)}</span>
      </p>
      {onPay && canPayMoonOwner(r) && (
        <Button
          size="sm"
          aria-label={t(k('payNamed'), { name: name(r.corporationId) })}
          onClick={(e) => {
            e.stopPropagation();
            onPay(r);
          }}
        >
          {t(k('payAction'))}
        </Button>
      )}
    </div>
  );
}
