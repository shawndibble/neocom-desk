import { useTranslation } from 'react-i18next';
import { Panel, FilterChip } from '@/components/ui';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { SHORTCUTS } from '@/lib/shortcuts';

const FONT_SCALE_LABEL_KEYS = {
  0.875: 'settings.fontScaleSmall',
  1: 'settings.fontScaleDefault',
  1.125: 'settings.fontScaleLarge',
  1.25: 'settings.fontScaleExtraLarge',
} as const satisfies Record<FontScale, string>;

export function Settings() {
  const { t } = useTranslation();
  const scale = useFontScale((state) => state.value);
  const setScale = useFontScale((state) => state.setValue);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold tracking-widest uppercase">{t('settings.title')}</h1>
      <Panel title={t('settings.displayTitle')}>
        <div className="space-y-2">
          <p className="text-xs text-text-dim">{t('settings.fontScaleHint')}</p>
          <div
            role="group"
            aria-label={t('settings.fontScaleLabel')}
            className="flex flex-wrap gap-2"
          >
            {FONT_SCALE_STEPS.map((step) => (
              <FilterChip
                key={step}
                label={t(FONT_SCALE_LABEL_KEYS[step])}
                selected={scale === step}
                onToggle={() => void setScale(step)}
              />
            ))}
          </div>
        </div>
      </Panel>
      <Panel title={t('shortcuts.title')}>
        <dl className="divide-y divide-line text-xs">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.id} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-text-dim">{t(shortcut.descriptionKey)}</dt>
              <dd>
                <kbd className="rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[0.6875rem] text-text">
                  {shortcut.displayKey}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
