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

export const useDoneAtOverride = createLocalSetting<TimeFormat | null>({
  key: 'miningSurveyDoneAtClock',
  defaultValue: null,
  parse: (raw) => (TIME_FORMATS.includes(raw as TimeFormat) ? (raw as TimeFormat) : null),
});

export function useDoneAtClock(): TimeFormat | null {
  const override = useDoneAtOverride((state) => state.value);
  const chosen = useLiveQuery(async () => {
    const stored = (await db.settings.get(TIME_FORMAT_SETTING_KEY))?.value;
    return TIME_FORMATS.includes(stored as TimeFormat) ? (stored as TimeFormat) : null;
  }, []);
  if (override) return override;
  return chosen === undefined ? null : (chosen ?? 'eve');
}

export const SURVEY_PRICE_HUB_KEY = 'miningSurveyPriceHub';
export const SURVEY_PRICE_HUB_MIGRATED_KEY = 'miningSurveyPriceHubMigrated';

export function migrateSurveyPriceHub(): Promise<void> {
  return seedPageHubsOnce(SURVEY_PRICE_HUB_MIGRATED_KEY, ['mining'], async () => {
    const raw = (await db.settings.get(SURVEY_PRICE_HUB_KEY))?.value;
    return typeof raw === 'string' && getTradeHub(raw as TradeHub['id'])
      ? (raw as TradeHub['id'])
      : null;
  });
}

export const useSurveyChatOptions = createLocalSetting<SurveyChatOptions>({
  key: 'miningSurveyChatOptions',
  defaultValue: DEFAULT_SURVEY_CHAT_OPTIONS,
  parse: parseSurveyChatOptions,
});
