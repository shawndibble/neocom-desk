import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Popover, PopoverAnchor, PopoverContent } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useApplyUpdate } from '@/features/settings/useUpdateState';
import { useUpdateStatus } from './updateAvailable';

/**
 * The desktop rail's Upgrade icon, at the right end of the Settings row. Shown
 * only while a newer build waits; one press applies it (`forceUpdate`, behind
 * the boot cover) with no trip into Settings. When the page stays up, the
 * reason is read out and replaces the tooltip.
 *
 * Each time a build is found it also opens a small callout beside the icon, so
 * a tab left open notices it. The callout never takes focus and never reloads
 * anything: a press outside or Escape dismisses it, the button applies.
 */
export function RailUpgradeButton() {
  const { t } = useTranslation();
  const available = useUpdateStatus((state) => state.status === 'available');
  const { updating, notice, update } = useApplyUpdate();
  // `available` only clears with a reload, so one dismissal lasts until the next build is found.
  const [dismissed, setDismissed] = useState(false);
  if (!available) return null;
  return (
    <>
      <Popover open={!dismissed} onOpenChange={(open) => !open && setDismissed(true)}>
        <PopoverAnchor asChild>
          <IconButton
            variant="plain"
            tone="accent"
            size="sm"
            icon={<Icon.Upgrade />}
            label={t('nav.upgrade')}
            tooltip={notice?.text ?? t('nav.upgrade')}
            busy={updating}
            onClick={update}
          />
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="end"
          className="flex max-w-60 flex-col items-start gap-2 p-2 text-xs"
          // A callout never takes focus from where the pilot is working.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Focus moving elsewhere is not an answer; a press outside or Escape is.
          onFocusOutside={(event) => event.preventDefault()}
        >
          <p role="status">{t('nav.upgradeCallout')}</p>
          <Button
            size="sm"
            variant="accent"
            loading={updating}
            onClick={() => {
              setDismissed(true);
              update();
            }}
          >
            {t('settings.updateAction')}
          </Button>
        </PopoverContent>
      </Popover>
      {notice && (
        <span role="status" className="sr-only">
          {notice.text}
        </span>
      )}
    </>
  );
}
