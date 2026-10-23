/**
 * The uniform shape every Widget Kind's data takes, whatever it reads.
 *
 * A kind's reads ("feeds", shared between kinds that need the same one) are
 * kept raw; `models.ts` turns them into a `KindView` at render time. Nothing
 * here knows about React, Dexie or fetch, so the adapters stay testable with
 * plain fixtures.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';
import type { DayZone } from '@/engine/localDay';
import type { EsiEndpointId } from '@/esi/registry';
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
} from '../../data/boardData';
import type { IncursionsBoardData } from '../../data/incursionsBoard';
import type { CorpContractsFeed, CorpOrdersFeed } from './corpFeeds';
import type {
  CorpAssetsFeed,
  CorpCustomsFeed,
  CorpRoleAuditFeed,
  CorpJobsFeed,
  CorpKillsFeed,
  CorpMembersFeed,
  CorpMiningFeed,
  CorpSovereigntyFeed,
  CorpStarbasesFeed,
  CorpWalletFeed,
} from './corpFeeds';
import type { CorpStockTargets } from '@/features/corp/stockTargets';
import type { BoardDeadline } from '../nextDeadline';
import type { WidgetStateInput } from '../state';
import type { CalendarEventsChoice, WidgetRange } from '../layout';
import type { ChartModel } from '../charts/types';
import type { SkillsQueuePanelData, WalletPanelData } from './loaders';
import type {
  ClonesWidgetData,
  JournalData,
  LocationWidgetData,
  LpWidgetData,
  HaulingWidgetData,
  BelowMarketWidgetData,
  JumpTimersWidgetData,
  MercenaryDensWidgetData,
  SurveyWidgetData,
  MiningYieldWidgetData,
  NetWorthWidgetData,
  ProfitWidgetData,
  RouteSafetyWidgetData,
  KillsWidgetData,
  OmegaWidgetData,
  TradingProfitWidgetData,
  SovRaidsWidgetData,
} from './kindLoaders';

/** The narrow slice of i18next's `t` the adapters need. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The one line under the headline figure. It must add a fact the headline
 * lacks (a delta, the nearest item, how old); a line that restates the
 * headline is deleted, not shortened. At Small it stays on one line.
 */
export interface NumberSecondary {
  text: string;
  /** Draws a direction glyph before the text; the text always carries the meaning too. */
  direction?: 'up' | 'down' | 'flat';
  /** Good or bad for the pilot (income up is good, undercuts up is bad), not the sign. */
  tone?: 'good' | 'bad' | 'caution';
}

/** A widget's headline figure. Always shown, whatever the view. */
export interface NumberModel {
  /** Display text. When `iskAmount` is set the shell draws an `IskAmount` and this is its plain-text form. */
  value: string;
  /** An ISK figure, drawn as shorthand with the exact value one gesture away (DESIGN §6c). */
  iskAmount?: number;
  /** What the figure counts ("undercut", "ISK"). */
  unit?: string;
  /** At most one structured line under the figure. */
  secondary?: NumberSecondary;
  /** Plain dim lines under the secondary: the Number view only (the chart and table carry the same in their own notes). */
  notes?: string[];
  /** The severity ladder's tone; `clear` draws plain. */
  tone: DeadlineSeverity;
  /** A follow-on link under the figure, the Number view only (Open orders' "Work through (N)"). */
  link?: { label: string; to: string };
}

export interface ListRow {
  key: string;
  title: string;
  detail?: string;
  /** The right-hand figure or clock. */
  value: string;
  iskAmount?: number;
  tone: DeadlineSeverity;
  /** Set only when the row leads somewhere narrower than the widget's own title link. */
  to?: string;
}

/**
 * A table cell: plain text, text with the exact ISK behind it (drawn as an
 * `IskAmount`), or text with a good/caution/bad colour (never the only signal:
 * the text states it) and/or a thin bar (0..1) drawn before it.
 *
 * The one shared rule (`cellKit.ts` holds the helpers):
 * - A signed change is `good` above zero and `bad` below; zero or unknown has
 *   no tone. The sign in the text stays, so colour is never the only signal.
 *   A column that only runs one way (income, spending) tones by direction.
 *   A cell with an `iskAmount` cannot carry a tone.
 * - A `bar` is only for a real 0..1 quantity (progress, a share of a whole, time
 *   left of a known span). A count or a bare duration gets no bar.
 * - The text always states the value; the bar and the colour are decoration.
 *   `TableBody` reads and announces `text` only.
 */
export type TableCell =
  | string
  | { text: string; iskAmount: number }
  | { text: string; tone?: 'good' | 'caution' | 'bad'; bar?: number };

export interface TableColumn {
  key: string;
  /** Header text; a table whose labels are all empty draws no header row. */
  label: string;
  align?: 'start' | 'end';
  /** Which columns survive a narrow widget: lower is kept longer (default: the column's position). */
  priority?: number;
  /**
   * The one column that takes the leftover width and truncates, for a long free-text column
   * (a mail subject). Without it the first column does; with it the first column only keeps
   * what its text needs, up to a cap.
   */
  grow?: boolean;
  /**
   * Hidden until the table's own box is at least 28rem across (a container query on the
   * table wrapper, so it follows the box, not the viewport). For a column the row reads fine
   * without, such as an order's side or station, so a narrow box keeps the first column's text.
   * This is a second, CSS-only way to drop a column beside `priority` and the size's budget.
   */
  hideNarrow?: boolean;
  /** Px this column needs (header or widest typical cell, plus padding); used when the table sets `fitWidth`. Default 64. */
  minWidth?: number;
  /**
   * On the first column: never narrower than 7rem, however many other columns are drawn.
   * Opt-in, because a floor can push a table past its widget: set it only where the first
   * column's text is the point (an item name) and the other columns are few.
   */
  nameFloor?: boolean;
  /**
   * The header becomes a sort button. Needs a matching entry in each row's `sort`, since the
   * cell text is display-only ("1.2M", "3d 4h") and sorting it would order strings, not values.
   */
  sortable?: boolean;
}

