import { useTranslation } from 'react-i18next';
import { InfoTooltip } from './Tooltip';

interface ContextMenuHintProps {
  /** The section's own title, e.g. "Active Jobs" — becomes "About Active Jobs". */
  label: string;
}

/**
 * Sits in a panel's title-bar action cluster wherever its rows carry a
 * `ContextMenu`: a static "?" that explains the right-click/long-press is
 * there, since nothing about a plain row otherwise says so.
 */
export function ContextMenuHint({ label }: ContextMenuHintProps) {
  const { t } = useTranslation();
  return (
    <InfoTooltip label={t('common.aboutLabel', { label })} content={t('common.contextMenuHint')} />
  );
}
