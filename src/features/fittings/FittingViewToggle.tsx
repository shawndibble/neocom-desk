import { useTranslation } from 'react-i18next';
import type { FittingView } from './fittingViewPreference';

const VIEWS: readonly FittingView[] = ['ring', 'list'];

/** Ring | List switch for the editor header. Both targets are 44px. */
export function FittingViewToggle({
  value,
  onChange,
}: {
  value: FittingView;
  onChange: (view: FittingView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('fittings.view.label')}
      className="inline-flex overflow-hidden rounded-xs border border-border"
    >
      {VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          className={`min-h-11 min-w-11 cursor-pointer px-3 text-xs font-semibold ${
            value === view ? 'bg-accent text-bg' : 'bg-panel-2 text-text-dim hover:text-text'
          }`}
        >
          {t(`fittings.view.${view}`)}
        </button>
      ))}
    </div>
  );
}
