/**
 * The Military Campaigns widget (issue #6709): the Active Campaign Objectives
 * the widget's Characters Participate in (any type, with what each has put in
 * and earned), plus turn-ins for items they hold, each with % filled. Its
 * Number is how complete the chosen faction's campaign is, with a `donut`
 * ring beside it (one small ring per faction on All) and the ISK waiting to be
 * turned in under it.
 *
 * Behind `import()` (the kind's `loadBuild`): it reads the turn-in wording.
 * Pure: the read is `features/campaigns/militaryCampaignsWidget.ts`.
 */
import { filledPercent, approxIsk } from '@/features/campaigns/turnInContent';
import type {
  CampaignWidgetRow,
  MilitaryCampaignsWidgetData,
} from '@/features/campaigns/militaryCampaignsWidget';
import type { CampaignCompletion } from '@/engine/campaigns/participation';
import { formatIskCompact } from '@/lib/isk';
import { formatNumber } from '@/lib/numberLocale';
import type { Translate } from '@/lib/translate';
import { EMPIRE_FACTION_IDS, empireFactionOf } from '@/engine/empireFactions';
import type { DonutChartModel } from '../charts/types';
import { blank, statusOf, type Builder } from './builderKit';
import type { KindView, NumberModel, TableModel, TableRowModel } from './types';

const k = (key: string) => `overview.widgets.militaryCampaigns.${key}`;

/** "Caldari"; null for a faction the setting does not offer. */
function factionName(t: Translate, factionId: number | null): string | null {
  const faction = empireFactionOf(factionId);
  return faction === null ? null : t(`overview.menu.factionChoice.${faction}`);
}

function ring(
  t: Translate,
  campaign: CampaignCompletion,
  label: string,
  centred: boolean
): DonutChartModel {
  const percent = Math.round(campaign.fraction * 100);
  return {
    kind: 'donut',
    parts: [
      {
        key: 'complete',
        label: t(k('complete')),
        value: Math.max(0, campaign.completed),
        color: 'accent',
      },
    ],
    of: campaign.target,
    centre: centred ? `${percent}%` : '',
    centreNote: '',
    summary: t(k('ringSummary'), {
      label,
      completed: campaign.completed,
      target: campaign.target,
    }),
  };
}

/** "2.4M ISK + 1,000 LP earned", "2.4M ISK earned"; null when nothing has paid yet. */
function earnedText(t: Translate, joined: NonNullable<CampaignWidgetRow['joined']>) {
  const isk = joined.isk > 0 ? formatIskCompact(joined.isk) : null;
  const lp = joined.lp > 0 ? formatNumber(joined.lp) : null;
  if (isk !== null && lp !== null) return t(k('earnedBoth'), { isk, lp });
  if (isk !== null) return t(k('earnedIsk'), { isk });
  if (lp !== null) return t(k('earnedLp'), { lp });
  return null;
}

/** The second cell: what the Character holds and what it pays, or what it has put in and earned. */
function whoText(t: Translate, row: CampaignWidgetRow, multiCharacter: boolean): string {
  const turnIn = row.turnIn;
  if (turnIn && turnIn.held > 0) {
    const values = {
      name: row.characterName,
      held: formatNumber(turnIn.held),
      reward: approxIsk(turnIn.reward),
    };
    return multiCharacter ? t(k('holds'), values) : t(k('youHold'), values);
  }
  const joined = row.joined;
  if (!joined) return row.characterName;
  const earned = earnedText(t, joined);
  const contributed = t(k('contributed'), {
    name: row.characterName,
    amount: formatNumber(joined.contributed),
  });
  return earned === null ? contributed : `${contributed} · ${earned}`;
}

function tableOf(
  t: Translate,
  rows: readonly CampaignWidgetRow[],
  multiCharacter: boolean
): TableModel {
  return {
    // No header row (the cells say what they are), so the first cell names the row.
    columns: [
      { key: 'objective', label: '', priority: 0 },
      // The objective keeps the row; the holdings line truncates first, and goes on a phone
      // (the row's TurnInDetail repeats it).
      { key: 'who', label: '', priority: 2, capped: true, hideNarrow: true },
      { key: 'filled', label: '', align: 'end', priority: 1, minWidth: 80 },
    ],
    rows: rows.map((row): TableRowModel => {
      const who = whoText(t, row, multiCharacter);
      const turnIn = row.turnIn;
      return {
        key: row.key,
        badge: factionName(t, row.factionId) ?? undefined,
        cells: [
          // "Turn in …" only with items to hand in; a joined turn-in with none keeps its title.
          turnIn && turnIn.held > 0 ? t(k('turnInTitle'), { name: turnIn.name }) : row.title,
          who,
          t(k('filled'), { percent: filledPercent(row) }),
        ],
        turnIn: turnIn
          ? {
              name: turnIn.name,
              offer: turnIn.offer,
              characterId: row.characterId,
              characterName: row.characterName,
              surfaceLine: turnIn.held > 0 ? who : undefined,
            }
          : undefined,
      };
    }),
  };
}

