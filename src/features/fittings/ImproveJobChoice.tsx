/**
 * The Job setting, first in Improve's Search settings: PvE / PvP / Explore with
 * a one-line hint per job and, under Explore, where it flies. Dangerous is the
 * default: a wrong Safe can cost a ship, a wrong Dangerous only leaves some
 * strength unused. Controlled; the owner stores the choice.
 */
import { useTranslation } from 'react-i18next';
import { Checkbox, Radio, SegmentedControl } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  EXPLORE_SPACES,
  IMPROVE_JOBS,
  type ExploreSpace,
  type ImproveJob,
} from '@/engine/fittings/improveJob';

interface Props {
  job: ImproveJob;
  onJobChange: (job: ImproveJob) => void;
  /** Only read under Explore. */
  space?: ExploreSpace;
  onSpaceChange: (space: ExploreSpace) => void;
  /** Only read under PvE: the pilot needs no propulsion module. Without a handler the control is left out. */
  noPropulsion?: boolean;
  onNoPropulsionChange?: (on: boolean) => void;
}

export function ImproveJobChoice({
  job,
  onJobChange,
  space = 'dangerous',
  onSpaceChange,
  noPropulsion = false,
  onNoPropulsionChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <SegmentedControl
        label={t('fittings.improve.job.label')}
        options={IMPROVE_JOBS.map((value) => ({
          value,
          label: t(`fittings.improve.job.${value}`),
        }))}
        value={job}
        onChange={onJobChange}
        fill
      />
      {job === 'pve' && onNoPropulsionChange && (
        <label
          className={cx('flex cursor-pointer items-center gap-2 text-sm', tappableRowClassName)}
        >
          <Checkbox
            checked={noPropulsion}
            onChange={(event) => onNoPropulsionChange(event.target.checked)}
          />
          {t('fittings.improve.job.noPropulsion')}
        </label>
      )}
      {job === 'explore' && (
        <fieldset className="space-y-1">
          <legend className="text-text-dim text-xs">{t('fittings.improve.job.spaceLabel')}</legend>
          {EXPLORE_SPACES.map((value) => (
            <label
              key={value}
              className={cx('flex cursor-pointer items-start gap-2 text-sm', tappableRowClassName)}
            >
              <Radio
                className="mt-0.5"
                name="improve-space"
                checked={space === value}
                onChange={() => onSpaceChange(value)}
              />
              <span>
                {t(`fittings.improve.job.space.${value}`)}
                <span className="text-text-dim block text-xs">
                  {t(`fittings.improve.job.spaceHint.${value}`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
