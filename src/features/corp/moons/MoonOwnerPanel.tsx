import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { leaveFeeder, type FeederStatus } from '../taxBook/feederClient';
import { DialogShell } from './BookDialogs';

type Owner = Extract<FeederStatus, { status: 'feeder' }>;

/**
 * A moon owner's Moons page once an accounting corporation handles its tax: what
 * it reads, whether the first sync has landed, the rate, and Leave. A member who
 * is not an officer of the corporation never reaches this (the status read is
 * refused). Leave shows what is still owed before it revokes anything.
 */
export function MoonOwnerPanel({
  owner,
  characterId,
  corporationId,
  canLeave,
  onLeft,
}: {
  owner: Owner;
  characterId: number;
  corporationId: number;
  canLeave: boolean;
  onLeft: () => void;
}) {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  const [owed, setOwed] = useState<number | null>(owner.owedIsk);
  const name = owner.collectorName ?? t('corpTaxBook.moons.owner.anonymous');
  const rate = owner.effectiveRatePct ?? owner.requestedRatePct;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Panel title={t('corpTaxBook.moons.owner.title', { name })}>
        <div className="space-y-3 p-3 text-sm">
          <p>
            {owner.lastReadWellAt === null
              ? t('corpTaxBook.moons.owner.waiting')
              : t('corpTaxBook.moons.owner.synced', {
                  date: new Date(owner.lastReadWellAt).toISOString().slice(0, 10),
                })}
          </p>
          <p className="text-text-dim">
            {rate === null
              ? t('corpTaxBook.moons.owner.noRate')
              : t('corpTaxBook.moons.owner.rate', { pct: rate })}
          </p>
          {owner.refineries.length === 0 ? (
            <p className="text-text-dim">{t('corpTaxBook.moons.owner.noMining')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {owner.refineries.map((r) => (
                <li key={r.structureId} className="flex justify-between py-1">
                  <span>{r.label ?? `#${r.structureId}`}</span>
                  <span className="tabular-nums">
                    {t('corpTaxBook.moons.owner.volume', { volume: formatIsk(r.volume) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      {canLeave && (
        <div>
          <Button variant="danger" size="sm" onClick={() => setLeaving(true)}>
            {t('corpTaxBook.moons.owner.leave.open')}
          </Button>
        </div>
      )}
      {leaving && (
        <DialogShell
          open
          onClose={() => setLeaving(false)}
          title={t('corpTaxBook.moons.owner.leave.title')}
          confirmLabel={t('corpTaxBook.moons.owner.leave.confirm')}
          canConfirm
          danger
          run={async () => {
            const result = await leaveFeeder(characterId, corporationId);
            setOwed(result.owedIsk);
            onLeft();
          }}
        >
          <p>
            {owed === null
              ? t('corpTaxBook.moons.owner.leave.owedUnknown', { name })
              : owed > 0
                ? t('corpTaxBook.moons.owner.leave.owed', {
                    name,
                    isk: formatIsk(owed),
                  })
                : t('corpTaxBook.moons.owner.leave.nothingOwed', { name })}
          </p>
          <p className="mt-2 text-text-dim">{t('corpTaxBook.moons.owner.leave.body')}</p>
        </DialogShell>
      )}
    </div>
  );
}
