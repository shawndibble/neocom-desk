import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Popover, PopoverAnchor, PopoverContent } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useApplyUpdate } from '@/features/settings/useUpdateState';
import { useUpdateStatus } from './updateAvailable';

/**
 * The desktop rail's Upgrade icon, at the right end of the Settings row. Shown
 * only while a newer build waits; one press applies it (`forceUpdate`, behind
 * the boot cover) with no trip into Settings. When the page stays up, the
 * reason is read out and replaces the tooltip.
 *
 * Each time a build is found it also opens a small callout pointing at the icon,
 * so a tab left open notices it. The callout has no button of its own: the icon
 * it points at applies. It never takes focus and never reloads anything; a
 * press outside (the icon included) or Escape dismisses it.
 */
export function RailUpgradeButton() {
  const { t } = useTranslation();
  const available = useUpdateStatus((state) => state.status === 'available');
  const { updating, notice, update } = useApplyUpdate();
  // `available` only clears with a reload, so a dismissal is keyed to `found`:
  // a second, different build found in the same tab opens the callout again.
  const found = useUpdateStatus((state) => state.found);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  if (!available) return null;
  return (
    <>
      <Popover open={dismissedAt !== found} onOpenChange={(open) => !open && setDismissedAt(found)}>
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
          sideOffset={8}
          arrow
          // Called out against the rail: larger bold text in an accent border,
          // its arrow outlined to match (the arrow's own stroke is `line`).
          className="max-w-64 border-accent! px-3 py-2 text-sm font-semibold [&_svg]:stroke-accent"
          // A callout never takes focus from where the pilot is working.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Focus moving elsewhere is not an answer; a press outside or Escape is.
          onFocusOutside={(event) => event.preventDefault()}
        >
          <p>{t('nav.upgradeCallout')}</p>
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
