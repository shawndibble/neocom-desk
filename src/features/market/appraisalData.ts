/**
 * The Appraisal tab's data path: pasted text in, priced rows out.
 *
 * The three steps either side of it are pure and live in `src/engine/market`
 * (`appraisalPaste`, `appraisalMatch`, `appraisal`); this module is the thin
 * layer that reaches the catalogue and the network, which the engine may not.
 *
 * Prices come from `market/prices.ts`'s `getHubPrices`, not `fetchAggregates`
 * directly: it already carries the 15-minute TTL cache and ADR 0002's
 * per-type null fallback when Fuzzwork is unreachable, and a second cache for
 * the same station's prices would only disagree with the first one. Fuzzwork
 * aggregates are per-**station**, which is why an appraisal is quoted at a
 * Trade Hub rather than under the Browser's full Location Mode — a Region
 * appraisal would be one paginated ESI order-book call per pasted item.
 *
 * Refine-then-sell (issue #672) is threaded in here, not the engine: only
 * this layer may reach Dexie (`loadCorrectedSkills`) or the SDE
 * (`loadReprocessing`, 1.4 MB). `characterId` is null with no active
 * Character, in which case neither is fetched at all, and every row's
 * `refine` stays undefined — the page behaves exactly as it did before this
 * issue. Each row's specialisation skill is resolved per type via
 * `resolveSpecialisationLevel` (issue #1058): the SDE bake's attribute-790
 * join names the matching ore/ice/moon-ore specialisation directly, falling
 * back to Scrapmetal Processing for a module or ship — the same resolver
 * `orderExits.ts` and Mining Yield use, so a mixed paste of ore and modules
 * resolves a different specialisation on each row rather than one shared
 * guess.
 *
 * LP store acquisition (`appraisalLpAcquisition.ts`) is threaded in the same
 * way and for the same reason: only this layer may reach ESI/Dexie for the
 * character's LP corps. It runs alongside the reprocessing fetch, both
 * gated on `characterId` being non-null, and its `requiredItemTypeIds`
 * widen the one `getHubPrices` batch every other price in this function
 * already shares — a turn-in's cost is never a second network round trip.
 */
import {
  buildAppraisal,
  buildHubComparison,
  computeAppraisalRefine,
  type Appraisal,
  type AppraisalItem,
} from '@/engine/market/appraisal';
import { cheapestLpOffer } from '@/engine/market/lpAcquisition';
import {
  matchAppraisalEntries,
  type AppraisalCatalogue,
  type AppraisalUnmatched,
} from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import {
  resolveReprocessingSkills,
  resolveImplantBonusPct,
  type GeneralReprocessingSkills,
} from '@/engine/industry/reprocessing';
import { SKILL_IDS } from '@/engine/industry/types';
import type { TrainedSkill } from '@/engine/types';
import { findLpOfferMatches, toLpOfferInputs } from '@/features/market/appraisalLpAcquisition';
import { loadCharacterImplants } from '@/features/skills/data';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { getHubPrices, invalidateHubPrices } from '@/market/prices';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import { loadReprocessing } from '@/sde/loadSde';
import type { ReprocessingType } from '@/sde/types';

export interface AppraisalOutcome {
  appraisal: Appraisal;
  unmatched: AppraisalUnmatched[];
  /**
   * The active clone's refining implant bonus, 0 with none fitted, no active
   * Character, or the whole paste is scrap — the implant's own ESI
   * description covers ore and ice only, so a scrap-only paste never
   * actually saw the bonus even though the character has it (issue #1227).
   */
  implantBonusPct: number;
}

/**
 * Built once per session from the same `types.json` the Market Browser's tree
 * reads, so opening Appraisal after browsing costs no second fetch.
 *
 * A duplicate name keeps the *first* type id rather than the last. EVE's
 * market catalogue has a handful of same-named types across groups, and which
 * one a paste means is unknowable from the text alone — being stable about it
 * at least makes the number reproducible.
 */
