import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { writeToClipboard } from '@/lib/clipboard';

/**
 * The contract ID exists to be pasted — into an in-game search, a chat channel,
 * a note — and selecting a number out of a definition list by hand is the one
 * thing a reader should not have to do with it. Shared by both contract detail
 * modals (the character's and the public one), where the ID is read.
 */
export function CopyContractIdButton({ contractId }: { contractId: number }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <IconButton
      variant="plain"
      size="sm"
      label={t('contractDetail.copyContractId')}
      icon={
        copied ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} />
        ) : (
          <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
        )
      }
      onClick={() => {
        void writeToClipboard(String(contractId));
        setCopied(true);
      }}
    />
  );
}
