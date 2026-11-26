import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, LiveStatus, Popover, PopoverAnchor, PopoverContent } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useApplyUpdate } from '@/features/settings/useUpdateState';
import { useUpdateStatus } from './updateAvailable';

export function RailUpgradeButton() {
  const { t } = useTranslation();
  const available = useUpdateStatus((state) => state.status === 'available');
  const { updating, notice, update } = useApplyUpdate();
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
          aria-label={t('nav.upgrade')}
          className="max-w-64 border-accent! px-3 py-2 text-sm font-semibold [&_svg]:stroke-accent"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
        >
          <p>{t('nav.upgradeCallout')}</p>
        </PopoverContent>
      </Popover>
      <LiveStatus>{notice?.text}</LiveStatus>
    </>
  );
}
