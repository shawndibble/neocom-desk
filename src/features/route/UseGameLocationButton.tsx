import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

export function UseGameLocationButton({
  onReset,
  close,
}: {
  onReset: () => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      onClick={() => {
        onReset();
        close();
      }}
    >
      {t('jumpRange.useGameLocation')}
    </Button>
  );
}
