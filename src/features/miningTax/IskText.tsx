import { Trans } from 'react-i18next';
import { IskAmount } from '@/components/ui';

export function IskText({ value }: { value: number }) {
  return (
    <Trans
      i18nKey="miningTax.iskFigure"
      components={{
        value: <IskAmount value={value} decimals={0} />,
        unit: <span aria-hidden="true" />,
      }}
    />
  );
}
