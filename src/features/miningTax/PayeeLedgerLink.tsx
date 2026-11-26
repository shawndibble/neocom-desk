import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

export function PayeeLedgerLink({
  name,
  onOpenLedger,
  className,
}: {
  name: string;
  onOpenLedger?: (() => void) | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!onOpenLedger) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      className={cx(inlineLinkClassName, className)}
      onClick={onOpenLedger}
      aria-label={t('miningTax.ledger.openFor', { payee: name })}
    >
      {name}
    </button>
  );
}
