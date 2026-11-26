import type { ReactNode } from 'react';
import { Button, Panel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { cx } from '@/lib/cx';
import type { PhoneAttention, PhoneOwner } from './moonsAddCorpsPhoneFixtures';

function StatusPill({ status }: { status: PhoneOwner['status'] }) {
  return status === 'active' ? (
    <Pill tone="success">Active</Pill>
  ) : (
    <Pill tone="warning">Can’t read</Pill>
  );
}

const Chevron = () => (
  <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0 text-text-dim" />
);

export function OwnersFiguresFirst({ owners }: { owners: PhoneOwner[] }) {
  return (
    <ul className="divide-y divide-line">
      {owners.map((o) => (
        <li key={o.name} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-accent">{o.name}</span>
              {o.yours && <Pill tone="accent">Yours</Pill>}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-dim">
              {o.status === 'cant-read' && <StatusPill status={o.status} />}
              <span>{o.yours ? 'No owner rate · no payouts' : o.note}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {o.owed ? (
              <>
                <span className="text-sm font-semibold tabular-nums">{o.owed}</span>
                <span className="text-[0.6875rem] uppercase tracking-widest text-text-dim">
                  owed
                </span>
                <Button size="sm">Pay</Button>
              </>
            ) : (
              <span className="text-xs text-text-dim">Settled</span>
            )}
          </div>
          <Chevron />
        </li>
      ))}
    </ul>
  );
}

export function OwnersFigureGrid({ owners }: { owners: PhoneOwner[] }) {
  return (
    <ul className="divide-y divide-line">
      {owners.map((o) => (
        <li key={o.name} className="space-y-2 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-accent">{o.name}</span>
              {o.yours && <Pill tone="accent">Yours</Pill>}
              {o.status === 'cant-read' && <StatusPill status={o.status} />}
            </p>
            {o.owed ? <Button size="sm">Pay</Button> : <Chevron />}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <Fig label="Owed" value={o.owed ?? '—'} strong={Boolean(o.owed)} />
            <Fig label="Mined" value={o.mined} />
            <Fig
              label="Rates"
              value={o.theirRate ? `${o.theirRate} · ${o.minerRate}` : o.minerRate}
            />
          </dl>
          <p className="text-xs text-text-dim">
            {o.refineries} refiner{o.refineries === 1 ? 'y' : 'ies'} ·{' '}
            {o.yours ? 'no owner rate · no payouts' : o.note}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Fig({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] uppercase tracking-widest text-text-dim">{label}</dt>
      <dd className={cx('tabular-nums', strong && 'text-sm font-semibold')}>{value}</dd>
    </div>
  );
}

export function AttentionActionRight({ items }: { items: PhoneAttention[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.name} className="space-y-1 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{a.name}</span>
            {a.action && (
              <Button size="sm" variant={a.danger ? 'danger' : 'ghost'}>
                {a.action}
              </Button>
            )}
          </div>
          <div>{a.pill}</div>
          <p className="text-xs text-text-dim">{a.hint}</p>
          {a.note && <p className="text-xs text-text-dim">{a.note}</p>}
        </li>
      ))}
    </ul>
  );
}

export function AttentionLeftRule({ items }: { items: PhoneAttention[] }) {
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li
          key={a.name}
          className={cx('space-y-1 border-l-2 pl-3', a.danger ? 'border-danger' : 'border-warning')}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{a.name}</span>
            {a.pill}
          </div>
          <p className="text-xs text-text-dim">{a.hint}</p>
          {a.note && <p className="text-xs text-text-dim">{a.note}</p>}
          {a.action && (
            <div className="flex justify-end">
              <Button size="sm" variant={a.danger ? 'danger' : 'ghost'}>
                {a.action}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PhonePanel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <Panel title={title} meta={meta}>
      {children}
    </Panel>
  );
}

export function OwnersStacked({ owners }: { owners: PhoneOwner[] }) {
  return (
    <ul className="divide-y divide-line">
      {owners.map((o) => (
        <li key={o.name} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-accent">{o.name}</span>
              {o.yours && <Pill tone="accent">Yours</Pill>}
              {o.status === 'cant-read' && <StatusPill status={o.status} />}
            </p>
            <p className="text-xs text-text-dim">
              {o.yours ? 'No owner rate · no payouts' : o.note}
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
              {o.owed ? (
                <>
                  <p className="min-w-0">
                    <span className="block text-[0.6875rem] uppercase tracking-widest text-text-dim">
                      Owed
                    </span>
                    <span className="block text-base font-semibold tabular-nums">{o.owed}</span>
                  </p>
                  <Button size="sm">Pay</Button>
                </>
              ) : (
                <span className="text-xs text-text-dim">Settled</span>
              )}
            </div>
          </div>
          <Chevron />
        </li>
      ))}
    </ul>
  );
}
