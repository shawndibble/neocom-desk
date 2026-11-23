// militaryCampaigns.json (issue #6703): CCP's Military Campaigns and their
// Campaign Objectives, from the static data export's
// militaryCampaignObjectives.jsonl and militaryCampaigns.jsonl. Every objective
// type is kept (the Overview widget lists any objective a Character
// Participates in); an `ItemTraded` one also carries its turn-in: the traded
// item, the Item Trader and the trader's solar system. Live state (Active,
// progress) is ESI's, read at run time.
//
// The trader's system is in neither table as a field. Each turn-in
// objective's own English subtitle names it as a show-info link
// ("trade it at the Item Trader outside the Federation Navy Anchorage in
// <url=showinfo:5//30003788>Intaki</url>"), so that link is the source — the
// traded item's description carries the same link, but the subtitle is the
// objective's own text.

export const TRADER_SYSTEM_SOURCE =
  'objective subtitle (en): the one showinfo:5//<solarSystemID> link it holds';

/** The one solar system id `text` links to; null when it links none, or more than one. */
export function traderSystemId(text) {
  if (typeof text !== 'string') return null;
  const ids = new Set([...text.matchAll(/showinfo:5\/\/(\d+)/g)].map((m) => Number(m[1])));
  return ids.size === 1 ? [...ids][0] : null;
}

const idOf = (record, field) => record?.[field] ?? record?._key;

/** The first item_type id a contribution parameter matches, or null. */
function paramTypeId(config, key) {
  const param = config?.parameters?.find((p) => p?.key === key);
  const value = param?.matcher?.values?.find((v) => v?.valueType === 'item_type')?.values?.[0];
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function reward(r) {
  if (!r || !(r.amountPerInterval > 0) || !(r.progressInterval > 0)) return undefined;
  return { amount: r.amountPerInterval, interval: r.progressInterval };
}

function lpReward(r) {
  const base = reward(r);
  const corporationId = r?.issuer?.corporationID;
  if (!base || !Number.isInteger(corporationId)) return undefined;
  return { ...base, corporationId };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * `{ traderSystemSource, campaigns, objectives }`, each list sorted by id.
 * `types` is CCP's types.jsonl (for the Item Trader's name: the trader types
 * are unpublished, so `types.json` does not have them). Throws on an
 * `ItemTraded` objective whose item or trader cannot be read.
 */
export function bakeMilitaryCampaigns(objectiveRecords, campaignRecords, types) {
  const typeName = new Map(types.map((t) => [Number(t._key), t?.name?.en]));
  const campaigns = campaignRecords
    .map((c) => ({
      id: idOf(c, 'campaignID'),
      title: c?.title?.en ?? '',
      factionId: c?.issuer?.factionID ?? null,
      targetProgress: c?.targetProgress ?? 0,
    }))
    .sort(byId);
  const objectives = objectiveRecords
    .map((o) => {
      const id = idOf(o, 'objectiveID');
      const config = o?.contributionMethodConfiguration;
      const row = {
        id,
        campaignId: o?.campaignID,
        title: o?.title?.en ?? '',
        method: config?.name ?? 'Unknown',
        targetProgress: o?.targetProgress ?? 0,
      };
      if (o?.maxProgressPerParticipant > 0) row.maxPerParticipant = o.maxProgressPerParticipant;
      const isk = reward(o?.rewards?.isk);
      if (isk) row.isk = isk;
      const lp = lpReward(o?.rewards?.lp);
      if (lp) row.lp = lp;
      if (row.method === 'ItemTraded') {
        const typeId = paramTypeId(config, 'traded_item');
        const traderTypeId = paramTypeId(config, 'trader');
        if (typeId === null || traderTypeId === null) {
          throw new Error(`militaryCampaigns: objective ${id} has no readable traded item/trader`);
        }
        row.turnIn = {
          typeId,
          traderTypeId,
          traderName: typeName.get(traderTypeId) ?? `Type ${traderTypeId}`,
          systemId: traderSystemId(o?.subtitle?.en),
        };
      }
      return row;
    })
    .sort(byId);
  return { traderSystemSource: TRADER_SYSTEM_SOURCE, campaigns, objectives };
}
