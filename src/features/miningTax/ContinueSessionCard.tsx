import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { OreLink } from './OreIcon';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Panel } from '@/components/ui';
import { SystemLink } from '@/features/entities';
import type { SessionContinuation } from './sessionContinuation';
import { formatCount } from '@/lib/formatCount';

interface ContinueSessionCardProps {
  continuation: SessionContinuation;
  systemName: string;
  payeeName: string;
  typeNames: ReadonlyMap<number, string>;
  busy: boolean;
  autoContinue: boolean;
  onContinue: () => void;
  onChooseOther: () => void;
  onKeepSeparate: () => void;
  onAutoContinueChange: (next: boolean) => void;
}

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
        <p className={eyebrowClassName}>{t('miningTax.continue.eyebrow')}</p>
        <p className="text-sm font-semibold">
          {next.row.entry.date} ·{' '}
          <SystemLink systemId={next.row.entry.solarSystemId}>{systemName}</SystemLink>
          {next.row.unassignedOreLines.map((line, i) => (
            <span key={line.typeId} className="font-normal text-text-dim">
              {i === 0 ? ' · ' : ', '}
              {formatCount(line.quantity)}{' '}
              <OreLink typeId={line.typeId}>
                {typeNames.get(line.typeId) ?? `#${line.typeId}`}
              </OreLink>
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
          <Button variant="primary" aria-disabled={busy || undefined} onClick={onContinue}>
            {t('miningTax.continue.action', { date: previous.date })}
          </Button>
          <Button aria-disabled={busy || undefined} onClick={onChooseOther}>
            {t('miningTax.continue.otherPayee')}
          </Button>
          <Button variant="ghost" aria-disabled={busy || undefined} onClick={onKeepSeparate}>
            {t('miningTax.continue.keepSeparate')}
          </Button>
        </div>
        <label className={`flex items-center gap-2 text-xs text-text-dim ${tappableRowClassName}`}>
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
