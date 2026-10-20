import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, Panel, StatChip, StatChips, TextInput } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { FeederView } from '../taxBook/feederViewClient';
import {
  isSettledAfterLeaving,
  minedRows,
  pageState,
  parseRequestedRate,
  payoutRows,
  rateNote,
  refineryLabeler,
  type MinedRow,
} from '../taxBook/feederViewModel';
import { DialogShell } from './BookDialogs';
import { isk, shortDate } from './moonsFormat';

type Names = (characterId: number) => string;
const day = (iso: string) => shortDate(iso);

/** Page B's plain statement: who handles the tax, what is owed, what was paid. */
function Statement({ view, name }: { view: FeederView; name: string }) {
  const { t } = useTranslation();
  const s = view.summary;
  const rate = s.effectiveRatePct;
  const since = s.coverageFrom ? day(s.coverageFrom) : null;
  const k = (key: string) => `corpTaxBook.moons.ownerView.statement.${key}`;
  return (
    <Panel>
      <div className="space-y-1 text-sm">
        <p className="text-text-dim">{t(k('intro'), { name })}</p>
        {rate === null ? (
          <p>{t(k('noRate'))}</p>
        ) : s.balanceKind === 'owed' ? (
          <>
            <p className="text-2xl font-semibold tabular-nums">{isk(s.balanceIsk)}</p>
            <p>
              {since ? t(k('owed'), { since, pct: rate }) : t(k('owedUndated'), { pct: rate })}{' '}
              {s.lastPayout
                ? t(k('paid'), {
                    paid: isk(s.paidIsk),
                    amount: isk(s.lastPayout.amount),
                    date: day(s.lastPayout.date),
                  })
                : t(k('notPaid'))}
            </p>
          </>
        ) : s.balanceKind === 'credit' ? (
          <>
            <p className="text-2xl font-semibold tabular-nums">{isk(s.balanceIsk)}</p>
            <p>{t(k('credit'), { pct: rate })}</p>
          </>
        ) : (
          <p>
            {t(k('even'), { pct: rate })}{' '}
            {s.lastPayout &&
              t(k('paid'), {
                paid: isk(s.paidIsk),
                amount: isk(s.lastPayout.amount),
                date: day(s.lastPayout.date),
              })}
          </p>
        )}
        {s.unpricedDays > 0 && (
          <p className="text-xs text-text-dim">{t(k('unpriced'), { count: s.unpricedDays })}</p>
        )}
      </div>
    </Panel>
  );
}

/** Settled otherwise: the note, mined volume and value, nothing owed in ISK. */
function SettledOtherwise({ view, name }: { view: FeederView; name: string }) {
  const { t } = useTranslation();
  const s = view.summary;
  return (
    <>
      <Panel title={t('corpTaxBook.moons.ownerView.settledOtherwise.title')}>
        <div className="space-y-1 text-sm">
          <p>{t('corpTaxBook.moons.ownerView.settledOtherwise.intro', { name })}</p>
          {s.note && <p className="font-semibold">{s.note}</p>}
          <p className="text-xs text-text-dim">
            {t('corpTaxBook.moons.ownerView.settledOtherwise.nothingOwed')}
          </p>
        </div>
      </Panel>
      <StatChips>
        <StatChip
          label={t('corpTaxBook.moons.ownerView.minedValue')}
          value={isk(s.minedValueIsk)}
          emphasis
        />
        <StatChip
          label={t('corpTaxBook.moons.ownerView.minedVolume')}
          value={t('corpTaxBook.moons.ownerView.units', { volume: isk(s.minedVolume) })}
        />
        {s.coverageFrom && (
          <StatChip label={t('corpTaxBook.moons.ownerView.since')} value={day(s.coverageFrom)} />
        )}
      </StatChips>
    </>
  );
}

/** Who mined at the moon owner's refineries, per character and refinery. Nothing is capped. */
function MinedTable({ view, names, title }: { view: FeederView; names: Names; title: string }) {
  const { t } = useTranslation();
  const rows = minedRows(view.days);
  const label = refineryLabeler(view.refineries);
  return (
    <Panel title={title} padded={rows.length === 0}>
      {rows.length === 0 ? (
        <p className="text-sm text-text-dim">{t('corpTaxBook.moons.owner.noMining')}</p>
      ) : (
        <DataTable<MinedRow>
          label={title}
          rows={rows}
          rowKey={(r) => r.key}
          defaultSort={{ columnId: 'value', direction: 'desc' }}
          columns={[
            {
              id: 'character',
              header: t('corpTaxBook.moons.ownerView.cols.character'),
              primary: true,
              render: (r) => names(r.characterId),
              sortValue: (r) => names(r.characterId),
            },
            {
              id: 'refinery',
              header: t('corpTaxBook.moons.ownerView.cols.refinery'),
              render: (r) => label(r.structureId),
              sortValue: (r) => label(r.structureId),
            },
            {
              id: 'volume',
              header: t('corpTaxBook.moons.ownerView.cols.volume'),
              align: 'right',
              className: 'tabular-nums',
              render: (r) => isk(r.volume),
              sortValue: (r) => r.volume,
            },
            {
              id: 'value',
              header: t('corpTaxBook.moons.ownerView.cols.value'),
              align: 'right',
              className: 'tabular-nums',
              render: (r) => isk(r.valueIsk),
              sortValue: (r) => r.valueIsk,
            },
          ]}
        />
      )}
    </Panel>
  );
}

