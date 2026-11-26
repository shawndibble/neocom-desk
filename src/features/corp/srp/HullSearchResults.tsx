import { useTranslation } from 'react-i18next';
import { Button, LiveNote } from '@/components/ui';

export interface HullSearchResult {
  scope: 'hull' | 'class';
  id: number;
  name: string;
  classLabel: string;
  listed: boolean;
}

export function HullSearchResults({
  results,
  onAdd,
}: {
  results: HullSearchResult[];
  onAdd: (scope: 'hull' | 'class', id: number) => void;
}) {
  const { t } = useTranslation();
  if (results.length === 0)
    return (
      <LiveNote className="text-sm text-text-dim">{t('srp.settings.hullRules.noResults')}</LiveNote>
    );
  return (
    <ul
      aria-label={t('srp.settings.hullRules.resultsLabel')}
      className="grid max-h-72 w-full divide-y divide-line overflow-y-auto rounded-xs border border-line bg-panel-2 text-sm sm:max-w-sm"
    >
      {results.map((hull) => (
        <li key={`${hull.scope}:${hull.id}`} className="flex min-h-9 items-center gap-2 px-3">
          <span className="min-w-0 flex-1 truncate">
            {hull.name}{' '}
            <span className="text-xs text-text-dim">
              {hull.scope === 'class' ? t('srp.settings.hullRules.classTag') : hull.classLabel}
            </span>
          </span>
          {hull.listed ? (
            <span className="text-xs text-text-dim">{t('srp.settings.hullRules.listed')}</span>
          ) : (
            <Button
              size="sm"
              aria-label={t('srp.settings.hullRules.addNamed', { name: hull.name })}
              onClick={() => onAdd(hull.scope, hull.id)}
            >
              {t('srp.settings.hullRules.add')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
