import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import type { AlphaBlocker } from '@/engine/fittings/alphaClone';
import { romanLevel } from '@/engine/projection';

/** Skill levels named in the tooltip before the rest are summed up. */
const SHOWN = 4;

interface AlphaCloneChipProps {
  /** The skill levels an Alpha can't reach; empty when it can fly the fit, null while loading. */
  blockers: readonly AlphaBlocker[] | null;
  skillName: (skillTypeId: number) => string;
}

/**
 * "Alpha OK" / "Omega only" for the open Fitting, by skill caps (see
 * `engine/fittings/alphaClone.ts`) — whoever flies it, so it shows without a
 * Character too. Its tooltip names the skill levels that keep an Alpha out.
 */
export function AlphaCloneChip({ blockers, skillName }: AlphaCloneChipProps) {
  const { t } = useTranslation();
  if (blockers === null) return null;
  const ok = blockers.length === 0;
  const lines = ok
    ? [t('fittings.alpha.okTooltip')]
    : [
        t('fittings.alpha.omegaTooltip'),
        ...blockers.slice(0, SHOWN).map((blocker) =>
          t(blocker.alphaMaxLevel > 0 ? 'fittings.alpha.capped' : 'fittings.alpha.untrainable', {
            skill: skillName(blocker.skillTypeID),
            level: romanLevel(blocker.level),
            max: romanLevel(blocker.alphaMaxLevel),
          })
        ),
        ...(blockers.length > SHOWN
          ? [t('fittings.alpha.more', { count: blockers.length - SHOWN })]
          : []),
      ];
  return (
    <Tooltip content={lines.join('\n')} openOnTap>
      <button
        type="button"
        className={`inline-flex min-h-11 items-center rounded-xs border px-2 text-[0.6875rem] font-semibold tracking-widest uppercase md:min-h-7 ${
          ok ? 'border-success/60 text-success' : 'border-line-bright text-text-dim'
        }`}
      >
        {t(ok ? 'fittings.alpha.ok' : 'fittings.alpha.omega')}
      </button>
    </Tooltip>
  );
}
