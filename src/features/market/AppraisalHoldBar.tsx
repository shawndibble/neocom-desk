/**
 * Packaged volume of the Appraisal against the Hauling Cargo Space. Rendered
 * only once a Cargo Space is set; a line with no known volume is said so, not
 * guessed.
 */
import { useTranslation } from 'react-i18next';
import { ProgressBar } from '@/components/ui';
import { popoverValueClassName } from '@/components/ui/controlStyles';
import type { AppraisalTotals } from '@/engine/market/appraisal';
import { formatCubicMetres } from '@/lib/volume';
import { HaulingCargoPopover } from './HaulingCargoControl';
import { totalCargoM3, type HaulingCargo } from './haulingCargo';

export function AppraisalHoldBar({
  totals,
  cargo,
  characterId,
  onCargoChange,
}: {
  totals: Pick<AppraisalTotals, 'volume' | 'volumeUnknownRows'>;
  cargo: HaulingCargo;
  characterId: number | null;
  onCargoChange: (cargo: HaulingCargo | null) => void;
}) {
  const { t } = useTranslation();
  const capacity = totalCargoM3(cargo);
  const fits = totals.volume <= capacity;
  return (
    <div className="flex flex-col gap-1" data-testid="hold-bar">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.6875rem]">
        <span className="text-text-dim">
          <span className="font-semibold tracking-widest uppercase">
            {t('market.appraisal.holdTitle')}
          </span>
          {' · '}
          {/* The ship name is the picker's trigger: accent text with a dashed underline marks the editable value. */}
          <HaulingCargoPopover
            characterId={characterId}
            cargo={cargo}
            onCargoChange={onCargoChange}
            align="start"
            triggerLabel={t('market.appraisal.holdChange', { ship: cargo.label })}
            triggerClassName={popoverValueClassName}
          >
            {cargo.label}
          </HaulingCargoPopover>
        </span>
        <span className={fits ? 'text-text' : 'text-warning'}>
          {t('market.appraisal.holdFill', {
            used: formatCubicMetres(totals.volume),
            capacity: formatCubicMetres(capacity),
          })}
        </span>
      </div>
      <ProgressBar
        label={t('market.appraisal.holdBarLabel', { ship: cargo.label })}
        value={totals.volume}
        max={capacity}
        tone={fits ? 'accent' : 'warning'}
      />
      <p className="text-[0.6875rem] text-text-dim">
        {fits ? t('market.appraisal.holdFits') : t('market.appraisal.holdOver')}
        {totals.volumeUnknownRows > 0 &&
          ` ${t('market.appraisal.holdUnknown', { count: totals.volumeUnknownRows })}`}
      </p>
    </div>
  );
}
