/**
 * The per-widget settings that change what a kind builds, declared once.
 *
 * A setting is on for a kind when the catalogue says the kind has it
 * (`hasRange`, ...): the same flag the widget menu reads to offer the control.
 * Both the view key and the `BuildContext` come from the one `resolve` here, so
 * a setting that reaches a builder is always in the key, and two widgets of one
 * kind with different settings never share a memoised view.
 */
import { DEFAULT_PLEX_PER_30_DAYS } from '@/engine/omegaCoverage';
import { getKind, type WidgetKindDef } from '../kinds';
import { DEFAULT_RAIDS_RADIUS, DEFAULT_RANGE } from '../layout';
import type { CalendarEventsChoice, WidgetRange } from '../layout';
import type { BuildContext } from './types';

/** A widget's own settings, as stored; every field is absent when left at its default. */
export interface ViewSettings {
  /** The widget's time window; left out, the default. */
  range?: WidgetRange;
  /** The widget's Omega plan (PLEX per 30 days); left out, the default. */
  plexPer30Days?: number;
  /** Which calendar events the widget lists; left out, accepted and tentative. */
  calendarEvents?: CalendarEventsChoice;
  /** Skyhook raids: 'near' lists any holder's space within `raidsRadius` jumps; left out, My alliance. */
  raidsWhere?: 'near';
  raidsRadius?: number;
  /** Market Trend: the items it draws; left out, the Quickbar's first. */
  trendItems?: number[];
  /** Market Trend: the Trade Hubs it prices at; left out, the pilot's Market hub. */
  trendHubs?: string[];
}

/** What a kind is asked to build: which kind, which Characters, and its own settings. */
export interface ViewRequest extends ViewSettings {
  kind: string;
  /** This widget reads across Characters, and its kind can sum them. */
  scopeAll: boolean;
}

/** The `BuildContext` fields the settings fill in. */
export type SettingsContext = Pick<
  BuildContext,
  | 'range'
  | 'plexPer30Days'
  | 'calendarEvents'
  | 'raidsWhere'
  | 'raidsRadius'
  | 'trendItems'
  | 'trendHubs'
>;

interface SettingSpec {
  /** Whether the catalogue gives this kind the setting. */
  enabledFor: (kind: WidgetKindDef) => boolean;
  /** The `ViewSettings` fields it owns; every field must be owned by exactly one spec. */
  fields: readonly (keyof ViewSettings)[];
  /** The settings as the builder reads them, defaults filled in. */
  resolve: (settings: ViewSettings) => Partial<SettingsContext>;
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
    fields: ['calendarEvents'],
    resolve: (s) => ({ calendarEvents: s.calendarEvents === 'all' ? 'all' : 'committed' }),
  },
  raids: {
    enabledFor: (k) => k.hasRaidsWhere,
    fields: ['raidsWhere', 'raidsRadius'],
    // The radius only means something for Near me; My alliance is one view whatever radius is stored.
    resolve: (s) =>
      s.raidsWhere === 'near'
        ? { raidsWhere: 'near', raidsRadius: s.raidsRadius ?? DEFAULT_RAIDS_RADIUS }
        : { raidsWhere: 'alliance', raidsRadius: DEFAULT_RAIDS_RADIUS },
  },
  trend: {
    enabledFor: (k) => k.hasTrendSources,
    fields: ['trendItems', 'trendHubs'],
    // Left out means "follow the Quickbar / the Market hub", which is not the same as any list.
    resolve: (s) => ({ trendItems: s.trendItems, trendHubs: s.trendHubs }),
  },
} satisfies Record<string, SettingSpec>;

/** Compile-time: a `ViewSettings` field no spec owns fails here, so it cannot skip the key. */
type OwnedFields = (typeof VIEW_SETTINGS)[keyof typeof VIEW_SETTINGS]['fields'][number];
export type EverySettingOwned = [keyof ViewSettings] extends [OwnedFields] ? true : never;

const SPECS: readonly SettingSpec[] = Object.values(VIEW_SETTINGS);

/** The settings a kind's builder gets: its declared ones resolved, the rest at their defaults. */
export function settingsContext(kind: string, settings: ViewSettings): SettingsContext {
  const def = getKind(kind);
  const out: Partial<SettingsContext> = {};
  for (const spec of SPECS) {
    Object.assign(out, spec.resolve(def && spec.enabledFor(def) ? settings : {}));
  }
  return out as SettingsContext;
}

/** Identifies one built view: two requests with the same key build the same view. */
export function viewKey(request: ViewRequest): string {
  // Whatever the specs resolve is the key, so a new setting joins it without a second edit.
  return `${request.kind}:${request.scopeAll ? 1 : 0}:${JSON.stringify(settingsContext(request.kind, request))}`;
}
