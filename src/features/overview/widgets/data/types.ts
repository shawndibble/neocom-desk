/**
 * The uniform shape every Widget Kind's data takes, whatever it reads.
 *
 * A kind's reads ("feeds", shared between kinds that need the same one) are
 * kept raw; `models.ts` turns them into a `KindView` at render time. Nothing
 * here knows about React, Dexie or fetch, so the adapters stay testable with
 * plain fixtures.
 */
import type { DeadlineSeverity } from '@/engine/character/severity';
import type { TypedAccelerator } from '@/engine/accelerator';
import type { DayZone } from '@/engine/localDay';
import type { EsiEndpointId } from '@/esi/registry';
import type { StockBoardData } from '@/features/stockTargets/stockBoard';
import type { ExtractionPrices } from '@/features/character/useExtractionPrices';
import type { OpenOrdersPageSnapshot } from '@/features/market/openOrdersPageSnapshot';
import type { CalendarBoardData } from '@/features/character/calendarBoardData';
import type { SharedPopTimePref } from '@/features/character/calendarSharedPops';
import type { CharacterBoardItemKind } from '@/engine/character/board';
import type {
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
import type { CorpContractsFeed, CorpOrdersFeed, CorpSrpFeed } from './corpFeeds';
import type {
  CorpAssetsFeed,
  CorpCustomsFeed,
  CorpRoleAuditFeed,
  CorpJobsFeed,
  CorpKillsFeed,
  CorpMembersFeed,
  CorpMiningFeed,
  CorpSovereigntyFeed,
  CorpDeadlinesAllFeed,
  CorpAllFeed,
  CorpStarbasesFeed,
  CorpWalletFeed,
} from './corpFeeds';
import type { CorpStockTargets } from '@/features/corp/stockTargets';
import type { BoardDeadline } from '../nextDeadline';
import type { WidgetStateInput } from '../state';
import type {
  CalendarEventsChoice,
  CampaignFaction,
  ProfitSource,
  RaidsWhere,
  WidgetRange,
  WidgetShow,
} from '../layout';
import type { ChartModel, DonutChartModel } from '../charts/types';
import type { ScopeGroup } from '@/esi/registry';
import type { TurnInOfferDetail } from '@/features/campaigns/useTurnIns';
import type { MilitaryCampaignsWidgetData } from '@/features/campaigns/militaryCampaignsWidget';
import type { SkillsQueuePanelData, WalletPanelData } from './loaders';
import type {
  ClonesWidgetData,
  JournalData,
  WalletAllData,
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
import type { MarketTrendFeed } from './marketTrendLoader';
import type { Translate } from '@/lib/translate';
import type { LayerId } from '@/engine/netWorth/series';

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
  /**
   * Progress rings beside the figure, each a `donut` chart (Military Campaigns: how complete a
   * campaign is). One ring sits beside `value`; several replace it, each with its `label`.
   */
  rings?: { key: string; label: string; donut: DonutChartModel }[];
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
  /** An ISK figure; `prefix` is a short translated word or sign drawn before it ("≤"). */
  | { text: string; iskAmount: number; prefix?: string }
  /** Short text with more behind it (a ticker, the corporation's full name in a tooltip). */
  | { text: string; hint: string }
  /** Text followed by a share mark (`ShareMark`): `label` is its tooltip, `off` slashes it. */
  | { text: string; share: { label: string; off: boolean } }
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
   * A secondary free-text column that truncates past 8rem, so the first column keeps the rest
   * of the row, and is hidden while the table's own box is under 24rem (a phone), where the
   * first column needs it all (Military Campaigns' holdings beside the objective). Not with `grow`.
   */
  capped?: boolean;
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
   * "Widget rows"). A row has `to`, `detail` or `info`, never two.
   */
  detail?: RowDetailModel;
  /** The row is an item: it opens that type's Show info (the app-wide Item Detail). Never with `to` or `detail`. */
  info?: { typeId: number };
  /** A short tag before the first cell's text (a campaign's faction). */
  badge?: string;
  /**
   * A campaign turn-in: the row opens `TurnInDetail` for the item, not a modal (DESIGN §6c).
   * Never with `to`, `detail` or `info`.
   */
  turnIn?: TurnInRowModel;
}

/** What a turn-in row's `TurnInDetail` shows: the item, its offer, and whose Participate. */
export interface TurnInRowModel {
  name: string;
  offer: TurnInOfferDetail;
  characterId: number;
  characterName: string;
  /** "You hold 640 · ~37.1M turned in"; left out when nothing is held. */
  surfaceLine?: string;
}

/** What a widget row's modal shows: plain data, drawn by the widget shell. */
/** The tones a `RowDetailModel` badge can take (the `Pill` tones). */
export type DetailTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface RowDetailModel {
  title: string;
  /** A status line above the facts: an optional toned badge, then plain text, then an optional dim note. */
  status?: { badge?: string; tone?: DetailTone; text?: string; note?: string };
  /**
   * Labelled facts, in reading order; each value is already formatted. `tone: 'warning'` flags
   * a value to doubt (stale data); the text says why, so colour is never the only signal.
   */
  facts: { label: string; value: string; tone?: 'warning' }[];
  /** Bars under their own heading, each with a badge and a readout (a den's Development and Anarchy). */
  meters?: {
    title: string;
    items: {
      label: string;
      badge: string;
      value: number;
      max: number;
      readout: string;
      note?: string;
    }[];
  };
  /** A titled list, each entry a toned badge, its text and a trailing value. */
  list?: {
    title: string;
    /** `badge` and `tone` are left out for a plain line (a Shared Pop's ore). */
    items: { key: string; badge?: string; tone?: DetailTone; text: string; value: string }[];
  };
  /** Where it is: Set destination, and the jump count as a link to Route Safety. */
  place?: {
    systemId: number;
    name: string;
    jumps?: number;
    /** A player structure to send as the autopilot destination; absent, the system is sent. */
    structureId?: number;
  };
  /** One in-app destination the record leads on to (a Shared Pop's Survey start link). */
  link?: { label: string; to: string };
  /** A second, quieter destination beside `link` (a Shared Pop's "start a new Survey" next to "Open survey"). */
  secondaryLink?: { label: string; to: string };
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
  /** Overrides the kind's description under the empty message, when the kind has something more useful to say. */
  emptyHint?: string;
  /** The message says it all (good news, or a mode the kind's description doesn't fit): no description. */
  emptyHealthy?: boolean;
  /** Endpoints whose permission is missing while the rest of the widget reads fine: a Grant access is drawn under the body. */
  grantEndpoints?: readonly EsiEndpointId[];
  /**
   * Who a Grant access asks, when not the active Character: an account-wide kind whose
   * missing permission is another Character's. Asking the active one would open EVE for
   * a grant it already holds.
   */
  grantCharacterId?: number;
  /** That Character's name, for the Grant access title, when `grantCharacterId` is set. */
  grantCharacterName?: string;
  /**
   * Some Characters in the widget's scope lack a Permission the rest have: one `GrantCellMark`
   * in the header, for the first of them, naming how many more there are.
   */
  headerMark?: { characterId: number; characterName: string; permission: ScopeGroup; why: string };
  /** Text for a link from the empty state to `to`, for a kind whose page is where its data gets made. */
  emptyLinkLabel?: string;
  /**
   * The kind's chart, when it has one and the data to draw it. Only the Chart
   * view draws it (the Number view is a number, never a mini chart); at Large
   * and Full the table sits beside it. Absent means the Chart view falls back
   * to the Number.
   */
  chart?: ChartModel;
  /**
   * One of the kind's reads has not answered yet (no data, still loading) although the view
   * already draws (a secondary read, such as the Wallet's journal under its balance): the body
   * is not at its settled height yet. A refresh over data on screen is not settling.
   * Set by `useKindViews`, never by a builder.
   */
  settling?: boolean;
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
  /** Every Character's colonies regrouped as one board (the Planetary widget on All characters). */
  planetaryAll: PlanetaryBoardData;
  industry: IndustryBoardData;
  contracts: ContractsBoardData;
  /** Every Character's mail folded into one board (the Mail widget on All characters). */
  mailAll: MailBoardData;
  /** Every Character's contracts as one board (the Contracts widget on All characters). */
  contractsAll: ContractsBoardData;
  /** The Calendar page's whole board read: every clock the Character can read. */
  calendar: CalendarBoardData;
  /** Every Character's calendar board folded into one (the Calendar widget on All characters). */
  calendarAll: CalendarBoardData;
  mail: MailBoardData;
  priceAlerts: PriceAlertsBoardData;
  /** `board` is null when the pilot stocks no market. */
  stock: { board: StockBoardData | null };
  structures: StructuresBoardData;
  moonChunks: MoonChunksBoardData;
  /** Every readable corporation's, merged: what a widget scoped to All characters reads. */
  structuresAll: StructuresBoardData;
  moonChunksAll: MoonChunksBoardData;
  corpDeadlinesAll: CorpDeadlinesAllFeed;
  corpWalletAll: CorpAllFeed<CorpWalletFeed>;
  corpJobsAll: CorpAllFeed<CorpJobsFeed>;
  corpKillsAll: CorpAllFeed<CorpKillsFeed>;
  incursions: IncursionsBoardData;
  sovRaids: SovRaidsWidgetData;
  spExtras: SpExtras;
  /** Every Character's typed-in accelerator, a hook not a load (Training's expiry). */
  accelerator: ReadonlyMap<number, TypedAccelerator>;
  journal: JournalData;
  /** Every Character's wallet balance (the Wallet's All characters read). */
  walletAll: WalletAllData;
  /** Every Character's journal merged (Wallet flow's All characters read). */
  journalAll: JournalData;
  netWorth: NetWorthWidgetData;
  profit: ProfitWidgetData;
  /** Every Character's logged runs (Profit's Builds source on All characters). */
  profitAll: ProfitWidgetData;
  miningYield: MiningYieldWidgetData;
  lp: LpWidgetData;
  survey: SurveyWidgetData;
  hauling: HaulingWidgetData;
  belowMarket: BelowMarketWidgetData;
  clones: ClonesWidgetData;
  jumpTimers: JumpTimersWidgetData;
  mercenaryDens: MercenaryDensWidgetData;
  militaryCampaigns: MilitaryCampaignsWidgetData;
  location: LocationWidgetData;
  routeSafety: RouteSafetyWidgetData;
  kills: KillsWidgetData;
  omega: OmegaWidgetData;
  marketTrend: MarketTrendFeed;
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
  /** The five above across every corporation the pilot's Characters can read (All scope). */
  corpCustomsAll: CorpCustomsFeed;
  corpStarbasesAll: CorpStarbasesFeed;
  corpSovereigntyAll: CorpSovereigntyFeed;
  corpContractsAll: CorpContractsFeed;
  corpOrdersAll: CorpOrdersFeed;
  corpAssetsAll: CorpAllFeed<CorpAssetsFeed>;
  corpSrpAll: CorpSrpFeed;
  corpMembersAll: CorpMembersFeed;
  corpRoleAuditAll: CorpRoleAuditFeed;
  corpKills: CorpKillsFeed;
  corpSrp: CorpSrpFeed;
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
  /** Which calendar events a Calendar widget lists; left out, accepted and tentative. */
  calendarEvents?: CalendarEventsChoice;
  /** The Clock Kinds a Calendar widget leaves out; left out, none. */
  hiddenKinds?: CharacterBoardItemKind[];
  /** Skyhook raids: whose space it lists; left out, My alliance. */
  raidsWhere?: RaidsWhere;
  /** Skyhook raids Near me: the jumps radius; left out, the default. */
  raidsRadius?: number;
  /** Profit: which earnings it adds up; left out, Builds. */
  profitSource?: ProfitSource;
  /** Net worth: the layers switched off; left out, all show. */
  hiddenLayers?: LayerId[];
  /** Military Campaigns: whose campaign it shows; left out, All. */
  campaignFaction?: CampaignFaction;
  /** Market Trend: the items it draws; left out, the Quickbar's first. */
  trendItems?: number[];
  /** Market Trend: the Trade Hubs it prices at; left out, the pilot's Market hub. */
  trendHubs?: string[];
  /** A kind with a Show setting: what it draws (`kinds.ts` lists each kind's); left out, the default. */
  show?: WidgetShow;
  /** The Time format clock days are cut on (`useTimeZone`); left out, the machine's own. */
  zone?: DayZone;
  /** The Calendar's Pop Time choice for Shared Pops (`useSharedPopTime`); left out, as shared. */
  sharedPopTime?: SharedPopTimePref;
}
