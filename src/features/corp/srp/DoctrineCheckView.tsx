/**
 * A claim's doctrine-fit result, for the pilot before filing and the officer on the claim:
 * "Matches <fit>", or "Off doctrine" with the diff against the nearest Doctrine Fit. A hull the
 * corp does not check (and a claim filed before the check existed) shows nothing. The label is
 * text, never colour alone.
 */
import { useTranslation } from 'react-i18next';
import { Pill } from '@/components/ui/Pill';
import type { DoctrineCheckRecord } from '../srpTypes';
import { diffSections, diffTypeIds } from './doctrineDiff';
import { useDoctrineTypeNames } from './useDoctrineTypeNames';

interface Props {
  check: DoctrineCheckRecord | undefined;
  /** The pilot is told they can still file; the officer is told what the claim was checked against. */
  audience: 'pilot' | 'officer';
}

export function DoctrineCheckView({ check, audience }: Props) {
  const { t } = useTranslation();
  const typeName = useDoctrineTypeNames(check?.diff ? diffTypeIds(check.diff) : []);
  if (!check || check.status === 'not-checked') return null;
  const fit = check.doctrineName ?? t('srp.doctrine.unnamed');
  if (check.status === 'matched') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone="success">{t('srp.doctrine.onDoctrine')}</Pill>
        <span>{t('srp.doctrine.matches', { name: fit })}</span>
      </p>
    );
  }
  const sections = check.diff ? diffSections(check.diff) : [];
  return (
    <div className="grid gap-2 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Pill tone="warning">{t('srp.doctrine.offDoctrine')}</Pill>
        <span>{t(`srp.doctrine.nearest.${audience}`, { name: fit })}</span>
      </p>
      {sections.length > 0 && (
        <dl className="grid gap-1">
          {sections.map(({ key, lines }) => (
            <div key={key} className="grid gap-0.5">
              <dt className="text-xs text-text-dim">{t(`srp.doctrine.diff.${key}`)}</dt>
              <dd>
                <ul className="grid gap-0.5">
                  {lines.map(({ typeId, count }) => (
                    <li key={typeId}>
                      {count > 1
                        ? t('srp.doctrine.diff.line', { count, name: typeName(typeId) })
                        : typeName(typeId)}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {audience === 'pilot' && (
        <p className="text-xs text-text-dim">{t('srp.doctrine.pilotNote')}</p>
      )}
    </div>
  );
}
