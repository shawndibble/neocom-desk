/**
 * "Retarget group" (issue #632): a bulk write to every checked member plan's
 * own hub/facility/security/build-system, plus the group's own snapshot of
 * what was applied. Two steps, one Save/Apply each — editing the form fields
 * writes nothing until Apply, matching Build Location's own "Override" fold
 * (CONTEXT.md).
 *
 * The fields move as one bundle: there is no per-field apply, the same
 * rule `facilityDefaults.ts` documents for its packed record ("splitting them
 * lets the fields drift into a combination the pilot never chose").
 *
 * The form reuses the plan page's Build Location search: picking a station or
 * structure fills the facility, system and security the way it does there, and
 * a structure also shows its rig slots and tax.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  TextInput,
} from '@/components/ui';
import {
  FACILITY_PRESETS,
  RIG_KIND_OPTIONS,
  resolveRigFit,
  setRigSlot,
  type FacilityKind,
  type RigKind,
} from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import { BuildSystemInput } from './BuildSystemInput';
import { BuildLocationPicker } from './BuildLocationPicker';
import { buildLocationLabel } from './buildLocationLabel';
import { rigKindLabelKey } from './rigFitLabels';
import type { BuildGroup, BuildGroupSnapshot } from './buildGroups';

export type RetargetTarget = Omit<BuildGroupSnapshot, 'appliedAt'>;

interface RetargetGroupDialogProps {
  group: BuildGroup;
  plans: readonly BuildPlanRecord[];
  onApply: (target: RetargetTarget, planIds: string[]) => void;
  onClose: () => void;
}

/**
 * A hand edit to the facility or system no longer describes the place the
 * search picked, so the pick is dropped — `clearedBuildLocation` on the plan page.
 */
const CLEARED_BUILD_LOCATION = { buildLocationId: undefined, buildLocationName: undefined };

/** What a non-structure facility has no use for — an NPC station has no rigs and a CCP-fixed tax. */
const CLEARED_STRUCTURE_FIELDS = { rigFit: undefined, facilityTaxPct: undefined };

function initialTarget(group: BuildGroup): RetargetTarget {
  if (group.snapshot) {
    // Rest-spread rather than a field list, so a field added to the snapshot
    // reaches the form without a second edit here; `appliedAt` is the
    // timestamp Apply stamps afresh, not part of the target.
    const { appliedAt, ...target } = group.snapshot;
    void appliedAt;
    return target;
  }
  return {
    hubId: DEFAULT_TRADE_HUB.id,
    facility: 'npcStation',
    security: DEFAULT_TRADE_HUB.security,
  };
}

