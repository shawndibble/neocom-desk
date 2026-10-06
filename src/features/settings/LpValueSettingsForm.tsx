import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Fields, IskInput, Spinner } from '@/components/ui';
import { DEFAULT_LP_VALUE, useLpValue } from '@/features/loyalty/lpValue';
import { DefaultsSyncHint } from './settingsFields';
import { useHydratedStore } from './useHydratedStore';

/**
 * The pilot's LP Value as one labelled field: the same store (`useLpValue`)
 * everywhere it is edited — Settings → Market, the LP Store's settings modal
 * and the Blueprint Acquisition modal — so the three can never disagree.
 * Blank or 0 means "use each store's market rate".
 */
export function LpValueField({ id }: { id: string }) {
  const { t } = useTranslation();
  const lpValue = useLpValue((state) => state.value);
  const setLpValue = useLpValue((state) => state.setValue);
  const hydrated = useHydratedStore(useLpValue);
  // What is typed stays local until blur/Enter: one write per edit, and a
  // price elsewhere never flickers through "1", "15", "150" on the way to 1500.
  const [draft, setDraft] = useState<string | null>(null);
  const [parseable, setParseable] = useState(true);
  // Remounts the input so a revert shows the stored rate even when the
  // stored value is unchanged from what the input last committed.
  const [resetKey, setResetKey] = useState(0);

  function revert() {
    setDraft(null);
    setParseable(true);
    setResetKey((k) => k + 1);
  }

  function commit() {
    if (!parseable) return revert();
    if (draft === null) return;
    const next = draft === '' ? DEFAULT_LP_VALUE : Number(draft);
    if (!Number.isFinite(next) || next < 0) return revert();
    setDraft(null);
    if (next !== lpValue) void setLpValue(next);
  }

  return (
    <Field label={t('settings.lpValueLabel')} htmlFor={id} note={t('settings.lpValueHint')}>
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
              // Keep Escape from also closing a modal the field sits in.
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

/** LP Value on its own: Settings → Market, and the LP Store's settings modal. */
export function LpValueSettingsForm() {
  const hydrated = useHydratedStore(useLpValue);
  if (!hydrated) return <Spinner />;
  return (
    <div className="space-y-4">
      <DefaultsSyncHint />
      <Fields variant="form">
        <LpValueField id="settings-lp-value" />
      </Fields>
    </div>
  );
}
