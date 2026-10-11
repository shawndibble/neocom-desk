/**
 * The uniform shape every Widget Kind's data takes, whatever it reads.
 *
 * A kind's reads ("feeds", shared between kinds that need the same one) are
 * kept raw; `models.ts` turns them into a `KindView` at render time. Nothing
 * here knows about React, Dexie or fetch, so the adapters stay testable with
 * plain fixtures.
 */
import type { DeadlineSeverity } from '@/engine/severity';
import type { StockBoardData } from '@/features/stockTargets/stockBoard';
import type { ExtractionPrices } from '@/features/character/useExtractionPrices';
import type { OpenOrdersPageSnapshot } from '@/features/market/openOrdersPageSnapshot';
import type {
  CalendarEventsBoardData,
  ContractsBoardData,
  IndustryBoardData,
  MailBoardData,
  MiningTaxBoardData,
  MoonChunksBoardData,
  PlanetaryBoardData,
  PriceAlertsBoardData,
  StructuresBoardData,
} from '../../boardData';
import type { IncursionsBoardData } from '../../incursionsBoard';
import type { BoardDeadline } from '../nextDeadline';
import type { WidgetStateInput } from '../state';
import type { SkillsQueuePanelData, WalletPanelData } from './loaders';

/** The narrow slice of i18next's `t` the adapters need. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A widget's headline figure. Always shown, whatever the view. */
export interface NumberModel {
  /** Display text. When `iskAmount` is set the shell draws an `IskAmount` and this is its plain-text form. */
  value: string;
  /** An ISK figure, drawn as shorthand with the exact value one gesture away (DESIGN §6c). */
  iskAmount?: number;
  /** What the figure counts ("undercut", "ISK"). */
  unit?: string;
  /** One line under the figure. */
  note?: string;
  /** The severity ladder's tone; `clear` draws plain. */
  tone: DeadlineSeverity;
}

export interface ListRow {
  key: string;
  title: string;
  detail?: string;
  /** The right-hand figure or clock. */
  value: string;
  iskAmount?: number;
  tone: DeadlineSeverity;
  /** Set only when the row leads somewhere narrower than the widget's own Open link. */
  to?: string;
}

export interface KindView {
  status: WidgetStateInput;
  /** When the read behind it landed; null when not known. */
  fetchedAt: Date | null;
  /** The read came from cache, not a live fetch. */
  fromCache: boolean;
  number: NumberModel;
  /** Every row; the shell shows as many as the size allows. */
  rows: ListRow[];
  /** Clocks this kind contributes to the header's Next deadline chip. */
  deadlines: BoardDeadline[];
  /** One plain line, for the widget's accessible description. */
  summary: string;
  /** Where the widget's Open link goes. */
  to: string;
  /** Overrides the kind's own empty message, when the reason is not "nothing there". */
  emptyMessage?: string;
}

/** One read's state, as `useRouteSnapshot` reports it. */
export interface FeedState<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
}

/** The synced SP Extraction settings and the hub price, read by hooks. */
export interface SpExtras {
  monitoring: boolean;
  thresholdSp: number;
  price: ExtractionPrices;
}

export interface FeedMap {
  wallet: WalletPanelData;
  skills: SkillsQueuePanelData;
  orders: OpenOrdersPageSnapshot;
  mining: MiningTaxBoardData;
  planetary: PlanetaryBoardData;
  industry: IndustryBoardData;
  contracts: ContractsBoardData;
  calendar: CalendarEventsBoardData;
  mail: MailBoardData;
  priceAlerts: PriceAlertsBoardData;
  /** `board` is null when the pilot stocks no market. */
  stock: { board: StockBoardData | null };
  structures: StructuresBoardData;
  moonChunks: MoonChunksBoardData;
  incursions: IncursionsBoardData;
  spExtras: SpExtras;
}

export type FeedId = keyof FeedMap;
export type Feeds = { [K in FeedId]?: FeedState<FeedMap[K]> };

/** What an adapter needs besides the feeds. */
export interface BuildContext {
  t: Translate;
  now: number;
  /** The header Character; null with none (the route redirects before that matters). */
  activeCharacterId: number | null;
  /** This widget reads across every Character, and its kind can sum them. */
  scopeAll: boolean;
  /** The `characterNotTraining` alert is on for this Character, so an idle queue is a warning. */
  notTrainingAlert: boolean;
}