export function RetargetGroupDialog({ group, plans, onApply, onClose }: RetargetGroupDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [target, setTarget] = useState<RetargetTarget>(() => initialTarget(group));
  // Held as typed and committed on blur, like the plan page's tax field, so a
  // half-typed "1." is not rewritten under the cursor.
  // `taxEdited` keeps a bare focus-and-blur from committing the displayed 0:
  // an undefined tax means "leave each plan's own alone".
  const [taxText, setTaxText] = useState(() => String(target.facilityTaxPct ?? 0));
  const [taxEdited, setTaxEdited] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(plans.map((p) => p.id))
  );

  const hub = getTradeHub(target.hubId) ?? DEFAULT_TRADE_HUB;
  const facilityPreset = FACILITY_PRESETS[target.facility];
  // What the search box reads while nothing is typed: the picked place, named
  // the same way a plan's own box names it.
  const selectedLabel =
    target.buildLocationId === undefined
      ? null
      : buildLocationLabel(
          target.buildLocationName ?? null,
          target.facility,
          target.buildSystemName ?? hub.systemName,
          t
        );

  function toggle(planId: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  function changeFacility(facility: FacilityKind, patch: Partial<RetargetTarget>) {
    const structure = FACILITY_PRESETS[facility].structure;
    setTarget((current) => ({
      ...current,
      facility,
      ...patch,
      ...(structure ? {} : CLEARED_STRUCTURE_FIELDS),
    }));
    if (!structure) setTaxText('0');
  }

  function commitTax() {
    if (!taxEdited) return;
    setTaxEdited(false);
    const n = Number(taxText.replace(',', '.'));
    if (taxText.trim() === '' || !Number.isFinite(n)) {
      setTaxText(String(target.facilityTaxPct ?? 0));
      return;
    }
    const facilityTaxPct = Math.min(100, Math.max(0, n));
    setTaxText(String(facilityTaxPct));
    setTarget((current) => ({ ...current, facilityTaxPct }));
  }

  return (
    <Modal open onClose={onClose} title={t('industry.retargetGroup', { name: group.name })}>
      {step === 'form' ? (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-text-dim">{t('industry.retargetFormHint')}</p>

          {/* The search offers manufacturing places only — a Build Group is a set of
            things being built (issue #460). The facility list below stays
            unfiltered, as it was before the search arrived. */}
          <BuildLocationPicker
            activity="manufacturing"
            idPrefix="retarget-location"
            summary={t('industry.buildLocationSummary', {
              facility: facilityPreset.name,
              system: target.buildSystemName ?? hub.systemName,
              security: t(`industry.${target.security}`),
            })}
            selectedLabel={selectedLabel}
            onPick={(option) =>
              changeFacility(option.facility, {
                security: option.security,
                buildSystemId: option.systemId,
                buildSystemName: option.systemName,
                buildLocationId: option.structureId,
                buildLocationName: option.name ?? undefined,
              })
            }
          >
            <label className="flex flex-col gap-1">
              {t('industry.facility')}
              <Select
                value={target.facility}
                onValueChange={(value) =>
                  changeFacility(value as FacilityKind, CLEARED_BUILD_LOCATION)
                }
              >
                <SelectTrigger aria-label={t('industry.facility')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(FACILITY_PRESETS).map((f) => (
                    <SelectItem key={f.kind} value={f.kind}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <BuildSystemInput
              systemName={target.buildSystemName}
              hubSystemName={hub.systemName}
              securityLabel={t(`industry.${target.security}`)}
              onChange={(system) =>
                setTarget((current) => ({
                  ...current,
                  buildSystemId: system?.id,
                  buildSystemName: system?.name,
                  ...CLEARED_BUILD_LOCATION,
                  security: system === null ? hub.security : (system.security ?? current.security),
                }))
              }
            />
          </BuildLocationPicker>

          <label className="flex flex-col gap-1">
            {t('industry.tradeHub')}
            <Select
              value={target.hubId}
              onValueChange={(value) => {
                const nextHub = getTradeHub(value as BuildPlanRecord['hubId']) ?? DEFAULT_TRADE_HUB;
                setTarget((current) => ({
                  ...current,
                  hubId: nextHub.id,
                  // Follows the hub only while no build system is named —
                  // once one is, the security band is the system's, the
                  // same rule `BuildSystemInput`'s own caller applies.
                  ...(current.buildSystemId === undefined ? { security: nextHub.security } : {}),
                }));
              }}
            >
              <SelectTrigger aria-label={t('industry.tradeHub')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRADE_HUBS.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {/* Only a player structure has rig slots or an owner-set tax — the same
            rule the plan page applies. Left untouched, each plan keeps its own. */}
          {facilityPreset.structure && (
            <>
              <div className="flex flex-col gap-1">
                <span>{t('industry.rigFitLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {resolveRigFit({ rigFit: target.rigFit }).map((kind, slot) => (
                    // A slot's position is its identity, so the index is a stable key.
                    <Select
                      key={slot}
                      value={kind}
                      onValueChange={(value) =>
                        setTarget((current) => ({
                          ...current,
                          rigFit: setRigSlot(
                            resolveRigFit({ rigFit: current.rigFit }),
                            slot,
                            value as RigKind
                          ),
                        }))
                      }
                    >
                      <SelectTrigger aria-label={t('industry.rigSlotLabel', { slot: slot + 1 })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RIG_KIND_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(rigKindLabelKey(option))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                {t('industry.facilityTax')}
                <TextInput
                  size="sm"
                  inputMode="decimal"
                  value={taxText}
                  onChange={(e) => {
                    setTaxText(e.target.value);
                    setTaxEdited(true);
                  }}
                  onBlur={commitTax}
                />
              </label>
            </>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" onClick={onClose}>
              {t('industry.cancel')}
            </Button>
            <Button size="sm" onClick={() => setStep('preview')}>
              {t('industry.retargetContinue')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-text-dim">{t('industry.retargetPreviewHint')}</p>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {plans.map((plan) => (
              <li key={plan.id} className="flex items-center gap-2 px-1 py-1.5">
                <Checkbox
                  id={`retarget-plan-${plan.id}`}
                  checked={checked.has(plan.id)}
                  onChange={() => toggle(plan.id)}
                />
                <label htmlFor={`retarget-plan-${plan.id}`} className="flex flex-1 flex-col">
                  <span>{plan.name}</span>
                  <span className="text-text-dim">
                    {plan.buildSystemName
                      ? t('industry.retargetCurrentValuesWithSystem', {
                          hub: getTradeHub(plan.hubId)?.name ?? plan.hubId,
                          facility: FACILITY_PRESETS[plan.facility].name,
                          security: t(`industry.${plan.security}`),
                          buildSystem: plan.buildSystemName,
                        })
                      : t('industry.retargetCurrentValues', {
                          hub: getTradeHub(plan.hubId)?.name ?? plan.hubId,
                          facility: FACILITY_PRESETS[plan.facility].name,
                          security: t(`industry.${plan.security}`),
                        })}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between gap-2">
            <Button size="sm" onClick={() => setStep('form')}>
              {t('industry.retargetBack')}
            </Button>
            <div className="flex gap-2">
              <Button size="sm" onClick={onClose}>
                {t('industry.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => onApply(target, [...checked])}
                disabled={checked.size === 0}
              >
                {t('industry.retargetApply')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
