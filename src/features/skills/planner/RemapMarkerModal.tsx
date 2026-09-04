/**
 * Remap Marker (CONTEXT.md) manual attribute editor: lets the user override
 * what a marker targets instead of only ever accepting the optimizer's
 * choice. EVE's remap rules (`engine/attributeBaseline.ts`) are a fixed
 * budget, not a ceiling — every legal sheet totals exactly
 * `BASE_ATTRIBUTE_TOTAL`, each attribute in [`BASE_ATTRIBUTE_MIN`,
 * `BASE_ATTRIBUTE_MAX`] — so this is an allocator the user fills to zero
 * remaining, not a form that merely rejects out-of-range numbers.
 */
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
  /** This marker's manual override, or `null` if the user has never set one — the two are distinct: only a non-null override offers "Clear override", and clearing one falls back to `computed`, not to `null` itself. */
  override: Attributes | null;
  /** What "Optimize at my markers" currently computes for this marker, if anything — seeds the fields when there's no manual `override` yet. */
  computed: Attributes | undefined;
  /** The character's own base sheet — legal by construction (§`isLegalAttributeSheet`), so it is always a safe starting point when neither `override` nor `computed` has anything to seed from. */
  baseline: Attributes;
  /** Save a manual override; `null` clears it back to whatever the optimizer computes. */
  onSave: (attributes: Attributes | null) => void;
}

/** The five-field allocator itself, plus the remaining-points readout and Save/Clear/Cancel. */
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
  // Re-seed whenever the modal transitions to open (including re-opening on
  // a different marker) — otherwise a second marker would inherit the first
  // one's half-edited draft instead of its own attributes. Adjusted during
  // render rather than in an effect (react.dev "Adjusting state when a prop
  // changes"): an effect would commit the stale draft for one frame first,
  // and calling setState synchronously inside an effect body is exactly what
  // triggers React's cascading-render warning.
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

  // Deliberately unclamped while typing: clamping every keystroke against a
  // controlled input fights the user mid-entry (typing "25" over a value
  // already inside range re-clamps the leading "2" to the 17 floor before
  // the "5" ever lands, so "25" can never be reached at all). The range is
  // still enforced — just on blur, once there is a finished number to judge
  // — and out-of-range or off-budget totals disable Save in the meantime.
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
    <Modal open={open} onClose={onClose} title={t('plans.markerAttributesModalTitle')}>
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
              <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t(`skills.attr.${name}`)}
              </span>
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
          <Button variant="primary" size="sm" disabled={!canSave} onClick={() => save(draft)}>
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