let cataloguePromise: Promise<AppraisalCatalogue> | null = null;

export function loadAppraisalCatalogue(): Promise<AppraisalCatalogue> {
  cataloguePromise ??= loadMarketTypes()
    .then((types) => {
      const map = new Map<string, { typeId: number; name: string }>();
      for (const type of types) {
        const key = type.name.toLowerCase();
        if (!map.has(key)) map.set(key, { typeId: type.typeId, name: type.name });
      }
      return map as AppraisalCatalogue;
    })
    .catch((error: unknown) => {
      cataloguePromise = null; // allow retry after failure
      throw error;
    });
  return cataloguePromise;
}

/** Test-only: production callers rely on the session-lifetime memo. */
export function clearAppraisalCatalogue(): void {
  cataloguePromise = null;
}

export interface AppraiseOptions {
  /**
   * Drop the cached prices for these types first, so the refresh button is
   * not a silent no-op inside the 15-minute TTL. CONTEXT.md's "Data Age"
   * makes the manual button one of the two things allowed to bypass a TTL.
   */
  force?: boolean;
}

/**
 * The active Character's general reprocessing skills, plus their full
 * trained-skill map so each row can resolve its own specialisation via
 * `resolveReprocessingSkills` (issue #1058) — a paste mixing ore and
 * modules resolves a different skill per row, so this cannot be reduced to
 * one flat level here.
 */
async function loadReprocessingSkills(
  characterId: number
): Promise<{ skills: GeneralReprocessingSkills; trained: ReadonlyMap<number, TrainedSkill> }> {
  const [corrected, implants] = await Promise.all([
    loadCorrectedSkills(characterId, Date.now()),
    loadCharacterImplants(characterId),
  ]);
  return {
    skills: {
      reprocessingLevel: corrected.trained.get(SKILL_IDS.reprocessing)?.level ?? 0,
      reprocessingEfficiencyLevel:
        corrected.trained.get(SKILL_IDS.reprocessingEfficiency)?.level ?? 0,
      implantBonusPct: resolveImplantBonusPct(implants?.data ?? []),
    },
    trained: corrected.trained,
  };
}

/**
 * Parse, resolve and price a paste at `hub`. Throws only if the catalogue
 * itself cannot be loaded — an unreachable price source degrades to null
 * prices per type, which the table renders as a dash rather than as free.
 *
 * `characterId` is null with no active Character — the refine comparison is
 * then never computed, and `reprocessing.json` is never fetched.
 */
