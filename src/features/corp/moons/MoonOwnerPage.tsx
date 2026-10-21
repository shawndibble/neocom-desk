import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  PageHeader,
  Panel,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import { ownerMargin, type OwnerRateEntry } from '@/engine/corpTaxBook/ownerRate';
import type {
  MoonOwnerDetail,
  MoonOwnerMinedLine,
  MoonOwnerPayout,
} from '@/engine/corpTaxBook/moonOwners';
import type { Payee } from '@/engine/corpTaxBook/payouts';
import { CharacterLink, CorporationLink } from '@/features/entities/EntityLink';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { formatCount } from '@/lib/formatCount';
import { isk, shortDate } from './moonsFormat';
import { Crumb } from './moonsParts';
import { RefineryLabels, type RefineryLabelEdit } from './RefineryLabels';
import { RemovalStrip } from './RemovalStrip';
import { MoonOwnerStatusPill } from './MoonOwnersTable';

const k = (key: string) => `corpTaxBook.moons.moonOwners.page.${key}`;

/** Their rate beside the miner rate and the margin, with what they asked for. */
export function RateReadout({
  theirPct,
  minerPct,
  requestedPct,
}: {
  theirPct: number | undefined;
  minerPct: number | undefined;
  requestedPct: number | undefined;
}) {
  const { t } = useTranslation();
  const margin = ownerMargin(minerPct, theirPct);
  const showAsked = requestedPct !== undefined;
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <div>
        <dt className="text-xs text-text-dim">{t(k('theirRate'))}</dt>
        <dd className="text-xl font-semibold tabular-nums">
          {theirPct === undefined ? t(k('notSet')) : `${theirPct}%`}
        </dd>
        <dd className="text-xs text-warning">
          {theirPct === undefined
            ? t(k('noRate'))
            : showAsked && requestedPct !== theirPct
              ? t(k('asked'), { pct: requestedPct })
              : showAsked
                ? t(k('askedSame'), { pct: requestedPct })
                : null}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-text-dim">{t(k('minerRate'))}</dt>
        <dd className="text-xl font-semibold tabular-nums">
          {minerPct === undefined ? '—' : `${minerPct}%`}
        </dd>
        <dd className="text-xs text-text-dim">{t(k('minerHint'))}</dd>
      </div>
      <div>
        <dt className="text-xs text-text-dim">{t(k('margin'))}</dt>
        <dd className="text-xl font-semibold tabular-nums">
          {margin === undefined ? '—' : `${margin}%`}
        </dd>
        <dd className="text-xs text-text-dim">{t(k('marginHint'))}</dd>
      </div>
    </dl>
  );
}

function HistoryLines({
  history,
  offeredPct,
  joinedAt,
  ownerName,
  accountingName,
}: {
  accountingName?: string;
  history: readonly OwnerRateEntry[];
  offeredPct: number | undefined;
  joinedAt: number;
  ownerName: string;
}) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1 text-xs text-text-dim">
      {history.map((h) => (
        <li key={`${h.kind}:${h.recordedAt}`}>
          {shortDate(h.effectiveFrom)} ·{' '}
          {h.kind === 'agreed'
            ? accountingName
              ? t(k('history.agreedBy'), { pct: h.pct, by: accountingName })
              : t(k('history.agreed'), { pct: h.pct })
            : t(k('history.requested'), { name: ownerName, pct: h.pct })}
        </li>
      ))}
      {offeredPct !== undefined && (
        <li>
          {shortDate(new Date(joinedAt).toISOString())} ·{' '}
          {t(k('history.joined'), { pct: offeredPct })}
        </li>
      )}
    </ul>
  );
}

/**
 * One moon owner's page: their rate beside the miner rate and margin, rate
 * history, payments, what was mined at their refineries. Set rate… and
 * Settled otherwise… are the officer's; the callers add Pay… and removal.
 */