/** The rate line, with "Ask for a different rate…" for the corporation's officers. */
function RateLine({
  view,
  name,
  onAskRate,
}: {
  view: FeederView;
  name: string;
  onAskRate?: () => void;
}) {
  const { t } = useTranslation();
  const note = rateNote(view.summary);
  const k = (key: string) => `corpTaxBook.moons.ownerView.rate.${key}`;
  return (
    <div className="space-y-1 text-sm">
      <p>
        {note.kind === 'none' && t(k('none'))}
        {note.kind === 'plain' && t(k('plain'), { pct: note.pct })}
        {note.kind === 'asked' && t(k('asked'), { pct: note.askedPct })}
        {note.kind === 'override' &&
          (note.since
            ? t(k('override'), {
                pct: note.agreedPct,
                name,
                date: day(note.since),
                asked: note.askedPct,
              })
            : t(k('overrideUndated'), { pct: note.agreedPct, name, asked: note.askedPct }))}
      </p>
      {onAskRate && (
        <button type="button" className={inlineLinkClassName} onClick={onAskRate}>
          {t(k('ask'))}
        </button>
      )}
    </div>
  );
}

const METHOD = { donation: 'donation', other: 'other' } as const;

function Payments({ view }: { view: FeederView }) {
  const { t } = useTranslation();
  const rows = payoutRows(view.payouts);
  if (rows.length === 0)
    return (
      <p className="text-sm text-text-dim">{t('corpTaxBook.moons.ownerView.payments.none')}</p>
    );
  return (
    <ul className="space-y-0.5 text-xs text-text-dim">
      {rows.map((p, i) => (
        <li key={`${p.date}:${p.amount}:${i}`}>
          {day(p.date)} · <span className="tabular-nums">{isk(p.amount)}</span> ·{' '}
          {t(`corpTaxBook.moons.ownerView.payments.method.${METHOD[p.method]}`)} ·{' '}
          {t(`corpTaxBook.moons.ownerView.payments.status.${p.status}`)}
        </li>
      ))}
    </ul>
  );
}

function AskRateDialog({
  initial,
  onClose,
  onRequest,
}: {
  initial: number | null;
  onClose: () => void;
  onRequest: (pct: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial === null ? '' : String(initial));
  const pct = parseRequestedRate(text);
  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corpTaxBook.moons.ownerView.rate.dialogTitle')}
      confirmLabel={t('corpTaxBook.moons.ownerView.rate.confirm')}
      canConfirm={pct !== null}
      run={async () => {
        if (pct !== null) await onRequest(pct);
      }}
    >
      <label className="block space-y-1">
        <span className="text-xs text-text-dim">{t('corpTaxBook.moons.ownerView.rate.field')}</span>
        <TextInput inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.ownerView.rate.hint')}</p>
    </DialogShell>
  );
}

/**
 * A moon owner's page from the server-written view: Page B, statement first,
 * then who mined at its refineries, then payments and rate. `banner` is the stale
 * ledger strip; `afterCard` sits between the after-leaving card and the history
 * (the own-book / paste-an-invite choice). Never says feeder or Collector.
 */
export function MoonOwnerView({
  view,
  names,
  canEdit,
  onRequestRate,
  banner,
  card,
  afterCard,
}: {
  view: FeederView;
  names: Names;
  canEdit: boolean;
  onRequestRate: (pct: number) => Promise<void>;
  banner?: ReactNode;
  card?: ReactNode;
  afterCard?: ReactNode;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const state = pageState(view.summary);
  const name = view.summary.collectorName ?? t('corpTaxBook.moons.owner.anonymous');
  const ended = state === 'ended';
  // Settled after leaving folds to its one line: no history under it.
  const folded = isSettledAfterLeaving(view.summary);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {banner}
      {card}
      {afterCard}
      {!folded && (
        <>
          {state === 'normal' && <Statement view={view} name={name} />}
          {state === 'settled-otherwise' && <SettledOtherwise view={view} name={name} />}
          {(!ended || view.days.length > 0) && (
            <MinedTable
              view={view}
              names={names}
              title={t(
                ended
                  ? 'corpTaxBook.moons.ownerView.minedWhile'
                  : 'corpTaxBook.moons.ownerView.mined'
              )}
            />
          )}
          {state === 'normal' && (
            <Panel title={t('corpTaxBook.moons.ownerView.paymentsAndRate')}>
              <div className="space-y-3">
                <RateLine
                  view={view}
                  name={name}
                  onAskRate={canEdit ? () => setAsking(true) : undefined}
                />
                <Payments view={view} />
              </div>
            </Panel>
          )}
          {ended && view.payouts.length > 0 && (
            <Panel title={t('corpTaxBook.moons.ownerView.paymentsToYou')}>
              <Payments view={view} />
            </Panel>
          )}
        </>
      )}
      {asking && (
        <AskRateDialog
          initial={view.summary.requestedRatePct}
          onClose={() => setAsking(false)}
          onRequest={onRequestRate}
        />
      )}
    </div>
  );
}
