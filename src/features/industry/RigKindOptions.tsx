import { useTranslation } from 'react-i18next';
import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui';
import { RIG_TARGET_IDS, scopedRigKind } from '@/engine/industry/rigScope';
import { RIG_KIND_OPTIONS } from '@/engine/industry/types';
import { rigKindLabel } from './rigFitLabels';

const LINES_AND_TIERS = [
  ['me', 'T1'],
  ['me', 'T2'],
  ['te', 'T1'],
  ['te', 'T2'],
] as const;

export function RigKindOptions() {
  const { t } = useTranslation();
  return (
    <>
      {RIG_KIND_OPTIONS.map((option) => (
        <SelectItem key={option} value={option}>
          {rigKindLabel(option, t)}
        </SelectItem>
      ))}
      {RIG_TARGET_IDS.map((target) => (
        <SelectGroup key={target}>
          <SelectLabel>{t(`industry.rigTarget.${target}`)}</SelectLabel>
          {LINES_AND_TIERS.map(([line, tier]) => {
            const kind = scopedRigKind(line, tier, target);
            return (
              <SelectItem key={kind} value={kind}>
                {rigKindLabel(kind, t)}
              </SelectItem>
            );
          })}
        </SelectGroup>
      ))}
    </>
  );
}