export async function appraisePaste(
  text: string,
  hub: TradeHub,
  pricePercent: number,
  characterId: number | null = null,
  { force = false }: AppraiseOptions = {}
): Promise<AppraisalOutcome> {
  const entries = parseAppraisalPaste(text);
  const catalogue = await loadAppraisalCatalogue();
  const { matched, unmatched } = matchAppraisalEntries(entries, catalogue);
  const typeIds = matched.map((match) => match.typeId);

  const [reprocessingMap, reprocessingSkills, lpMatches] =
    characterId === null
      ? [null, null, null]
      : await Promise.all([
          loadReprocessing(),
          loadReprocessingSkills(characterId),
          findLpOfferMatches(characterId, typeIds),
        ]);

  const reprocessingByTypeId = new Map<number, ReprocessingType>();
  if (reprocessingMap) {
    for (const match of matched) {
      const entry = reprocessingMap[String(match.typeId)];
      if (entry) reprocessingByTypeId.set(match.typeId, entry);
    }
  }

  const materialTypeIds = [
    ...new Set(
      [...reprocessingByTypeId.values()].flatMap((entry) => entry.materials.map((m) => m.typeID))
    ),
  ];
  const allTypeIds = [
    ...new Set([...typeIds, ...materialTypeIds, ...(lpMatches?.requiredItemTypeIds ?? [])]),
  ];
  if (force) invalidateHubPrices(hub.stationId, allTypeIds);
  const prices = await getHubPrices(hub, allTypeIds);
  const sellPrices = new Map(
    [...prices].map(([typeId, agg]) => [typeId, agg.sellMin ?? undefined])
  );

  let implantApplied = false;
  const items: AppraisalItem[] = matched.map((match) => {
    const aggregate = prices.get(match.typeId);
    const reprocessing = reprocessingByTypeId.get(match.typeId);
    const resolvedSkills =
      reprocessing && reprocessingSkills
        ? resolveReprocessingSkills(
            reprocessingSkills.skills,
            reprocessing.specialisationSkillID,
            reprocessingSkills.trained
          )
        : undefined;
    const refine =
      reprocessing && resolvedSkills
        ? computeAppraisalRefine({
            quantity: match.quantity,
            reprocessing: {
              portionSize: reprocessing.portionSize,
              materials: reprocessing.materials.map((m) => ({
                typeId: m.typeID,
                quantity: m.quantity,
              })),
            },
            skills: resolvedSkills,
            materialPrices: Object.fromEntries(
              reprocessing.materials
                .map((m): [number, number | undefined] => [
                  m.typeID,
                  prices.get(m.typeID)?.buyMax ?? undefined,
                ])
                .filter((entry): entry is [number, number] => entry[1] !== undefined)
            ),
          })
        : undefined;
    if (refine && !resolvedSkills?.isScrap && resolvedSkills?.implantBonusPct) {
      implantApplied = true;
    }
    const lpForType = lpMatches?.matchesByTypeId.get(match.typeId);
    const lpOption = lpForType
      ? (cheapestLpOffer(toLpOfferInputs(lpForType, sellPrices), match.quantity) ?? undefined)
      : undefined;
    return {
      typeId: match.typeId,
      name: match.name,
      quantity: match.quantity,
      buy: aggregate?.buyMax ?? null,
      sell: aggregate?.sellMin ?? null,
      ...(refine ? { refine } : {}),
      ...(lpOption ? { lpOption } : {}),
    };
  });

  return {
    appraisal: buildAppraisal(items, pricePercent),
    unmatched,
    implantBonusPct: implantApplied ? (reprocessingSkills?.skills.implantBonusPct ?? 0) : 0,
  };
}

/** One Trade Hub's row in the Appraisal tab's Compare Hubs table. */
export interface HubComparisonRow {
  hub: TradeHub;
  buy: number | null;
  sell: number | null;
}

/**
 * Prices the same pasted pile at every Trade Hub side by side, so a pilot can
 * see hub disparity without switching `sync.marketHub` and re-pasting up to 5
 * times. Parses and matches the paste once, then costs exactly one batched
 * `getHubPrices` call per hub (5 total) regardless of paste length — the same
 * shape `hubHaulGaps` already proves cheap for open orders. No refine
 * comparison here: that stays primary-appraisal-only.
 */
export async function compareHubs(
  text: string,
  pricePercent: number,
  { force = false }: AppraiseOptions = {}
): Promise<HubComparisonRow[]> {
  const entries = parseAppraisalPaste(text);
  const catalogue = await loadAppraisalCatalogue();
  const { matched } = matchAppraisalEntries(entries, catalogue);
  const typeIds = matched.map((match) => match.typeId);

  return Promise.all(
    TRADE_HUBS.map(async (hub) => {
      if (force) invalidateHubPrices(hub.stationId, typeIds);
      const prices = await getHubPrices(hub, typeIds);
      const items: AppraisalItem[] = matched.map((match) => {
        const aggregate = prices.get(match.typeId);
        return {
          typeId: match.typeId,
          name: match.name,
          quantity: match.quantity,
          buy: aggregate?.buyMax ?? null,
          sell: aggregate?.sellMin ?? null,
        };
      });
      const { buy, sell } = buildHubComparison(items, pricePercent);
      return { hub, buy, sell };
    })
  );
}
