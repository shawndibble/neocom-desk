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
 * issue. The one skill this app has no mapping for — ore/ice's own
 * specialisation skills (Veldspar Processing and friends), as opposed to
 * Scrapmetal Processing which the existing `orderExits.ts` comparison uses
 * for modules and ships — is deliberately passed as level 0 rather than
 * guessed, the same "state the assumption, don't fold in a guess" rule
 * `reprocessing.ts` already applies to the NPC station rate.
 */
import {
  buildAppraisal,
  computeAppraisalRefine,
  type Appraisal,
  type AppraisalItem,
} from '@/engine/market/appraisal';
import {
  matchAppraisalEntries,
  type AppraisalCatalogue,
  type AppraisalUnmatched,
} from '@/engine/market/appraisalMatch';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import type { TradeHub } from '@/market/hubs';
import { getHubPrices, invalidateHubPrices } from '@/market/prices';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import { loadReprocessing } from '@/sde/loadSde';
import type { ReprocessingType } from '@/sde/types';

export interface AppraisalOutcome {
  appraisal: Appraisal;
  unmatched: AppraisalUnmatched[];
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
 * The active Character's reprocessing skills, resolved to `computeAppraisalRefine`'s
 * input shape. `specialisationLevel` is always 0 — see the module doc comment.
 */
async function loadReprocessingSkills(characterId: number) {
  const corrected = await loadCorrectedSkills(characterId, Date.now());
  return {
    reprocessingLevel: corrected.trained.get(SKILL_IDS.reprocessing)?.level ?? 0,
    reprocessingEfficiencyLevel:
      corrected.trained.get(SKILL_IDS.reprocessingEfficiency)?.level ?? 0,
    specialisationLevel: 0,
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

  const [reprocessingMap, skills] =
    characterId === null
      ? [null, null]
      : await Promise.all([loadReprocessing(), loadReprocessingSkills(characterId)]);

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
  const typeIds = matched.map((match) => match.typeId);
  const allTypeIds = [...new Set([...typeIds, ...materialTypeIds])];
  if (force) invalidateHubPrices(hub.stationId, allTypeIds);
  const prices = await getHubPrices(hub, allTypeIds);

  const items: AppraisalItem[] = matched.map((match) => {
    const aggregate = prices.get(match.typeId);
    const reprocessing = reprocessingByTypeId.get(match.typeId);
    const refine =
      reprocessing && skills
        ? computeAppraisalRefine({
            quantity: match.quantity,
            reprocessing: {
              portionSize: reprocessing.portionSize,
              materials: reprocessing.materials.map((m) => ({
                typeId: m.typeID,
                quantity: m.quantity,
              })),
            },
            skills,
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
    return {
      typeId: match.typeId,
      name: match.name,
      quantity: match.quantity,
      buy: aggregate?.buyMax ?? null,
      sell: aggregate?.sellMin ?? null,
      ...(refine ? { refine } : {}),
    };
  });

  return {
    appraisal: buildAppraisal(items, pricePercent),
    unmatched,
  };
}
