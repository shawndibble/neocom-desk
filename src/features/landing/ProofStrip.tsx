import { useTranslation } from 'react-i18next';

const FACTS = ['characters', 'alerts', 'offline', 'free', 'openSource'] as const;

export function ProofStrip() {
  const { t } = useTranslation();
  return (
    <div className="border-b border-line bg-panel">
      <ul
        aria-label={t('login.proofStrip.label')}
        className="mx-auto flex max-w-page flex-wrap gap-x-8 gap-y-2 px-4 py-3.5 font-mono text-xs text-text-dim sm:px-6 xl:justify-between"
      >
        {FACTS.map((fact) => (
          <li key={fact} className="flex items-baseline gap-2">
            <span aria-hidden="true" className="text-accent">
              ◆
            </span>
            {t(`login.proofStrip.${fact}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
