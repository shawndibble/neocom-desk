/**
 * Device-local Survey preferences. First, the Survey this device is tracking,
 * as the id of its stored Share Link.
 * Local, not synced: a Survey is a link anyone can open, so remembering it on
 * one device is a convenience, and "New survey" just forgets it.
 */
import {
  DEFAULT_SURVEY_CHAT_OPTIONS,
  parseSurveyChatOptions,
  type SurveyChatOptions,
} from '@/engine/survey/chatMessage';
import { isShareId } from '@/engine/share/shareId';
import { db } from '@/db';
import { TIME_FORMATS, TIME_FORMAT_SETTING_KEY, type TimeFormat } from '@/lib/timeFormat';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { seedPageHubsOnce } from '@/features/market/pageHubSeed';
import { useLiveQuery } from 'dexie-react-hooks';

export const useCurrentSurveyId = createLocalSetting<string | null>({
  key: 'miningSurveyCurrent',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' && isShareId(raw) ? raw : null),
});

/**
 * The clock the pilot pressed the "Done at" tile onto, or null while they
 * haven't: then the tile follows the app's time format (see `useDoneAtClock`).
 */
export const useDoneAtOverride = createLocalSetting<TimeFormat | null>({
  key: 'miningSurveyDoneAtClock',
  defaultValue: null,
  parse: (raw) => (TIME_FORMATS.includes(raw as TimeFormat) ? (raw as TimeFormat) : null),
});

/**
 * Which clock the "Done at" tile shows: the pilot's press on the tile, else
 * their Settings → App display time format when they have chosen one, else EVE
 * time (null while that is being read). The setting's own default is `local`, so only a stored row counts as a
 * choice; reading the row (not the store) is how "never picked" shows.
 */
export function useDoneAtClock(): TimeFormat | null {
  const override = useDoneAtOverride((state) => state.value);
  const chosen = useLiveQuery(async () => {
    const stored = (await db.settings.get(TIME_FORMAT_SETTING_KEY))?.value;
    return TIME_FORMATS.includes(stored as TimeFormat) ? (stored as TimeFormat) : null;
  }, []);
  // `undefined` is the read still pending: say so rather than flash EVE time at a pilot who chose local.
  if (override) return override;
  return chosen === undefined ? null : (chosen ?? 'eve');
}

/**
 * Before issue #6523 a Survey priced at its own device-local hub, Jita until
 * picked. Since then it prices at the Mining page hub (`useHubFor('mining')`).
 */
export const SURVEY_PRICE_HUB_KEY = 'miningSurveyPriceHub';
/** Local only: this device's Survey hub has been folded into the Mining page hub. */
export const SURVEY_PRICE_HUB_MIGRATED_KEY = 'miningSurveyPriceHubMigrated';

/** A hub picked for the Survey on this device becomes Mining's own hub, once (`pageHubSeed.ts`). */
export function migrateSurveyPriceHub(): Promise<void> {
  return seedPageHubsOnce(SURVEY_PRICE_HUB_MIGRATED_KEY, ['mining'], async () => {
    const raw = (await db.settings.get(SURVEY_PRICE_HUB_KEY))?.value;
    return typeof raw === 'string' && getTradeHub(raw as TradeHub['id'])
      ? (raw as TradeHub['id'])
      : null;
  });
}

/**
 * What the Survey chat message says and how it is drawn, as chosen in the copy
 * menu's "Configure chat message". Device-local like the price hub: it is a
 * taste about the pilot's own channel, not part of any survey.
 */
export const useSurveyChatOptions = createLocalSetting<SurveyChatOptions>({
  key: 'miningSurveyChatOptions',
  defaultValue: DEFAULT_SURVEY_CHAT_OPTIONS,
  parse: parseSurveyChatOptions,
});
