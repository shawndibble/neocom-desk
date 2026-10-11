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
import type { WidgetRange } from '../layout';
import type { ChartModel } from '../charts/types';
import type { SkillsQueuePanelData, WalletPanelData } from './loaders';
import type {
  ClonesWidgetData,
  JournalData,
  LocationWidgetData,
  LpWidgetData,
  SurveyWidgetData,
  MiningYieldWidgetData,
  NetWorthWidgetData,
  ProfitWidgetData,
  RouteSafetyWidgetData,
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
}

export interface TableRowModel {
  key: string;
  /** One cell per column, in column order. */
  cells: TableCell[];
  /** A severity dot before the first cell; absent or `clear` draws none. */
  tone?: DeadlineSeverity;
  /** Set only when the row leads somewhere narrower than the widget's own title link. */
  to?: string;
}

export interface TableModel {
  columns: TableColumn[];
  rows: TableRowModel[];
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
  spExtras: SpExtras;
  journal: JournalData;
  netWorth: NetWorthWidgetData;
  profit: ProfitWidgetData;
  miningYield: MiningYieldWidgetData;
  lp: LpWidgetData;
  survey: SurveyWidgetData;
  clones: ClonesWidgetData;
  location: LocationWidgetData;
  routeSafety: RouteSafetyWidgetData;
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
}