export function MoonOwnerPage({
  detail,
  name,
  accountingName,
  characterName,
  refineryName,
  refineryEdit,
  oreName,
  backTo,
  payee,
  onSetRate,
  onSettledOtherwise,
  onRemove,
  onCancelRemoval,
  onNoticeSent,
  onPay,
  onAddPayment,
  onMarkPayout,
  onChangePayee,
  payeeNotice,
}: {
  detail: MoonOwnerDetail;
  name: string;
  /** The accounting corporation's own name: who set an agreed rate. */
  accountingName?: string;
  characterName: (id: number) => string;
  refineryName: (id: number) => string;
  /** Label their refineries for both sides; absent for a viewer who may not edit. */
  refineryEdit?: RefineryLabelEdit;
  oreName: (typeId: number) => string;
  backTo: string;
  /** Who the moon owner is paid as. Either side sets it (#4653). */
  payee?: Payee & { name: string };
  /** Change… on the "Paid to" line; absent for a viewer who may not edit. */
  onChangePayee?: () => void;
  /** The strip when the moon owner changed it (#4653). */
  payeeNotice?: ReactNode;
  /** Absent for a viewer who may not edit. */
  onSetRate?: () => void;
  onSettledOtherwise?: () => void;
  /** Start a removal; absent for a viewer who may not edit. */
  onRemove?: () => void;
  /** Cancel a pending removal (any Accountant or higher, the starter included). */
  onCancelRemoval?: () => Promise<void>;
  /** The officer sent the notice from EVE: starts the 24 hours. */
  onNoticeSent?: () => Promise<void>;
  /** Pay… the balance: absent when nothing is owed or the viewer may not record payments. */
  onPay?: () => void;
  /** Add a payment by hand. */
  onAddPayment?: () => void;
  /** Mark a payment "not a payout" (or count it again). */
  onMarkPayout?: (payoutId: string, notAPayout: boolean) => void;
}) {
  const { t } = useTranslation();
  const { row } = detail;
  const payouts = detail.payouts;

  const payoutColumns: DataTableColumn<MoonOwnerPayout>[] = [
    {
      id: 'date',
      header: t(k('payouts.date')),
      primary: true,
      render: (p) => shortDate(p.date),
      sortValue: (p) => p.date,
    },
    {
      id: 'amount',
      header: t(k('payouts.amount')),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (p) => isk(p.amount),
      sortValue: (p) => p.amount,
    },
    {
      id: 'how',
      header: t(k('payouts.how')),
      render: (p) => t(k(`payouts.method.${p.method}`)),
    },
    {
      id: 'status',
      header: t(k('payouts.status')),
      render: (p) =>
        t(k(p.notAPayout ? 'payouts.state.not-a-payout' : `payouts.state.${p.status}`)),
    },
    ...(onMarkPayout
      ? [
          {
            id: 'mark',
            header: '',
            align: 'right' as const,
            stackEdge: 'end' as const,
            cellClassName: () => 'dt-action-row',
            render: (p: MoonOwnerPayout) => (
              <Button size="sm" variant="ghost" onClick={() => onMarkPayout(p.id, !p.notAPayout)}>
                {t(k(p.notAPayout ? 'payouts.countIt' : 'payouts.notAPayout'))}
              </Button>
            ),
          },
        ]
      : []),
  ];
  const minedKey = (m: MoonOwnerMinedLine) => `${m.characterId}:${m.structureId}`;
  const minedColumns: DataTableColumn<MoonOwnerMinedLine>[] = [
    {
      id: 'character',
      header: t(k('cols.character')),
      primary: true,
      render: (m) => characterName(m.characterId),
      sortValue: (m) => characterName(m.characterId),
    },
    {
      id: 'refinery',
      header: t(k('cols.refinery')),
      render: (m) => refineryName(m.structureId),
      sortValue: (m) => refineryName(m.structureId),
    },
    {
      id: 'ore',
      header: t(k('cols.ore')),
      render: (m) => m.oreTypeIds.map(oreName).join(', '),
    },
    {
      id: 'quantity',
      header: t(k('cols.quantity')),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => formatCount(m.quantity),
      sortValue: (m) => m.quantity,
    },
    {
      id: 'value',
      header: t(k('cols.value')),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => isk(m.value),
      sortValue: (m) => m.value,
    },
  ];
  const canRemove = onRemove !== undefined && row.status === 'active';

  return (
    <div className="space-y-4">
      <Crumb to={backTo} label={t('corpTaxBook.moons.tabs.moonOwners')} />
      <PageHeader
        title={name}
        meta={<MoonOwnerStatusPill status={row.status} />}
        actions={
          onPay || onSetRate ? (
            <>
              {onPay && (
                <Button size="sm" onClick={onPay}>
                  {t(k('pay'))}
                </Button>
              )}
              {onSetRate && (
                <Button size="sm" onClick={onSetRate}>
                  {t(k('setRate'))}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <StatChips>
        <StatChip
          label={t(k('owed'))}
          value={row.mode === 'settled-otherwise' ? '—' : isk(row.owed)}
          emphasis
        />
        <StatChip label={t(k('accrued'))} value={isk(detail.accrued)} />
        <StatChip label={t(k('paid'))} value={isk(detail.paid)} />
        <StatChip
          label={t(k('mined'))}
          value={
            row.since
              ? `${isk(row.mined)} ${t('corpTaxBook.moons.moonOwners.since', { date: shortDate(row.since) })}`
              : isk(row.mined)
          }
        />
      </StatChips>
      {payee && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-text-dim">{t(k('paidTo'))}</span>
          {payee.kind === 'character' ? (
            <CharacterLink id={payee.id}>{payee.name}</CharacterLink>
          ) : (
            <CorporationLink id={payee.id}>{payee.name}</CorporationLink>
          )}
          <OpenInEveButton kind="information" id={payee.id} name={payee.name} />
          {onChangePayee && (
            <Button
              size="sm"
              aria-label={t('corpTaxBook.moons.ownerView.payee.changeLabel')}
              onClick={onChangePayee}
            >
              {t('corpTaxBook.moons.ownerView.payee.change')}
            </Button>
          )}
        </div>
      )}
      {payeeNotice}
      {row.status === 'cant-read' && row.staleSince !== undefined && (
        <p role="note" className="text-sm text-warning">
          {t(k('stale'), { date: shortDate(new Date(row.staleSince).toISOString()) })}
        </p>
      )}
      {row.status === 'removal-pending' && detail.removal && (
        <RemovalStrip
          removal={detail.removal}
          onCancel={onCancelRemoval}
          onNoticeSent={onNoticeSent}
        />
      )}
      {row.status === 'disconnected' && (
        <p role="note" className="text-sm text-danger">
          {t(k('disconnected'))}
        </p>
      )}
      {row.mode === 'settled-otherwise' && (
        <Panel>
          <p className="text-sm">{t(k('settledNote'))}</p>
          {detail.note && <p className="mt-1 text-sm text-text-dim">{detail.note}</p>}
        </Panel>
      )}
      <Panel title={t(k('rates'))}>
        <div className="space-y-3">
          <RateReadout
            theirPct={row.theirRatePct}
            minerPct={row.minerRatePct}
            requestedPct={detail.requestedRatePct}
          />
          <HistoryLines
            history={detail.history}
            offeredPct={detail.offeredOwnerRatePct}
            joinedAt={detail.joinedAt}
            ownerName={name}
            accountingName={accountingName}
          />
        </div>
      </Panel>
      <Panel
        title={t(k('payouts.title'))}
        padded={false}
        {...(onAddPayment
          ? {
              actions: (
                <Button size="sm" variant="ghost" onClick={onAddPayment}>
                  {t(k('payouts.add'))}
                </Button>
              ),
            }
          : {})}
      >
        {payouts.length === 0 ? (
          <p className="p-3 text-sm text-text-dim">{t(k('payouts.none'))}</p>
        ) : (
          <DataTable
            label={t(k('payouts.title'))}
            columns={payoutColumns}
            rows={payouts}
            rowKey={(p) => p.id}
            defaultSort={{ columnId: 'date', direction: 'desc' }}
            mobileSort
          />
        )}
      </Panel>
      <Panel title={t(k('minedTitle'))} padded={false}>
        {detail.mined.length === 0 ? (
          <p className="p-3 text-sm text-text-dim">{t(k('minedNone'))}</p>
        ) : (
          <DataTable
            label={t(k('minedTitle'))}
            columns={minedColumns}
            rows={detail.mined}
            rowKey={minedKey}
            defaultSort={{ columnId: 'value', direction: 'desc' }}
            mobileSort
          />
        )}
      </Panel>
      <RefineryLabels
        structureIds={[...new Set(detail.mined.map((m) => m.structureId))]}
        name={refineryName}
        {...(refineryEdit && row.status !== 'left' && row.status !== 'removed'
          ? { edit: refineryEdit }
          : {})}
      />
      {(onSettledOtherwise || canRemove) && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {onSettledOtherwise && (
            <Button variant="ghost" onClick={onSettledOtherwise}>
              {t(k('settledOtherwise'))}
            </Button>
          )}
          {canRemove && (
            <Button variant="ghost" onClick={onRemove}>
              {t(k('remove'))}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
