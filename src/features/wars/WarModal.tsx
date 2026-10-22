/**
 * What a pilot (and their corporation) wants from a war declaration, in one
 * glance and no more: who, when it bites, and how it is going. Each war is a
 * card: a red summary block with the aggressor and the status, four facts in
 * two columns, then the two kill tallies side by side.
 */
import { useTranslation } from 'react-i18next';
import { Modal, IskAmount } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Pill } from '@/components/ui/Pill';
import type { StoredWar, WarAgainstMe } from '@/engine/wars';
import { formatCount } from '@/lib/formatCount';
import { formatCountdown } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsPhone } from '@/lib/useIsPhone';
import { warZkillUrl } from '@/lib/zkillboard';
import { usePartyName } from './usePartyName';
import { WarParty } from './WarParty';

interface WarModalProps {
  open: boolean;
  onClose: () => void;
  wars: readonly WarAgainstMe[];
}

export function WarModal({ open, onClose, wars }: WarModalProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  return (
    <Modal
      open={open}
      onClose={onClose}
      placement={phone ? 'sheet' : 'center'}
      title={t('wars.modal.title', { count: wars.length })}
    >
      <div className="space-y-4">
        {wars.map((hit) => (
          <WarCard key={hit.war.id} hit={hit} />
        ))}
      </div>
    </Modal>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] tracking-widest text-text-dim uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Tally({ label, isk, ships }: { label: string; isk: number; ships: number }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1 rounded-xs border border-line px-3 py-2">
      <p className="text-[0.6875rem] tracking-widest text-text-dim uppercase">{label}</p>
      <p className="text-lg font-semibold tabular-nums">
        <IskAmount value={isk} />
      </p>
      <p className="text-xs text-text-dim">{t('wars.modal.ships', { count: ships })}</p>
    </div>
  );
}

function endsLabel(war: StoredWar, tz: 'UTC' | undefined, t: (key: string) => string): string {
  if (war.finished !== undefined) return formatTimestamp(new Date(war.finished), tz);
  return war.mutual ? t('wars.modal.mutual') : t('wars.modal.noEnd');
}

function WarCard({ hit }: { hit: WarAgainstMe }) {
  const { t } = useTranslation();
  const tz = useTimeZone();
  const { war, side, status } = hit;
  const defender = usePartyName(war.defender);
  const pending = status.kind === 'pending';
  const startsIn = pending ? status.startsIn : null;

  return (
    <section className="space-y-3">
      <div className="space-y-1.5 rounded-xs border border-danger bg-danger/10 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <WarParty party={war.aggressor} />
          <Pill tone="danger" className="shrink-0">
            {pending
              ? startsIn === null
                ? t('wars.modal.pendingUnknown')
                : t('wars.modal.startsIn', { time: formatCountdown(startsIn / 1000) })
              : t('wars.modal.active')}
          </Pill>
        </div>
        <p className="text-xs text-text-dim">
          {side === 'defender'
            ? t('wars.modal.declaredOnYou')
            : t('wars.modal.declaredOnAlly', { name: defender })}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact label={t('wars.modal.declared')}>{formatTimestamp(new Date(war.declared), tz)}</Fact>
        <Fact label={pending ? t('wars.modal.starts') : t('wars.modal.started')}>
          {war.started === undefined ? '—' : formatTimestamp(new Date(war.started), tz)}
        </Fact>
        <Fact label={t('wars.modal.ends')}>{endsLabel(war, tz, t)}</Fact>
        <Fact label={t('wars.modal.allies')}>
          {war.allies.length === 0 ? t('wars.modal.noAllies') : formatCount(war.allies.length)}
        </Fact>
      </dl>

      <div className="flex gap-2">
        <Tally
          label={t('wars.modal.theyDestroyed')}
          isk={war.aggressor.iskDestroyed}
          ships={war.aggressor.shipsKilled}
        />
        <Tally
          label={t('wars.modal.youDestroyed')}
          isk={war.defender.iskDestroyed}
          ships={war.defender.shipsKilled}
        />
      </div>

      <p className="text-xs">
        <ExternalLink href={warZkillUrl(war.id)}>{t('wars.modal.zkill')}</ExternalLink>
      </p>
    </section>
  );
}
