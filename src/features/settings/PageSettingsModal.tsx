/**
 * A page's own settings, edited in place: the same form Settings renders for
 * that page's section, in a modal, with a way through to the full section. A
 * page with a ⋮ menu opens it from a "Settings" item there; a page without
 * one gets `PageSettingsButton`, a gear in its header, rather than a ⋮ menu
 * holding one item.
 */
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
  /** The page's name, for the title ("Industry settings"). */
  pageName: string;
  /** The Settings section the "All settings" link opens. */
  section: SettingsSectionId;
  /** The page's settings form(s) — the ones Settings renders for `section`. */
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

/** A page header's gear: opens `PageSettingsModal` for a page with no ⋮ menu to hold it. */
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
