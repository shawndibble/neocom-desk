import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Panel } from '@/components/ui';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import type { SessionContinuation } from './sessionContinuation';

interface ContinueSessionCardProps {
  continuation: SessionContinuation;
  systemName: string;
  payeeName: string;
  typeNames: ReadonlyMap<number, string>;
  busy: boolean;
  autoContinue: boolean;
  onContinue: () => void;
  /** Opens the entry's own Assign form, for a session that belongs to another Payee. */
  onChooseOther: () => void;
  onKeepSeparate: () => void;
  onAutoContinueChange: (next: boolean) => void;
}

/**
 * The midnight-UTC offer (mockup F2, scope decision 20261004): a new EVE
 * day's still-unassigned entry that looks like yesterday's owed session
 * carrying on. One tap continues it — same Payee, same tax %, combined with
 * the day before. Always asked first unless the pilot opted into automatic
 * mode here, since one system can hold several Payees' moons.
 */
export function ContinueSessionCard({
  continuation,
  systemName,
  payeeName,
  typeNames,
  busy,
  autoContinue,
  onContinue,
  onChooseOther,
  onKeepSeparate,
  onAutoContinueChange,
}: ContinueSessionCardProps) {
  const { t } = useTranslation();
  const { next, previous } = continuation;
  return (
    <Panel padded={false} className="border-accent-dim">
      <div className="space-y-2 p-3">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
          {t('miningTax.continue.eyebrow')}
        </p>
        <p className="text-sm font-semibold">
          {next.row.entry.date} · {systemName}
          {next.row.unassignedOreLines.map((line, i) => (
            <span key={line.typeId} className="font-normal text-text-dim">
              {i === 0 ? ' · ' : ', '}
              {line.quantity.toLocaleString()}{' '}
              <MarketItemLink typeId={line.typeId}>
                {typeNames.get(line.typeId) ?? `#${line.typeId}`}
              </MarketItemLink>
            </span>
          ))}
        </p>
        <p className="text-xs text-text-dim">
          {t('miningTax.continue.hint', {
            system: systemName,
            payee: payeeName,
            date: previous.date,
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={onContinue}>
            {t('miningTax.continue.action', { date: previous.date })}
          </Button>
          <Button disabled={busy} onClick={onChooseOther}>
            {t('miningTax.continue.otherPayee')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onKeepSeparate}>
            {t('miningTax.continue.keepSeparate')}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-dim">
          <Checkbox
            checked={autoContinue}
            onChange={(e) => onAutoContinueChange(e.target.checked)}
          />
          {t('miningTax.continue.autoLabel')}
        </label>
      </div>
    </Panel>
  );
}