export interface TableRowModel {
  key: string;
  /** One cell per column, in column order. */
  cells: TableCell[];
  /** One sort key per column, in column order; `undefined` sinks the row to the end. Only read for `sortable` columns. */
  sort?: (number | string | undefined)[];
  /** A severity dot before the first cell; absent or `clear` draws none. */
  tone?: DeadlineSeverity;
  /** Set only when the row leads somewhere narrower than the widget's own title link. */
  to?: string;
  /**
   * The row opens a modal with these facts instead of linking away (DESIGN §6c
   * "Widget rows"). A row has `to` or `detail`, never both.
   */
  detail?: RowDetailModel;
}

/** What a widget row's modal shows: plain data, drawn by the widget shell. */
export interface RowDetailModel {
  title: string;
  /** Labelled facts, in reading order; each value is already formatted. */
  facts: { label: string; value: string }[];
  /** Where it is: Set destination, and the jump count as a link to Route Safety. */
  place?: { systemId: number; name: string; jumps?: number };
}

export interface TableModel {
  columns: TableColumn[];
  rows: TableRowModel[];
  /**
   * Pages instead of cutting at the size's row limit and printing "+N more", for a table whose
   * every row matters (undercut orders: a hidden one is a missed relist). Only takes effect
   * where the caller also passes `paging`.
   */
  pageable?: boolean;
  /** Opt in to never scrolling sideways: columns beyond what the measured box holds (by `priority`, `minWidth`) are dropped. */
  fitWidth?: true;
  /** One quiet line under the rows ("38 of 49 slots"), when the table has a fact that is not a row. */
  footer?: string;
}

export interface KindView {
  status: WidgetStateInput;
  /** When the read behind it landed; null when not known. */
  fetchedAt: Date | null;
  /** The read came from cache, not a live fetch. */
  fromCache: boolean;
  number: NumberModel;
  /** Every row; the Table view shows as many as the size allows. Becomes a two or three column table unless `table` is set. */
  rows: ListRow[];
  /** The kind's own columns; absent means the table is derived from `rows` (see `tableModel.ts`). */
  table?: TableModel;
  /** Clocks this kind contributes to the header's Next deadline chip. */
  deadlines: BoardDeadline[];
  /** One plain line, for the widget's accessible description. */
  summary: string;
  /** Where the widget's title link goes; null for a kind with no page of its own yet. */
  to: string | null;
  /** Overrides the kind's own empty message, when the reason is not "nothing there". */
  emptyMessage?: string;
  /** Overrides the generic line under the empty message, when the kind has something more useful to say. */
  emptyHint?: string;
  /** Endpoints whose permission is missing while the rest of the widget reads fine: a Grant access is drawn under the body. */
  grantEndpoints?: readonly EsiEndpointId[];
  /** Text for a link from the empty state to `to`, for a kind whose page is where its data gets made. */
  emptyLinkLabel?: string;
  /**
   * The kind's chart, when it has one and the data to draw it. Only the Chart
   * view draws it (the Number view is a number, never a mini chart); at Large
   * and Full the table sits beside it. Absent means the Chart view falls back
   * to the Number.
   */
  chart?: ChartModel;
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
  sovRaids: SovRaidsWidgetData;
  spExtras: SpExtras;
  journal: JournalData;
  netWorth: NetWorthWidgetData;
  profit: ProfitWidgetData;
  miningYield: MiningYieldWidgetData;
  lp: LpWidgetData;
  survey: SurveyWidgetData;
  hauling: HaulingWidgetData;
  belowMarket: BelowMarketWidgetData;
  clones: ClonesWidgetData;
  jumpTimers: JumpTimersWidgetData;
  mercenaryDens: MercenaryDensWidgetData;
  location: LocationWidgetData;
  routeSafety: RouteSafetyWidgetData;
  kills: KillsWidgetData;
  omega: OmegaWidgetData;
  tradingProfit: TradingProfitWidgetData;
  corpWallet: CorpWalletFeed;
  corpJobs: CorpJobsFeed;
  corpCustoms: CorpCustomsFeed;
  corpAssets: CorpAssetsFeed;
  /** The synced stock targets for every corporation, read by a hook, not loaded. */
  corpStockTargets: CorpStockTargets;
  corpRoleAudit: CorpRoleAuditFeed;
  corpMembers: CorpMembersFeed;
  corpMining: CorpMiningFeed;
  corpStarbases: CorpStarbasesFeed;
  corpSovereignty: CorpSovereigntyFeed;
  corpContracts: CorpContractsFeed;
  corpOrders: CorpOrdersFeed;
  corpKills: CorpKillsFeed;
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
  /** The widget's time window in days, for kinds that read one (applied over shared data here, never in a loader). */
  range: WidgetRange;
  /** The widget's Omega plan (PLEX per 30 days), for kinds that read one. */
  plexPer30Days?: number;
  /** Which calendar events a Coming up widget lists; left out, accepted and tentative. */
  calendarEvents?: CalendarEventsChoice;
  /** The Time format clock days are cut on (`useTimeZone`); left out, the machine's own. */
  zone?: DayZone;
}
