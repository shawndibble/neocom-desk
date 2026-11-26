import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { IconButton, Modal } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { useIsPhone } from '@/lib/useIsPhone';
import type { SettingsSectionId } from './sections';

interface PageSettingsModalProps {
  open: boolean;
  onClose: () => void;
  pageName: string;
  section: SettingsSectionId;
  children: ReactNode;
}

export function PageSettingsModal({
  open,
  onClose,
  pageName,
  section,
  children,
}: PageSettingsModalProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('pageSettings.title', { page: pageName })}
      placement={isPhone ? 'sheet' : 'center'}
    >
      <div className="space-y-4">
        {children}
        <div className="flex justify-end border-t border-line pt-3">
          <Link to={tabPath(SETTINGS_TABS, section)} className={cx(inlineLinkClassName, 'text-sm')}>
            {t('pageSettings.allSettings')}
          </Link>
        </div>
      </div>
    </Modal>
  );
}

export function PageSettingsButton(props: Omit<PageSettingsModalProps, 'open' | 'onClose'>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={<Icon.Settings />}
        label={t('pageSettings.open', { page: props.pageName })}
        onClick={() => setOpen(true)}
      />
      <PageSettingsModal {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
