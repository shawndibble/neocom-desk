import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabPanel, Tabs, useTabsId } from '@/components/ui';
import { ICON_SIZE } from '@/components/ui/icons';
import { focusRingInsetClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { screenshotSrc, screenshotSrcSet, type Screenshot } from './screenshots';
import { ScreenshotZoom, ZoomBadge } from './ScreenshotZoom';
import { SHOWCASE_TABS, type ShowcaseTab } from './showcaseTabs';

/**
 * The features band: tabs by area, each showing one large, uncropped
 * screenshot in a window frame beside what that area does, and, where the tab
 * bundles more than its own name, an "Also includes" row of the other features.
 * Selecting a picture enlarges it.
 */
export function FeatureShowcase() {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [tabId, setTabId] = useState(SHOWCASE_TABS[0].id);
  const [zoomed, setZoomed] = useState<Screenshot | null>(null);
  const tab = SHOWCASE_TABS.find((entry) => entry.id === tabId) ?? SHOWCASE_TABS[0];
  // A feature that only repeats the tab's own name says nothing the tab does not.
  const tabName = t(`login.showcase.${tab.id}.tab`);
  const alsoIncludes = tab.features.filter(
    ({ key }) => t(`login.features.${key}.name`) !== tabName
  );
  return (
    <div className="mt-6">
      <Tabs
        tabsId={tabsId}
        label={t('login.showcase.label')}
        tabs={SHOWCASE_TABS.map(({ id }) => ({ id, label: t(`login.showcase.${id}.tab`) }))}
        value={tabId}
        onChange={setTabId}
      />
      <TabPanel tabsId={tabsId} tabId={tab.id} className="mt-6">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <WindowFrame tab={tab} onOpen={setZoomed} />
          <div>
            <ul className="space-y-3 text-sm">
              {tab.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-accent" />
                  <span className="text-text-dim">{t(`login.showcase.${tab.id}.${bullet}`)}</span>
                </li>
              ))}
            </ul>
            {alsoIncludes.length > 0 && (
              <>
                <p className={cx(eyebrowClassName, 'mt-6')}>{t('login.showcase.covers')}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {alsoIncludes.map(({ icon: Icon, key }) => (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-xs border border-line bg-panel px-3 py-1.5 text-sm"
                    >
                      <Icon
                        size={ICON_SIZE.md}
                        aria-hidden="true"
                        className="shrink-0 text-accent"
                      />
                      {t(`login.features.${key}.name`)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </TabPanel>
      <ScreenshotZoom shot={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

/** What selecting a picture does, appended to its alt text (a button's children are presentational). */
function useEnlargeLabel() {
  const { t } = useTranslation();
  return (shot: Screenshot) =>
    t('login.screenshotEnlarge', { alt: t(`login.screenshots.${shot.key}.alt`) });
}

/** A window around the capture: a title bar carrying the caption, then the whole picture, never cropped. */
function WindowFrame({ tab, onOpen }: { tab: ShowcaseTab; onOpen: (shot: Screenshot) => void }) {
  const { t } = useTranslation();
  const enlargeLabel = useEnlargeLabel();
  const { shot } = tab;
  return (
    <div className="relative border border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <span aria-hidden="true" className="flex gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="size-2 rounded-full bg-line" />
          ))}
        </span>
        <span className="truncate font-mono text-[0.6875rem] tracking-widest text-text-dim uppercase">
          {t(`login.screenshots.${shot.key}.caption`)}
        </span>
      </div>
      <ShotButton shot={shot} label={enlargeLabel(shot)} onOpen={() => onOpen(shot)} />
    </div>
  );
}

/** A capture that opens enlarged; explicit width/height reserve its box before the lazy image arrives. */
function ShotButton({
  shot,
  label,
  onOpen,
}: {
  shot: Screenshot;
  label: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cx('group relative block w-full cursor-zoom-in', focusRingInsetClassName)}
    >
      <img
        src={screenshotSrc(shot)}
        srcSet={screenshotSrcSet(shot)}
        sizes="(min-width: 1024px) min(calc(100vw - 24rem), 56rem), calc(100vw - 2rem)"
        alt={t(`login.screenshots.${shot.key}.alt`)}
        width={shot.size.width}
        height={shot.size.height}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
      />
      <ZoomBadge />
    </button>
  );
}
