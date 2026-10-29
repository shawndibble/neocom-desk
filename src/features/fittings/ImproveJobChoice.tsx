/**
 * The Job setting, first in Improve's Search settings: PvE / PvP / Explore with
 * a one-line hint per job and, under Explore, where it flies. Dangerous is the
 * default: a wrong Safe can cost a ship, a wrong Dangerous only leaves some
 * strength unused. Controlled; the owner stores the choice.
 */
import { useTranslation } from 'react-i18next';
import { Radio, SegmentedControl } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  IMPROVE_JOBS,
  IMPROVE_SPACES,
  type ImproveJob,
  type ImproveSpace,
} from './improveSettings';

interface Props {
  job: ImproveJob;
  onJobChange: (job: ImproveJob) => void;
  /** Only read under Explore. */
  space?: ImproveSpace;
  onSpaceChange: (space: ImproveSpace) => void;
}

export function ImproveJobChoice({ job, onJobChange, space = 'dangerous', onSpaceChange }: Props) {
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
      <p className="text-text-dim text-xs">{t(`fittings.improve.job.hint.${job}`)}</p>
      {job === 'explore' && (
        <fieldset className="space-y-1">
          <legend className="text-text-dim text-xs">{t('fittings.improve.job.spaceLabel')}</legend>
          {IMPROVE_SPACES.map((value) => (
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
