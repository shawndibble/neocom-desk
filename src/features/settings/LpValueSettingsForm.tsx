import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Fields, IskInput } from '@/components/ui';
import { DEFAULT_LP_VALUE, useLpValue } from '@/features/loyalty/lpValue';
import { SettingsFormLoading } from './settingsFields';
import { useHydratedStore } from '@/lib/useHydratedStore';

export function LpValueField({ id, note }: { id: string; note?: string }) {
  const { t } = useTranslation();
  const lpValue = useLpValue((state) => state.value);
  const setLpValue = useLpValue((state) => state.setValue);
  const hydrated = useHydratedStore(useLpValue);
  const [draft, setDraft] = useState<string | null>(null);
  const [parseable, setParseable] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  function revert() {
    setDraft(null);
    setParseable(true);
    setResetKey((k) => k + 1);
  }

  function commit() {
    if (!parseable) return;
    if (draft === null) return;
    const next = draft === '' ? DEFAULT_LP_VALUE : Number(draft);
    if (!Number.isFinite(next) || next < 0) return revert();
    setDraft(null);
    if (next !== lpValue) void setLpValue(next);
  }

  return (
    <Field label={t('settings.lpValueLabel')} htmlFor={id} note={note ?? t('settings.lpValueHint')}>
      <div className="flex flex-wrap items-start gap-2">
        <IskInput
          key={resetKey}
          id={id}
          size="sm"
          className="w-36"
          disabled={!hydrated}
          placeholder={String(DEFAULT_LP_VALUE)}
          value={draft ?? (lpValue === DEFAULT_LP_VALUE ? '' : String(lpValue))}
          onChange={setDraft}
          onParseableChange={setParseable}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape' && draft !== null) {
              e.stopPropagation();
              revert();
            }
          }}
        />
        {lpValue !== DEFAULT_LP_VALUE && (
          <Button size="sm" onClick={() => void setLpValue(DEFAULT_LP_VALUE)}>
            {t('settings.lpValueUseMarket')}
          </Button>
        )}
      </div>
    </Field>
  );
}

export function LpValueSettingsForm() {
  const hydrated = useHydratedStore(useLpValue);
  if (!hydrated) return <SettingsFormLoading />;
  return (
    <div className="space-y-4">
      <Fields variant="form">
        <LpValueField id="settings-lp-value" />
      </Fields>
    </div>
  );
}
