/**
 * Item Detail (CONTEXT.md round 6): fitting cost, volume, bonuses and
 * description for one item — the things a shopper checks before deciding
 * whether a price is worth paying. Read live from ESI on open, the one
 * Market Browser panel that needs the network for its own content — baking
 * every item's attributes into the snapshot would ship a slice of a 16 MB
 * table for a panel that is rarely opened. The snapshot instead carries the
 * small attribute dictionary that turns attribute ids into names/units/categories.
 * Rows whose value is an id rather than a measurement — a required skill, a
 * Group a module can be fitted to — resolve to names through
 * `attributeReferenceNames.ts`, which starts from `skills.json` (public/data,
 * PWA-precached — not the market snapshot vite.config.ts excludes from
 * precache) and only reaches for ESI for ids no local payload covers. A
 * planetary commodity also gets its schematic (pi.json, precached the same
 * way): for those, "how is this made" is the question the modal is opened to
 * answer, and no dogma attribute carries it.
 */
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  IskAmount,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  TypeIcon,
} from '@/components/ui';
import { groupItemAttributes, type AttributeGroup } from '@/engine/market/itemAttributes';
import { parseItemDescription, type DescriptionRun } from '@/engine/market/itemDescription';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import {
  findModifyingSkills,
  postPercentMagnitude,
  type ModifyingSkillEffect,
} from '@/engine/market/skillAttributeEffects';
import type { TrainedSkill } from '@/engine/types';
import { getUniverseType, type UniverseType } from '@/esi/endpoints';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadPi, loadSkillAttributeModifiers, loadSkills } from '@/sde/loadSde';
import type { PiData, SkillAttributeModifierMap } from '@/sde/types';
import { formatDuration } from '@/lib/duration';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { extractRequiredSkills, type RequiredSkill } from '@/features/skills/dogma';
import { SkillRow } from '@/features/skills/SkillRow';
import { skillTrainingStatus } from '@/features/skills/skillStatus';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { useTargetPlan, type TargetPlan } from '@/features/skills/useTargetPlan';
import { loadAttributeReferenceNames } from './attributeReferenceNames';
import { formatAttributeValue, formatVolume } from './format';
import {
  loadOrderBookView,
  useSavedOrderBookLocation,
  type OrderBookLocation,
} from './orderBookView';

export interface ItemDetailModalProps {
  typeId: number;
  itemName: string;
  onClose: () => void;
  /**
   * The location to price at. The Market Browser passes its own effective
   * one (a shared link's hub/region can differ from the saved preference);
   * every other page leaves it out and gets the saved Location Mode and
   * Trade Hub — the same answer the Market Browser and its Compare Drawer
   * give for the item there.
   */
  location?: OrderBookLocation;
}

interface DetailData {
  type: UniverseType;
  /** Skill-requirement rows already excluded — the Required Skills section below owns those instead. */
  groups: AttributeGroup[];
  requiredSkills: RequiredSkill[];
  /** typeID -> name, reused from the same resolution the generic rows already paid for. */
  skillNames: Readonly<Record<number, string>>;
  /** Every skill's name — the popover surfaces skills the item doesn't require, so `skillNames` above isn't enough. */
  allSkillNames: Readonly<Record<number, string>>;
  skillAttributeModifiers: SkillAttributeModifierMap;
  /** Null when pi.json couldn't be read — the rest of the modal is unaffected. */
  pi: PiData | null;
}

/**
 * Distinct from a plain `OrderBookSummary | null`: a region with truly no
 * orders is a valid `'ready'` result (both sides null), which must render
 * differently from `'error'` (the fetch itself failed) — nullability alone
 * can't tell those apart.
 */
type PriceState =
  { status: 'loading' } | { status: 'ready'; summary: OrderBookSummary } | { status: 'error' };

