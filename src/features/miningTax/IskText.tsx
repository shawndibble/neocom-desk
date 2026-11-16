import { Trans } from 'react-i18next';
import { IskAmount } from '@/components/ui';

/** A whole-ISK figure in a sentence: shorthand with the exact value one gesture away (DESIGN §6). */
export function IskText({ value }: { value: number }) {
  return (
    <Trans
      i18nKey="miningTax.iskFigure"
      components={{ value: <IskAmount value={value} decimals={0} /> }}
    />
  );
}
