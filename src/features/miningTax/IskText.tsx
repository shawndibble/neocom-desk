import { Trans } from 'react-i18next';
import { IskAmount } from '@/components/ui';

/**
 * A whole-ISK figure in a sentence: shorthand with the exact value one gesture away (DESIGN §6).
 * The exact value a screen reader hears already says ISK, so the visible unit is hidden from it.
 */
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
