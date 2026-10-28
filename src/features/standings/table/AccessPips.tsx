import { useTranslation } from 'react-i18next';
import { AGENT_LEVELS, type AgentLevel } from '@/engine/standings';
import { cx } from '@/lib/cx';

/**
 * Five pips for agent levels 1-5, filled up to the highest level a standing
 * opens, then "L4". The words say it to a screen reader ("Agents up to level
 * 4"); the pips and the short form are for the eye.
 */
export function AccessPips({ level }: { level: AgentLevel }) {
  const { t } = useTranslation();
  const label = t('contacts.standings.level', { level });
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {AGENT_LEVELS.map((pip) => (
          <span
            key={pip}
            data-filled={pip <= level}
            className={cx('h-2 w-2.5', pip <= level ? 'bg-accent' : 'bg-line-bright')}
          />
        ))}
      </span>
      <span aria-hidden="true" className="tabular-nums">
        {label}
      </span>
      <span className="sr-only">{t('contacts.standings.accessUpTo', { level })}</span>
    </span>
  );
}