/** Mounted only while open (ImportClipboardDialog's pattern) — mounting is the open signal. */
export function ItemDetailModal({ typeId, itemName, onClose, location }: ItemDetailModalProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [trainedSkills, setTrainedSkills] = useState<ReadonlyMap<number, TrainedSkill>>(new Map());

  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const targetPlan = useTargetPlan(activeCharacterId);

  const savedLocation = useSavedOrderBookLocation(location === undefined);
  const priceLocation = location ?? savedLocation;
  const [priceState, setPriceState] = useState<PriceState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (activeCharacterId === null) {
        if (!cancelled) setTrainedSkills(new Map());
        return;
      }
      // Queue-corrected, like every other trained-level read (usePlanEditorData) —
      // a level the queue just finished but /skills hasn't caught up to would
      // otherwise show wrong here while everywhere else shows it trained.
      const corrected = await loadCorrectedSkills(activeCharacterId, Date.now(), {
        skipQueueWithoutScope: true,
      });
      if (!cancelled) setTrainedSkills(corrected.trained);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  useEffect(() => {
    if (!priceLocation) return;
    let cancelled = false;
    void (async () => {
      setPriceState({ status: 'loading' });
      // Never rejects: a failure is its own status. A nice-to-have fetch, same
      // as the PI schematic below — it costs the price row, never the modal.
      const view = await loadOrderBookView(typeId, priceLocation);
      if (cancelled) return;
      setPriceState(
        view.status === 'failed' ? { status: 'error' } : { status: 'ready', summary: view.summary }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId, priceLocation]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setData(null);
      setError(false);
      try {
        const [{ data: type }, dictionary, pi, skillAttributeModifiers, skills] = await Promise.all(
          [
            getUniverseType(typeId),
            loadAttributeDictionary(),
            // Caught here, not by the shared handler below: only planetary
            // commodities have anything to lose if this payload is missing, and
            // a rejection inside the Promise.all would blank the whole modal.
            loadPi().catch(() => null),
            // Same reasoning: the attribute-modifier popover is a bonus, not
            // core item detail, so its data failing to load degrades to no
            // popovers rather than blanking the modal.
            loadSkillAttributeModifiers().catch(() => ({})),
            loadSkills().catch(() => []),
          ]
        );
        if (cancelled) return;
        if (!type) throw new Error(`No type data for ${typeId}`);
        // Needs the dictionary to know which values are ids, so it can't join
        // the fetch above; it never rejects, so it can't blank the modal.
        const names = await loadAttributeReferenceNames([type.dogma_attributes], dictionary);
        if (cancelled) return;
        const allSkillNames: Record<number, string> = {};
        for (const skill of skills) allSkillNames[skill.typeID] = skill.name;
        setData({
          type,
          groups: groupItemAttributes(type.dogma_attributes, dictionary, names, {
            omitSkillRequirementRows: true,
          }),
          requiredSkills: extractRequiredSkills(type.dogma_attributes),
          allSkillNames,
          skillAttributeModifiers,
          skillNames: names.types ?? {},
          pi,
        });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  // Gates which attribute-modifier popovers can apply (empty while `data`
  // hasn't loaded yet).
  const requiredSkillTypeIds = new Set((data?.requiredSkills ?? []).map((r) => r.skillTypeID));

  return (
    <Modal open onClose={onClose} title={itemName}>
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error || !data ? (
        <EmptyState
          title={t('market.itemDetail.errorTitle')}
          hint={t('market.itemDetail.errorHint')}
          className="py-8"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <TypeIcon
              typeId={typeId}
              size={64}
              width={64}
              height={64}
              className="shrink-0 rounded-xs border border-line"
            />
            <div className="space-y-1 text-xs">
              <p className="text-text-dim">
                {t('market.itemDetail.volume', { volume: formatVolume(data.type.volume ?? 0) })}
              </p>
              {priceState.status !== 'error' && (
                <p className="flex gap-4 text-text-dim">
                  <span>
                    {t('market.itemDetail.bestSell')}{' '}
                    <span className="tabular-nums text-text">
                      {priceState.status === 'loading'
                        ? '…'
                        : priceCell(priceState.summary.bestSell)}
                    </span>
                  </span>
                  <span>
                    {t('market.itemDetail.bestBuy')}{' '}
                    <span className="tabular-nums text-text">
                      {priceState.status === 'loading'
                        ? '…'
                        : priceCell(priceState.summary.bestBuy)}
                    </span>
                  </span>
                </p>
              )}
              {data.type.description && (
                <p className="whitespace-pre-line text-text">
                  {parseItemDescription(data.type.description).map((run, i) => (
                    <DescriptionRunNode key={i} run={run} />
                  ))}
                </p>
              )}
            </div>
          </div>

          <RequiredSkillsSection
            requiredSkills={data.requiredSkills}
            skillNames={data.skillNames}
            trainedSkills={trainedSkills}
            target={targetPlan}
            hasCharacter={activeCharacterId !== null}
            itemName={itemName}
          />

          <PlanetaryProduction pi={data.pi} typeId={typeId} />

          {data.groups.length === 0 ? (
            <p className="text-xs text-text-dim">{t('market.itemDetail.noAttributes')}</p>
          ) : (
            data.groups.map((group) => (
              <div key={group.category}>
                <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {group.category}
                </h3>
                <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                  {group.attributes.map((attribute) => {
                    const valueText =
                      attribute.displayValue ??
                      `${formatAttributeValue(attribute.value, attribute.unit)}${attribute.unit ? ` ${attribute.unit}` : ''}`;
                    const modifiers = activeCharacterId
                      ? findModifyingSkills(
                          attribute.attributeId,
                          requiredSkillTypeIds,
                          data.skillAttributeModifiers
                        )
                      : [];
                    return (
                      <div key={attribute.attributeId} className="contents">
                        <dt className="text-text-dim">{attribute.name}</dt>
                        <dd className="text-right text-text">
                          {modifiers.length > 0 ? (
                            <AttributeModifierTrigger
                              modifiers={modifiers}
                              skillNames={data.allSkillNames}
                              trainedSkills={trainedSkills}
                              target={targetPlan}
                              itemName={itemName}
                            >
                              {valueText}
                            </AttributeModifierTrigger>
                          ) : (
                            valueText
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * A side of the order book with no orders renders as '—', matching
 * CompareDrawer/VariationsTable — and so does the shorthand a real price gets,
 * so the same figure reads the same way wherever the Market area shows it.
 * The line is inert, so a tap is free to be the reveal.
 */
function priceCell(price: number | null): ReactNode {
  return price != null ? <IskAmount value={price} revealOn="tap" /> : '—';
}

/**
 * "What skill affects this?" — each required skill, status + Add to Plan.
 * No Character: name + level only, not an always-"missing"/no-op Add.
 */
function RequiredSkillsSection({
  requiredSkills,
  skillNames,
  trainedSkills,
  target,
  hasCharacter,
  itemName,
}: {
  requiredSkills: readonly RequiredSkill[];
  skillNames: Readonly<Record<number, string>>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  target: TargetPlan;
  hasCharacter: boolean;
  itemName: string;
}) {
  const { t } = useTranslation();
  if (requiredSkills.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-line pb-1">
        <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('skills.requiredSkills.title')}
        </h3>
        {hasCharacter && <TargetPlanPicker target={target} />}
      </div>
      <div className="mt-1 space-y-1">
        {requiredSkills.map((req) => {
          const name = skillNameOrFallback(req.skillTypeID, skillNames);
          if (!hasCharacter) {
            return <NameOnlySkillRow key={req.skillTypeID} name={name} level={req.level} />;
          }
          const currentLevel = trainedSkills.get(req.skillTypeID)?.level ?? 0;
          return (
            <SkillRow
              key={req.skillTypeID}
              name={name}
              status={skillTrainingStatus(currentLevel, req.level)}
              currentLevel={currentLevel}
              addLabel={t('skills.requiredSkills.addToPlan')}
              onAdd={() =>
                void target.addEntries(
                  [{ skillTypeID: req.skillTypeID, targetLevel: req.level }],
                  itemName
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function NameOnlySkillRow({ name, level }: { name: string; level: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex-1 text-text">{name}</span>
      <span className="text-text-dim">{t('plans.level', { level })}</span>
    </div>
  );
}

/** `skillNames[id]`, falling back to `#id` when a skill's name hasn't resolved — shared by the trigger and each popover row. */
function skillNameOrFallback(id: number, skillNames: Readonly<Record<number, string>>): string {
  return skillNames[id] ?? `#${id}`;
}

/**
 * "Which skill changes this?" — wraps an attribute's displayed value in a
 * click-to-reveal popover. `modifiers` is already resolved
 * (`findModifyingSkills`) to the skills that actually apply to this item,
 * each already carrying its own per-level value — no fetch needed to render.
 */
function AttributeModifierTrigger({
  modifiers,
  skillNames,
  trainedSkills,
  target,
  itemName,
  children,
}: {
  modifiers: readonly ModifyingSkillEffect[];
  skillNames: Readonly<Record<number, string>>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  target: TargetPlan;
  itemName: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        {modifiers.map((modifier) => (
          <AttributeModifierRow
            key={modifier.ownerSkillTypeID}
            modifier={modifier}
            skillName={skillNameOrFallback(modifier.ownerSkillTypeID, skillNames)}
            trainedLevel={trainedSkills.get(modifier.ownerSkillTypeID)?.level ?? 0}
            target={target}
            itemName={itemName}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** One skill's effect inside `AttributeModifierTrigger`'s popover — `modifier.perLevelValue` is already static SDE data, no fetch needed. */
function AttributeModifierRow({
  modifier,
  skillName,
  trainedLevel,
  target,
  itemName,
}: {
  modifier: ModifyingSkillEffect;
  skillName: string;
  trainedLevel: number;
  target: TargetPlan;
  itemName: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-xs">
      <p className="text-text">
        {t('skills.attributeModifier.perLevel', {
          skill: skillName,
          perLevel: modifier.perLevelValue,
        })}
      </p>
      <p className="text-text-dim">
        {trainedLevel > 0
          ? t('skills.attributeModifier.current', {
              level: trainedLevel,
              total: postPercentMagnitude(modifier.perLevelValue, trainedLevel),
            })
          : t('skills.attributeModifier.untrained')}
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          void target.addEntries(
            [
              {
                skillTypeID: modifier.ownerSkillTypeID,
                targetLevel: Math.min(trainedLevel + 1, 5),
              },
            ],
            itemName
          )
        }
      >
        {target.plans?.length === 0
          ? t('skills.fitCheck.createPlanAndAdd')
          : t('skills.requiredSkills.addToPlan')}
      </Button>
    </div>
  );
}

/**
 * How a planetary commodity is produced: the schematic's inputs, its cycle
 * time and what one cycle yields. A P0 resource has no schematic — an
 * extractor pulls it off the planet — so it gets the one line that says so,
 * and everything else in New Eden renders nothing here.
 */
function PlanetaryProduction({ pi, typeId }: { pi: PiData | null; typeId: number }) {
  const { t } = useTranslation();
  if (!pi) return null;
  const schematic = pi.schematics[String(typeId)];
  const raw = pi.raw.some((resource) => resource.typeID === typeId);
  if (!schematic && !raw) return null;
  return (
    <div>
      <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('market.itemDetail.planetaryTitle')}
      </h3>
      {schematic ? (
        <>
          <p className="mt-1 text-xs text-text-dim">
            {t('market.itemDetail.planetaryCycle', {
              quantity: schematic.quantity.toLocaleString(),
              duration: formatDuration(schematic.cycleTime),
            })}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-text">
            {schematic.inputs.map((input) => (
              <li key={input.typeID}>
                {t('market.itemDetail.planetaryInput', {
                  quantity: input.quantity.toLocaleString(),
                  name: input.name,
                })}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-xs text-text-dim">{t('market.itemDetail.planetaryRaw')}</p>
      )}
    </div>
  );
}

/** Renders one parsed description run as nested inline elements — never `dangerouslySetInnerHTML`. */
function DescriptionRunNode({ run }: { run: DescriptionRun }) {
  let node: ReactNode = run.text;
  if (run.underline) node = <u>{node}</u>;
  if (run.italic) node = <i>{node}</i>;
  if (run.bold) node = <b>{node}</b>;
  return <Fragment>{node}</Fragment>;
}
