import { DEFAULT_PLEX_PER_30_DAYS } from '@/engine/omegaCoverage';
import { getKind, showOf, type WidgetKindDef, type WidgetShow } from '../kinds';
import {
  cleanHiddenKinds,
  cleanHiddenLayers,
  DEFAULT_RAIDS_RADIUS,
  DEFAULT_RANGE,
  LEGACY_PROFIT_SOURCE,
} from '../layout';
import type { CalendarEventsChoice, CampaignFaction, ProfitSource, WidgetRange } from '../layout';
import type { LayerId } from '@/engine/netWorth/series';
import type { CharacterBoardItemKind } from '@/engine/character/board';
import type { BuildContext } from './types';

export interface ViewSettings {
  range?: WidgetRange;
  plexPer30Days?: number;
  calendarEvents?: CalendarEventsChoice;
  hiddenKinds?: CharacterBoardItemKind[];
  raidsWhere?: 'near';
  raidsRadius?: number;
  profitSource?: ProfitSource;
  hiddenLayers?: LayerId[];
  campaignFaction?: Exclude<CampaignFaction, 'all'>;
  trendItems?: number[];
  trendHubs?: string[];
  show?: WidgetShow;
}

export interface ViewRequest extends ViewSettings {
  kind: string;
  scopeAll: boolean;
  corporationId?: number;
}

export type SettingsContext = Pick<
  BuildContext,
  | 'range'
  | 'plexPer30Days'
  | 'calendarEvents'
  | 'hiddenKinds'
  | 'raidsWhere'
  | 'raidsRadius'
  | 'profitSource'
  | 'hiddenLayers'
  | 'campaignFaction'
  | 'trendItems'
  | 'trendHubs'
  | 'show'
>;

interface SettingSpec {
  enabledFor: (kind: WidgetKindDef) => boolean;
  fields: readonly (keyof ViewSettings)[];
  resolve: (settings: ViewSettings, kind: WidgetKindDef | undefined) => Partial<SettingsContext>;
}

export const VIEW_SETTINGS = {
  range: {
    enabledFor: (k) => k.hasRange,
    fields: ['range'],
    resolve: (s) => ({ range: s.range ?? DEFAULT_RANGE }),
  },
  plexPlan: {
    enabledFor: (k) => k.hasPlexPlan,
    fields: ['plexPer30Days'],
    resolve: (s) => ({ plexPer30Days: s.plexPer30Days ?? DEFAULT_PLEX_PER_30_DAYS }),
  },
  calendarEvents: {
    enabledFor: (k) => k.hasCalendarEvents,
    fields: ['calendarEvents', 'hiddenKinds'],
    resolve: (s) => ({
      calendarEvents: s.calendarEvents === 'all' ? 'all' : 'committed',
      hiddenKinds: cleanHiddenKinds(s.hiddenKinds),
    }),
  },
  raids: {
    enabledFor: (k) => k.hasRaidsWhere,
    fields: ['raidsWhere', 'raidsRadius'],
    resolve: (s) =>
      s.raidsWhere === 'near'
        ? { raidsWhere: 'near', raidsRadius: s.raidsRadius ?? DEFAULT_RAIDS_RADIUS }
        : { raidsWhere: 'alliance', raidsRadius: DEFAULT_RAIDS_RADIUS },
  },
  profitSource: {
    enabledFor: (k) => k.hasProfitSource,
    fields: ['profitSource'],
    resolve: (s) => ({ profitSource: s.profitSource ?? LEGACY_PROFIT_SOURCE }),
  },
  layers: {
    enabledFor: (k) => k.hasLayerPicker,
    fields: ['hiddenLayers'],
    resolve: (s) => ({ hiddenLayers: cleanHiddenLayers(s.hiddenLayers) }),
  },
  campaignFaction: {
    enabledFor: (k) => k.hasCampaignFaction,
    fields: ['campaignFaction'],
    resolve: (s) => ({ campaignFaction: s.campaignFaction ?? 'all' }),
  },
  trend: {
    enabledFor: (k) => k.hasTrendSources,
    fields: ['trendItems', 'trendHubs'],
    resolve: (s) => ({ trendItems: s.trendItems, trendHubs: s.trendHubs }),
  },
  show: {
    enabledFor: (k) => k.shows.length > 0,
    fields: ['show'],
    resolve: (s, k) => (k && k.shows.length > 0 ? { show: showOf(k, s.show) } : {}),
  },
} satisfies Record<string, SettingSpec>;

type OwnedFields = (typeof VIEW_SETTINGS)[keyof typeof VIEW_SETTINGS]['fields'][number];
export type EverySettingOwned = [keyof ViewSettings] extends [OwnedFields] ? true : never;

const SPECS: readonly SettingSpec[] = Object.values(VIEW_SETTINGS);

export function settingsContext(kind: string, settings: ViewSettings): SettingsContext {
  const def = getKind(kind);
  const out: Partial<SettingsContext> = {};
  for (const spec of SPECS) {
    Object.assign(out, spec.resolve(def && spec.enabledFor(def) ? settings : {}, def));
  }
  return out as SettingsContext;
}

export function viewKey(request: ViewRequest): string {
  return `${request.kind}:${request.scopeAll ? 1 : 0}:${request.corporationId ?? ''}:${JSON.stringify(settingsContext(request.kind, request))}`;
}
