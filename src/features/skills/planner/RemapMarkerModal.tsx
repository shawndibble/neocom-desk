import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import {
  BASE_ATTRIBUTE_MAX,
  BASE_ATTRIBUTE_MIN,
  BASE_ATTRIBUTE_TOTAL,
  isLegalAttributeSheet,
} from '@/engine/attributeBaseline';
import { ATTRIBUTE_NAMES } from '@/engine/optimizer';
import type { AttributeName, Attributes } from '@/engine/types';

function clamp(value: number): number {
  return Math.min(BASE_ATTRIBUTE_MAX, Math.max(BASE_ATTRIBUTE_MIN, value));
}

function total(attributes: Attributes): number {
  return ATTRIBUTE_NAMES.reduce((sum, name) => sum + attributes[name], 0);
}

interface RemapMarkerModalProps {
  open: boolean;
  onClose: () => void;
  override: Attributes | null;
  computed: Attributes | undefined;
  baseline: Attributes;
  onSave: (attributes: Attributes | null) => void;
}

export function RemapMarkerModal({
  open,
  onClose,
  override,
  computed,
  baseline,
  onSave,
}: RemapMarkerModalProps) {
  const { t } = useTranslation();
  const initial = override ?? computed ?? baseline;
  const [draft, setDraft] = useState<Attributes>(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initial);
  }

  const remaining = BASE_ATTRIBUTE_TOTAL - total(draft);
  const outOfRange = ATTRIBUTE_NAMES.some(
    (name) => draft[name] < BASE_ATTRIBUTE_MIN || draft[name] > BASE_ATTRIBUTE_MAX
  );
  const canSave = isLegalAttributeSheet(draft);

  function setValue(name: AttributeName, raw: string) {
    if (raw === '') {
      setDraft((prev) => ({ ...prev, [name]: 0 }));
      return;
    }
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed)) return;
    setDraft((prev) => ({ ...prev, [name]: parsed }));
  }

  function clampOnBlur(name: AttributeName) {
    setDraft((prev) => ({ ...prev, [name]: clamp(prev[name]) }));
  }

  function save(attributes: Attributes | null) {
    onSave(attributes);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('plans.markerAttributesModalTitle')}
      dirty={ATTRIBUTE_NAMES.some((name) => draft[name] !== initial[name])}
    >
      <div className="space-y-3 text-xs">
        <p className="text-text-dim">
          {t('plans.markerAttributesModalHint', {
            total: BASE_ATTRIBUTE_TOTAL,
            min: BASE_ATTRIBUTE_MIN,
            max: BASE_ATTRIBUTE_MAX,
          })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {ATTRIBUTE_NAMES.map((name) => (
            <label key={name} className="flex flex-col gap-1">
              <span className={eyebrowClassName}>{t(`skills.attr.${name}`)}</span>
              <TextInput
                size="sm"
                type="number"
                inputMode="numeric"
                min={BASE_ATTRIBUTE_MIN}
                max={BASE_ATTRIBUTE_MAX}
                value={draft[name]}
                onChange={(e) => setValue(name, e.target.value)}
                onBlur={() => clampOnBlur(name)}
              />
            </label>
          ))}
        </div>
        <p
          role="status"
          className={
            remaining < 0 || (remaining === 0 && outOfRange)
              ? 'font-semibold text-danger'
              : remaining > 0
                ? 'text-warning'
                : 'text-text-dim'
          }
        >
          {remaining > 0
            ? t('plans.markerAttributesRemaining', { count: remaining })
            : remaining < 0
              ? t('plans.markerAttributesOverBudget', { count: -remaining })
              : outOfRange
                ? t('plans.markerAttributesOutOfRange', {
                    min: BASE_ATTRIBUTE_MIN,
                    max: BASE_ATTRIBUTE_MAX,
                  })
                : t('plans.markerAttributesRemaining', { count: 0 })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            aria-disabled={!canSave || undefined}
            onClick={() => save(draft)}
          >
            {t('plans.markerAttributesSave')}
          </Button>
          {override !== null && (
            <Button size="sm" onClick={() => save(null)}>
              {t('plans.markerAttributesClear')}
            </Button>
          )}
          <Button size="sm" onClick={onClose}>
            {t('plans.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
