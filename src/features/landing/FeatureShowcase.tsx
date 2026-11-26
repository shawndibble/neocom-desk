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
import { TourVideoLink } from './TourVideo';

export function FeatureShowcase() {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [tabId, setTabId] = useState(SHOWCASE_TABS[0].id);
  const [zoomed, setZoomed] = useState<Screenshot | null>(null);
  const tab = SHOWCASE_TABS.find((entry) => entry.id === tabId) ?? SHOWCASE_TABS[0];
  return (
    <div className="mt-8">
      <Tabs
        tabsId={tabsId}
        label={t('login.showcase.label')}
        tabs={SHOWCASE_TABS.map(({ id }) => ({ id, label: t(`login.showcase.${id}.tab`) }))}
        value={tabId}
        onChange={setTabId}
      />
      <TabPanel tabsId={tabsId} tabId={tab.id} className="mt-7">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          <WindowFrame tab={tab} onOpen={setZoomed} />
          <div>
            <ul className="divide-y divide-line border-y border-line">
              {tab.items.map((item) => (
                <li key={item} className="py-4">
                  <h3 className="text-base font-semibold text-balance">
                    {t(`login.showcase.${tab.id}.${item}.question`)}
                  </h3>
                  <p className="mt-1.5 text-sm text-text-dim">
                    {t(`login.showcase.${tab.id}.${item}.answer`)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className={eyebrowClassName}>{t('login.showcase.covers')}</span>
              {tab.features.map(({ icon: Icon, key }) => (
                <span
                  key={key}
                  className="flex items-center gap-2 rounded-xs border border-line bg-panel px-3 py-1.5 text-sm"
                >
                  <Icon size={ICON_SIZE.md} aria-hidden="true" className="shrink-0 text-accent" />
                  {t(`login.features.${key}.name`)}
                </span>
              ))}
            </div>
            {tab.videos.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className={eyebrowClassName}>{t('login.showcase.watch')}</span>
                {tab.videos.map((video) => (
                  <TourVideoLink key={video} video={video} variant="button" />
                ))}
              </div>
            )}
          </div>
        </div>
      </TabPanel>
      <ScreenshotZoom shot={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

function useEnlargeLabel() {
  const { t } = useTranslation();
  return (shot: Screenshot) =>
    t('login.screenshotEnlarge', { alt: t(`login.screenshots.${shot.key}.alt`) });
}

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
