import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';

interface LabelFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Labels already used for this Payee and system, offered as autocomplete. */
  suggestions?: readonly string[];
}

/** The optional free-text "Moon / structure" input on an Assignment. */
export function LabelField({ value, onChange, suggestions = [] }: LabelFieldProps) {
  const { t } = useTranslation();
  const listId = useId();
  return (
    <div className="min-w-0 space-y-1">
      <p className={eyebrowClassName}>{t('miningTax.labelOptionalLabel')}</p>
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('miningTax.labelOptionalLabel')}
        placeholder={t('miningTax.labelPlaceholder')}
        maxLength={80}
        list={suggestions.length > 0 ? listId : undefined}
        className="w-full"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
