import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';

export interface PrereqRow {
  typeID: number;
  name: string;
  level: number;
  /** Whether the active character's trained level already meets `level`. */
  trained: boolean;
}

export interface UnlockRow {
  typeID: number;
  name: string;
  level: number;
}

interface SkillInspectorProps {
  skillName: string;
  prereqs: readonly PrereqRow[];
  unlocks: readonly UnlockRow[];
  onClose: () => void;
}

/** Shows a selected skill's prerequisites (trained vs. still needed) and what it unlocks. */
export function SkillInspector({ skillName, prereqs, unlocks, onClose }: SkillInspectorProps) {
  const { t } = useTranslation();
  return (
    <Panel
      title={skillName}
      actions={
        <button
          type="button"
          onClick={onClose}
          aria-label={t('skills.inspector.close')}
          className="rounded-xs px-1.5 py-0.5 text-xs text-text-dim hover:text-text"
        >
          {t('skills.inspector.close')}
        </button>
      }
    >
      <div className="space-y-3">
        <section>
          <h3 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
            {t('skills.inspector.prereqsTitle')}
          </h3>
          {prereqs.length === 0 ? (
            <p className="mt-1 text-xs text-text-dim">{t('skills.inspector.noPrereqs')}</p>
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {prereqs.map((req) => (
                <li
                  key={req.typeID}
                  className="flex items-center justify-between gap-2 py-1 text-xs"
                >
                  <span className={req.trained ? 'text-text' : 'text-text-dim'}>{req.name}</span>
                  <span
                    data-trained={req.trained}
                    className={`shrink-0 rounded-xs px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${
                      req.trained ? 'bg-accent/20 text-accent' : 'border border-line text-text-dim'
                    }`}
                  >
                    {req.trained
                      ? t('skills.inspector.trained', { level: req.level })
                      : t('skills.inspector.levelNeeded', { level: req.level })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
            {t('skills.inspector.unlocksTitle')}
          </h3>
          {unlocks.length === 0 ? (
            <p className="mt-1 text-xs text-text-dim">{t('skills.inspector.noUnlocks')}</p>
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {unlocks.map((req) => (
                <li
                  key={req.typeID}
                  className="flex items-center justify-between gap-2 py-1 text-xs"
                >
                  <span>{req.name}</span>
                  <span className="shrink-0 text-text-dim">
                    {t('skills.inspector.levelNeeded', { level: req.level })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}
