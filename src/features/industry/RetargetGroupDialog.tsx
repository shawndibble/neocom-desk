import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
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
  Tooltip,
} from '@/components/ui';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  setRigSlot,
  type FacilityKind,
  type RigKind,
} from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import { newPlanHub } from './newBuildPlan';
import { BuildSystemInput } from './BuildSystemInput';
import { BuildLocationPicker } from './BuildLocationPicker';
import { clampPct } from '@/lib/clampPct';
import { buildLocationLabel } from './buildLocationLabel';
import { RigKindOptions } from './RigKindOptions';
import { RigMatchHelper } from './RigMatchHelper';
import type { BuildGroup, BuildGroupSnapshot } from './buildGroups';

export type RetargetTarget = Omit<BuildGroupSnapshot, 'appliedAt'>;

interface RetargetGroupDialogProps {
  group: BuildGroup;
  plans: readonly BuildPlanRecord[];
  onApply: (target: RetargetTarget, planIds: string[]) => void;
  onClose: () => void;
}

const CLEARED_BUILD_LOCATION = { buildLocationId: undefined, buildLocationName: undefined };

const CLEARED_STRUCTURE_FIELDS = { rigFit: undefined, facilityTaxPct: undefined };

function initialTarget(group: BuildGroup): RetargetTarget {
  if (group.snapshot) {
    const { appliedAt, ...target } = group.snapshot;
    void appliedAt;
    return target;
  }
  const hub = newPlanHub();
  return { hubId: hub.id, facility: 'npcStation', security: hub.security };
}

export function RetargetGroupDialog({ group, plans, onApply, onClose }: RetargetGroupDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [initial] = useState(() => initialTarget(group));
  const [target, setTarget] = useState<RetargetTarget>(initial);
  const [taxText, setTaxText] = useState(() => String(target.facilityTaxPct ?? 0));
  const [taxEdited, setTaxEdited] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(plans.map((p) => p.id))
  );

  const hub = getTradeHub(target.hubId) ?? DEFAULT_TRADE_HUB;
  const facilityPreset = FACILITY_PRESETS[target.facility];
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
    if (!structure || patch.buildLocationId !== undefined) {
      setTaxText('0');
      setTaxEdited(false);
    }
  }

  function commitTax() {
    if (!taxEdited) return;
    setTaxEdited(false);
    const n = Number(taxText.replace(',', '.'));
    if (taxText.trim() === '' || !Number.isFinite(n)) {
      setTaxText(String(target.facilityTaxPct ?? 0));
      return;
    }
    const facilityTaxPct = clampPct(n);
    setTaxText(String(facilityTaxPct));
    setTarget((current) => ({ ...current, facilityTaxPct }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('industry.retargetGroup', { name: group.name })}
      dirty={
        taxEdited ||
        (Object.keys({ ...initial, ...target }) as (keyof RetargetTarget)[]).some(
          (key) => String(target[key]) !== String(initial[key])
        )
      }
    >
      {step === 'form' ? (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-text-dim">{t('industry.retargetFormHint')}</p>

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
                ...CLEARED_STRUCTURE_FIELDS,
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

          {facilityPreset.structure && (
            <>
              <div className="flex flex-col gap-1">
                <span>{t('industry.rigFitLabel')}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {resolveRigFit({ rigFit: target.rigFit }).map((kind, slot) => (
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
                        <RigKindOptions />
                      </SelectContent>
                    </Select>
                  ))}
                  <RigMatchHelper
                    facility={target.facility}
                    security={target.security}
                    onApply={(fit) => setTarget((current) => ({ ...current, rigFit: fit }))}
                  />
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
                <label className={touchCheckboxLabelClassName}>
                  <Checkbox
                    id={`retarget-plan-${plan.id}`}
                    checked={checked.has(plan.id)}
                    onChange={() => toggle(plan.id)}
                  />
                </label>
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
              <Tooltip content={checked.size === 0 ? t('industry.retargetApplyNeedsPlan') : null}>
                <Button
                  size="sm"
                  onClick={() => onApply(target, [...checked])}
                  aria-disabled={checked.size === 0 || undefined}
                >
                  {t('industry.retargetApply')}
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
