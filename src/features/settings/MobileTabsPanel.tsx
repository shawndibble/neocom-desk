import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, Panel } from '@/components/ui';
import {
  DEFAULT_MOBILE_TABS,
  MOBILE_TAB_CHOICES,
  MOBILE_TAB_COUNT,
  NAV_LABEL_KEYS,
  sortMobileTabs,
  useMobileTabs,
  type MobileTabPath,
} from '@/lib/mobileTabs';

/**
 * Which four links the phone's bottom tab bar holds.
 *
 * Device-local, like the text scale on the Display page and unlike everything in
 * `DefaultsPanel`: this answers for a screen — the one that has a tab bar at
 * all — not for the pilot. Because it cannot leave this device, setting it on a
 * laptop changes nothing on the phone, so `Settings` mounts the panel only
 * below `md` — the breakpoint `Layout` hides the bottom bar at, via the same
 * `useIsNarrow` query, so the panel and the bar cannot drift apart.
 *
 * The chips edit a draft, and the preference is written only when the draft is
 * a full bar of `MOBILE_TAB_COUNT` — a short bar is not a state the nav has.
 * So unpicking one leaves the old bar standing until a replacement is picked,
 * which is also the swap the pilot came to make.
 *
 * Unpicked chips go inert at four rather than silently evicting somebody's
 * choice — with no slots on screen there is no way to say *which* one a fifth
 * pick would replace.
 */
export function MobileTabsPanel() {
  const { t } = useTranslation();
  const tabs = useMobileTabs((state) => state.value);
  const setTabs = useMobileTabs((state) => state.setValue);

  // `null` means "no edit in progress", so the panel follows the stored bar
  // until the pilot touches a chip — including when `App`'s hydration lands
  // after this first render, which a mirrored copy would have painted stale.
  const [pending, setPending] = useState<readonly MobileTabPath[] | null>(null);
  const draft = pending ?? tabs;
  const full = draft.length >= MOBILE_TAB_COUNT;

  function toggle(path: MobileTabPath) {
    const next = draft.includes(path)
      ? draft.filter((chosen) => chosen !== path)
      : sortMobileTabs([...draft, path]);
    if (next.length === MOBILE_TAB_COUNT) {
      setPending(null);
      void setTabs(next);
      return;
    }
    setPending(next);
  }

  function reset() {
    setPending(null);
    void setTabs(DEFAULT_MOBILE_TABS);
  }

  return (
    <Panel title={t('settings.mobileTabs.title')}>
      <div className="space-y-2">
        <p className="max-w-2xl text-xs text-text-dim">{t('settings.mobileTabs.hint')}</p>
        <div
          role="group"
          aria-label={t('settings.mobileTabs.group')}
          className="flex flex-wrap gap-2"
        >
          {MOBILE_TAB_CHOICES.map((path) => {
            const selected = draft.includes(path);
            return (
              <FilterChip
                key={path}
                label={t(NAV_LABEL_KEYS[path])}
                selected={selected}
                disabled={!selected && full}
                tooltip={!selected && full ? t('settings.mobileTabs.full') : undefined}
                onToggle={() => toggle(path)}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-text-dim" aria-live="polite">
            {t('settings.mobileTabs.chosen', { count: draft.length, total: MOBILE_TAB_COUNT })}
          </p>
          <Button size="sm" onClick={reset}>
            {t('settings.mobileTabs.reset')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