function numberOf(
  t: Translate,
  active: readonly CampaignCompletion[],
  waiting: number,
  /** One faction chosen: its campaign is the figure. All factions get one line and ring each. */
  oneFaction: boolean
): NumberModel {
  const secondary =
    waiting > 0 ? { text: t(k('waiting'), { isk: approxIsk(waiting) }) } : undefined;
  const labelOf = (campaign: CampaignCompletion) =>
    factionName(t, campaign.factionId) ?? campaign.title;
  const only = oneFaction && active.length === 1 ? active[0] : undefined;
  if (only) {
    return {
      // "Caldari · 1 of 4": the figure names the faction the menu picked.
      value: t(k('factionOfTarget'), {
        faction: labelOf(only),
        completed: only.completed,
        target: only.target,
      }),
      unit: t(k('objectivesComplete'), { count: only.target }),
      // With nothing to hand in, the line says which campaign the figure is.
      secondary: secondary ?? { text: only.title },
      tone: 'clear',
      rings: [
        { key: only.campaignId, label: labelOf(only), donut: ring(t, only, labelOf(only), true) },
      ],
    };
  }
  const lines = active.map((campaign) =>
    t(k('factionLine'), {
      faction: labelOf(campaign),
      completed: campaign.completed,
      target: campaign.target,
    })
  );
  return {
    value: lines.join(' · '),
    secondary,
    tone: 'clear',
    rings: active.map((campaign, i) => ({
      key: campaign.campaignId,
      label: lines[i]!,
      donut: ring(t, campaign, labelOf(campaign), false),
    })),
  };
}

export const militaryCampaigns: Builder = (
  feeds,
  { t, activeCharacterId, scopeAll, campaignFaction }
) => {
  const feed = feeds.militaryCampaigns;
  const data: MilitaryCampaignsWidgetData | null = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  // The read covers every Character; a widget on one Character narrows to the header's.
  const everyone = scopeAll || activeCharacterId === null;
  const inScope = data.characters.filter(
    (character) => everyone || character.characterId === activeCharacterId
  );
  const granted = inScope.filter((character) => character.status !== 'needsPermission');
  const missing = inScope.filter((character) => character.status === 'needsPermission');
  const read = new Set(
    granted.filter((character) => character.status === 'ok').map((c) => c.characterId)
  );
  const faction = campaignFaction ?? 'all';
  const factionId = faction === 'all' ? null : EMPIRE_FACTION_IDS[faction];
  const active = data.campaigns.filter(
    (campaign) =>
      campaign.state === 'Active' && (factionId === null || campaign.factionId === factionId)
  );
  const status = statusOf(feed, {
    needsPermission: granted.length === 0,
    isEmpty: active.length === 0,
  });
  if (granted.length === 0) {
    // Grant access asks a Character that lacks it: on All, the first one; on one, the header's.
    const first = missing[0];
    return {
      ...blank(null, status),
      ...(everyone &&
        first && { grantCharacterId: first.characterId, grantCharacterName: first.name }),
    };
  }
  // Every granted Character's own read failed: Retry, not an empty list.
  if (read.size === 0) return blank(null, { ...status, error: true, hasData: false });

  const base: KindView = {
    ...blank(null, status),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    headerMark:
      missing[0] === undefined
        ? undefined
        : {
            characterId: missing[0].characterId,
            characterName: missing[0].name,
            count: missing.length,
            permission: 'militaryCampaigns',
            why:
              missing.length > 1
                ? t(k('whyMarkSeveral'), { name: missing[0].name })
                : t(k('whyMark')),
          },
  };
  if (active.length === 0) {
    const name = factionName(t, factionId);
    return {
      ...base,
      emptyMessage: name === null ? undefined : t(k('emptyFaction'), { faction: name }),
    };
  }

  // A Character without the Permission still shows what it holds (Participate unknown).
  const shown = new Set([...read, ...missing.map((character) => character.characterId)]);
  const rows = data.rows.filter(
    (row) => shown.has(row.characterId) && (factionId === null || row.factionId === factionId)
  );
  const waiting = rows.reduce(
    (sum, row) => sum + (row.turnIn && row.turnIn.held > 0 ? row.turnIn.reward : 0),
    0
  );
  const number = numberOf(t, active, waiting, factionId !== null);
  const factionLabel = factionName(t, factionId);
  // A Character whose own read failed drops its rows: say so, never a silent gap.
  const unread = granted.length - read.size;
  const unreadNote = unread > 0 ? t(k('unread'), { count: unread }) : undefined;
  return {
    ...base,
    number: unreadNote ? { ...number, notes: [unreadNote] } : number,
    table: {
      ...tableOf(t, rows, everyone && shown.size > 1),
      footer: unreadNote,
      // Campaigns are running, but nobody in view joined or holds anything for them.
      emptyLine:
        factionLabel === null ? t(k('noRows')) : t(k('noRowsFaction'), { faction: factionLabel }),
    },
    summary: [number.value, number.secondary?.text].filter(Boolean).join(' · '),
  };
};
