import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import type { AlphaBlocker } from '@/engine/fittings/alphaClone';
import { romanLevel } from '@/engine/projection';

/** Skill levels named in the tooltip before the rest are summed up. */
const BLOCKERS_NAMED = 4;

interface AlphaCloneChipProps {
  /** The skill levels an Alpha can't reach; empty when it can fly the fit, null while loading. */
  blockers: readonly AlphaBlocker[] | null;
  skillName: (skillTypeId: number) => string;
}

/**
 * "Alpha OK" / "Omega only" for the open Fitting, by skill caps (see
 * `engine/fittings/alphaClone.ts`) — whoever flies it, so it shows without a
 * Character too. An icon, so the header stays one row: α in green when an
 * Alpha can fly it, Ω in warning yellow when it needs Omega. The verdict is
 * its accessible name; the tooltip (a tap on touch) explains it and names the
 * skill levels that keep an Alpha out.
 */
export function AlphaCloneChip({ blockers, skillName }: AlphaCloneChipProps) {
  const { t } = useTranslation();
  if (blockers === null) return null;
  const ok = blockers.length === 0;
  const lines = ok
    ? [t('fittings.alpha.okTooltip')]
    : [
        t('fittings.alpha.omegaTooltip'),
        ...blockers.slice(0, BLOCKERS_NAMED).map((blocker) =>
          t(blocker.alphaMaxLevel > 0 ? 'fittings.alpha.capped' : 'fittings.alpha.untrainable', {
            skill: skillName(blocker.skillTypeID),
            level: romanLevel(blocker.level),
            max: romanLevel(blocker.alphaMaxLevel),
          })
        ),
        ...(blockers.length > BLOCKERS_NAMED
          ? [t('fittings.alpha.more', { count: blockers.length - BLOCKERS_NAMED })]
          : []),
      ];
  return (
    <IconButton
      icon={<span className="text-lg leading-none font-semibold">{ok ? 'α' : 'Ω'}</span>}
      label={t(ok ? 'fittings.alpha.ok' : 'fittings.alpha.omega')}
      tooltip={lines.join('\n')}
      tone={ok ? 'positive' : 'warning'}
      openOnTap
    />
  );
}
