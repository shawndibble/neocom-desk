import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

/** A system picker's footer button: drops a hand-picked start and goes back to the game location. */
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
