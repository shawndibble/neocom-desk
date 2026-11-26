import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, LiveStatus } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { writeToClipboard } from '@/lib/clipboard';

export function CopyContractIdButton({ contractId }: { contractId: number }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <LiveStatus>{copied && t('contractDetail.contractIdCopied')}</LiveStatus>
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
    </>
  );
}
