import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import type { AlphaBlocker } from '@/engine/fittings/alphaClone';
import { romanLevel } from '@/engine/projection';
import { HeaderBadgeSlot } from './HeaderBadgeSlot';

const BLOCKERS_NAMED = 4;

interface AlphaCloneChipProps {
  blockers: readonly AlphaBlocker[] | null;
  skillName: (skillTypeId: number) => string;
}

function useAlphaVerdict({ blockers, skillName }: AlphaCloneChipProps) {
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
  return { ok, label: t(ok ? 'fittings.alpha.ok' : 'fittings.alpha.omega'), lines };
}

export function AlphaCloneMenuRow(props: AlphaCloneChipProps) {
  const verdict = useAlphaVerdict(props);
  if (verdict === null) return null;
  return (
    <div className="max-w-64 px-2 py-1.5 text-xs">
      <p className={`font-semibold ${verdict.ok ? 'text-success' : 'text-warning'}`}>
        {verdict.label}
      </p>
      {verdict.lines.map((line) => (
        <p key={line} className="text-text-dim">
          {line}
        </p>
      ))}
    </div>
  );
}

function AlphaTooltip({ lines }: { lines: readonly string[] }) {
  const [verdict, ...skills] = lines;
  return (
    <div className="space-y-1">
      <p>{verdict}</p>
      {skills.length > 0 && (
        <ul className="border-y border-line py-1">
          {skills.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AlphaCloneChip(props: AlphaCloneChipProps) {
  const verdict = useAlphaVerdict(props);
  if (verdict === null) return <HeaderBadgeSlot />;
  const { ok, label, lines } = verdict;
  return (
    <IconButton
      icon={<span className="text-lg leading-none font-semibold">{ok ? 'α' : 'Ω'}</span>}
      label={label}
      tooltip={<AlphaTooltip lines={lines} />}
      tone={ok ? 'positive' : 'warning'}
      openOnTap
    />
  );
}
