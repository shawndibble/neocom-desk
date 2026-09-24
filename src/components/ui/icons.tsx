/**
 * The app's icon vocabulary.
 *
 * One pack, one weight, imported per icon. Phosphor's `light` weight is the
 * only shortlisted set with a genuinely 1px-native face rather than a thinned
 * 2px one, which is what DESIGN.md §3's hairline rule needs — a 2px default
 * reads as a heavier line than every border on the page. Sizes follow the type
 * scale in `rem`, not `px`, so they grow with Settings' text-size control
 * alongside the text they label.
 *
 * Import icons FROM HERE, never from `@phosphor-icons/react` directly: this
 * module is what keeps the weight and the sizing consistent, and what makes
 * swapping the pack a single-file change. Add a re-export here when you need a
 * glyph the app doesn't have yet.
 */

/*
 * Imported one module deep (`dist/csr/<Name>`) rather than as 80 specifiers
 * off `@phosphor-icons/react`. That barrel re-exports 3045 icons, and a bare
 * import of it costs ~1.4s — a price Vitest pays *per test file*, because
 * every module graph reaching this one drags the whole barrel in. It was
 * 33% of the unit-test job: the 126 jsdom test files that reach this module
 * had a median collect time of 1128ms against 25ms for the 56 that don't.
 * Deep imports took the dom project's import bucket from 182.0s to 34.3s.
 *
 * Each per-icon module exports both `Foo` and the newer `FooIcon`, so the
 * specifiers below are unchanged; only where they come from is. `eslint`'s
 * `no-restricted-imports` rule keeps the barrel from creeping back.
 */
import { ArrowBendUpLeft } from '@phosphor-icons/react/dist/csr/ArrowBendUpLeft';
import { ArrowBendUpRight } from '@phosphor-icons/react/dist/csr/ArrowBendUpRight';
import { ArrowClockwise } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise';
import { ArrowDown } from '@phosphor-icons/react/dist/csr/ArrowDown';
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp';
import { ArrowsDownUp } from '@phosphor-icons/react/dist/csr/ArrowsDownUp';
import { ArrowsLeftRight } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight';
import { Bell } from '@phosphor-icons/react/dist/csr/Bell';
import { BellSlash } from '@phosphor-icons/react/dist/csr/BellSlash';
import { BlueprintIcon } from '@phosphor-icons/react/dist/csr/Blueprint';
import { Broadcast } from '@phosphor-icons/react/dist/csr/Broadcast';
import { Buildings } from '@phosphor-icons/react/dist/csr/Buildings';
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CaretDoubleDown } from '@phosphor-icons/react/dist/csr/CaretDoubleDown';
import { CaretDoubleUp } from '@phosphor-icons/react/dist/csr/CaretDoubleUp';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretLeft } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CaretUpDown } from '@phosphor-icons/react/dist/csr/CaretUpDown';
import { ChartLineUp } from '@phosphor-icons/react/dist/csr/ChartLineUp';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { Checks } from '@phosphor-icons/react/dist/csr/Checks';
import { Clipboard } from '@phosphor-icons/react/dist/csr/Clipboard';
import { CloudSlash } from '@phosphor-icons/react/dist/csr/CloudSlash';
import { Code } from '@phosphor-icons/react/dist/csr/Code';
import { Columns as ColumnsGlyph } from '@phosphor-icons/react/dist/csr/Columns';
import { Copy } from '@phosphor-icons/react/dist/csr/Copy';
import { DotsSixVertical } from '@phosphor-icons/react/dist/csr/DotsSixVertical';
import { DotsThreeVertical } from '@phosphor-icons/react/dist/csr/DotsThreeVertical';
import { DownloadSimple } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { EnvelopeSimple } from '@phosphor-icons/react/dist/csr/EnvelopeSimple';
import { Export as ExportIcon } from '@phosphor-icons/react/dist/csr/Export';
import { Eye } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlash } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { Factory } from '@phosphor-icons/react/dist/csr/Factory';
import { FileText } from '@phosphor-icons/react/dist/csr/FileText';
import { Flag } from '@phosphor-icons/react/dist/csr/Flag';
import { Flask } from '@phosphor-icons/react/dist/csr/Flask';
import { FolderSimple } from '@phosphor-icons/react/dist/csr/FolderSimple';
import { Funnel } from '@phosphor-icons/react/dist/csr/Funnel';
import { Gauge } from '@phosphor-icons/react/dist/csr/Gauge';
import { Gear } from '@phosphor-icons/react/dist/csr/Gear';
import { GraduationCap } from '@phosphor-icons/react/dist/csr/GraduationCap';
import { Hammer } from '@phosphor-icons/react/dist/csr/Hammer';
import { Info as InfoGlyph } from '@phosphor-icons/react/dist/csr/Info';
import { ListBullets } from '@phosphor-icons/react/dist/csr/ListBullets';
import { LockKey } from '@phosphor-icons/react/dist/csr/LockKey';
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
import { Package } from '@phosphor-icons/react/dist/csr/Package';
import { PaperPlaneRight } from '@phosphor-icons/react/dist/csr/PaperPlaneRight';
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { Planet } from '@phosphor-icons/react/dist/csr/Planet';
import { Play } from '@phosphor-icons/react/dist/csr/Play';
import { Plus } from '@phosphor-icons/react/dist/csr/Plus';
import { Prohibit } from '@phosphor-icons/react/dist/csr/Prohibit';
import { Queue } from '@phosphor-icons/react/dist/csr/Queue';
import { Receipt } from '@phosphor-icons/react/dist/csr/Receipt';
import { Scales } from '@phosphor-icons/react/dist/csr/Scales';
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { ShoppingCart } from '@phosphor-icons/react/dist/csr/ShoppingCart';
import { SignIn as SignInGlyph } from '@phosphor-icons/react/dist/csr/SignIn';
import { Sliders } from '@phosphor-icons/react/dist/csr/Sliders';
import { SquaresFour } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { Stack } from '@phosphor-icons/react/dist/csr/Stack';
import { Star } from '@phosphor-icons/react/dist/csr/Star';
import { Table as TableGlyph } from '@phosphor-icons/react/dist/csr/Table';
import { Target } from '@phosphor-icons/react/dist/csr/Target';
import { Tray } from '@phosphor-icons/react/dist/csr/Tray';
import { UsersFour } from '@phosphor-icons/react/dist/csr/UsersFour';
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree';
import { Wallet as WalletGlyph } from '@phosphor-icons/react/dist/csr/Wallet';
import { Warning } from '@phosphor-icons/react/dist/csr/Warning';
import { WarningOctagon } from '@phosphor-icons/react/dist/csr/WarningOctagon';
import { X } from '@phosphor-icons/react/dist/csr/X';
import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react/dist/lib/types';
import type { ComponentType } from 'react';

export type { IconProps };

/**
 * Every icon in the app renders at this weight. Exported so a one-off that
 * needs a Phosphor glyph not yet re-exported below can still match.
 */
export const ICON_WEIGHT = 'light' as const;

/** Sized in `rem` so icons scale with the root font-size like their labels do (DESIGN.md §2). */
export const ICON_SIZE = {
  /** 1rem — inline with `text-sm` body copy and inside dense rows. */
  sm: '1rem',
  /** 1.25rem — the default for toolbar and row controls. */
  md: '1.25rem',
  /** 1.5rem — navigation affordances that carry a whole row, e.g. breadcrumb back. */
  lg: '1.5rem',
} as const;

function withWeight(Glyph: PhosphorIcon): ComponentType<IconProps> {
  function Wrapped({ size = ICON_SIZE.md, weight = ICON_WEIGHT, ...rest }: IconProps) {
    return <Glyph size={size} weight={weight} {...rest} />;
  }
  Wrapped.displayName = `Icon(${Glyph.displayName ?? 'Glyph'})`;
  return Wrapped;
}

/** Steps back up one level in the Assets drill-down; also the generic "go back". */
export const Back = withWeight(CaretLeft);
/** A row you can descend into. */
export const Descend = withWeight(CaretRight);
/** A disclosure that is currently open. */
export const Expanded = withWeight(CaretDown);
/** Flattens a drill-down tree into one flat list of every item beneath it. Deliberately not `Sort`, which marks a sortable column — this changes what the view contains, not the order it comes in. */
export const FlatList = withWeight(ListBullets);
/** A column that can be sorted but currently isn't. */
export const Sort = withWeight(CaretUpDown);
/** Ascending: a sorted-ascending column, or "move this row up". */
export const Ascending = withWeight(ArrowUp);
/** Descending: a sorted-descending column, or "move this row down". */
export const Descending = withWeight(ArrowDown);
/** Re-fetch from ESI. */
export const Refresh = withWeight(ArrowClockwise);
/** Puts a field back to the value it would have had if nobody had touched it. Deliberately not `Refresh`, which fetches new data — these sit two controls apart on the Industry panel. */
export const Revert = withWeight(ArrowCounterClockwise);
/** Runs a local calculation right now — no fetch involved. Deliberately not `Refresh`, which re-fetches from ESI. */
export const Run = withWeight(Play);
/** Download the current view as CSV. */
export const Download = withWeight(DownloadSimple);
/** Search / filter. */
export const Search = withWeight(MagnifyingGlass);
/** Multi-select mode. */
export const Select = withWeight(Check);
/** Pin — filled when pinned, outline when not (pass `weight="fill"`). */
export const Pin = withWeight(Star);
/** Search across every character on the account. */
export const AllCharacters = withWeight(UsersThree);
/** A container or a ship's bay — anything holding other assets. */
export const Container = withWeight(Package);
/** Marks a Blueprint Acquisition row (issue #838) as the blueprint itself, not a material it consumes. */
export const Blueprint = withWeight(BlueprintIcon);
/**
 * A **Build Group**: several Build Plans kept and costed together (issue
 * #626). A folder rather than `Container`'s box, which already means a
 * physical thing holding assets in space — a Build Group holds plans, which
 * are not anywhere.
 */
export const BuildGroup = withWeight(FolderSimple);
/**
 * Put two or more of something side by side on the same measures — Build
 * Plans, or a Quickbar's items. Scales rather than `Route`'s left-right
 * arrows, which already mean "pick one of two options" and sit a couple of
 * controls away on the same page.
 */
export const Compare = withWeight(Scales);
/** Route preference (shortest vs safest). */
export const Route = withWeight(ArrowsLeftRight);
/** Bulk-writes a chosen hub/facility/security/build-system onto every plan in a Build Group (issue #632) — the same crosshair `OptimizeAtMarkers`/`PriceAlert` use, for retargeting a group. */
export const RetargetGroup = withWeight(Target);
/** Something is incomplete or unresolved — pairs with `warning` text, never used alone. */
export const Warn = withWeight(Warning);
/** Opens a longer explanation of the numbers on screen, e.g. a Build Plan's calculation breakdown. */
export const Info = withWeight(InfoGlyph);
/**
 * The Corp ops board's severity ladder, shaped as well as coloured (issue
 * #419) — `SEVERITY_TONE`'s four colours alone are not a signal for a
 * colorblind reader. `warning` reuses `Warn` rather than a fifth glyph; the
 * other three are their own icons so all four differ in outline, not only hue.
 */
export const SeverityCritical = withWeight(WarningOctagon);
/** Worth watching, not yet due. */
export const SeverityWatch = withWeight(Eye);
/** Nothing pending. */
export const SeverityClear = withWeight(CheckCircle);
/** Clear a field, dismiss a panel. */
export const Close = withWeight(X);
/** Edit a name in place — the rename affordance on a saved-plan row. */
export const Rename = withWeight(PencilSimple);
/**
 * Grab a row to drag it. The six-dot grip is the near-universal handle mark,
 * and DESIGN.md §5 wants an SVG here rather than the `⠿` braille dingbat the
 * older drag lists spell it with.
 */
export const DragHandle = withWeight(DotsSixVertical);
/** Copy a saved plan to a new one. */
export const Duplicate = withWeight(Copy);
/** Put text on the clipboard — the same glyph as `Duplicate`, named for the other sense of "copy". */
export const CopyToClipboard = withWeight(Copy);
/** Generates a link that reproduces a view for someone without the app open. */
export const Share = withWeight(ShareNetwork);
/** Confirms an action that leaves nothing on screen to look at, e.g. a copy that went to the clipboard. */
export const Done = withWeight(Check);
/** Overflow menu. */
export const More = withWeight(DotsThreeVertical);
/** Send the plan queue to the clipboard or a CSV download (#224 icon-only toolbar). */
export const Export = withWeight(ExportIcon);
/** Pull the character's live skill queue into the plan (#224 icon-only toolbar). */
export const ImportQueue = withWeight(Queue);
/** Parse a pasted skill queue into the plan (#224 icon-only toolbar) — a plain clipboard, for "paste in". */
export const ImportClipboard = withWeight(Clipboard);
/** Tune remaps for the lowest total training time (#224 icon-only toolbar). */
export const OptimizeRemaps = withWeight(Sliders);
/** Drop a remap marker at the current end of the queue (#224 icon-only toolbar). */
export const AddMarker = withWeight(Flag);
/** Tune remaps against the plan's existing markers (#224 icon-only toolbar). */
export const OptimizeAtMarkers = withWeight(Target);
/** Open the mobile filter sheet — the one control a narrow filter row collapses to (`FilterBar`). */
export const Filter = withWeight(Funnel);
/** Reorder the queue by priority/attribute pair (#224 icon-only toolbar). */
export const SuggestReorder = withWeight(ArrowsDownUp);
/** A build plan material this character is better off manufacturing or growing than buying. */
export const Build = withWeight(Hammer);
/** The same verdict the other way: buying the material beats producing it. */
export const Buy = withWeight(ShoppingCart);
/** A build plan material this character is better off reacting than buying (issue #460) — its own glyph, not the manufacturing hammer or the planetary globe. */
export const Reaction = withWeight(Flask);
/** Promote a derived prereq row into a real Skill Plan entry (CONTEXT.md "Prereq Promotion"). */
export const AddToPlan = withWeight(Plus);
/** Append a new row to an editable list, e.g. another Booster (#1407). */
export const AddRow = withWeight(Plus);
/** A row's browser-notification channel is currently on (issue #364). */
export const BrowserNotifyOn = withWeight(Bell);

/**
 * Marks a Notification Event the backend can schedule ahead of time, so it
 * arrives with the app closed. Deliberately not another bell: the Bell family
 * above already means "the browser-notification channel", and this is a
 * property of the event, not of a channel.
 */
export const ScheduledPush = withWeight(Broadcast);
/** A row's browser-notification channel is currently off (issue #364). */
export const BrowserNotifyOff = withWeight(BellSlash);
/** Hide a Notification Feed row's type from the feed (issue #364) — one-way from here, reversible in Settings. */
export const HideInFeed = withWeight(EyeSlash);
/** A Quickbar item's price alert target (issue #680) — the same crosshair `OptimizeAtMarkers` uses for a different feature, distinct by name here. */
export const PriceAlert = withWeight(Target);
/** Open every collapsible group at once. */
export const ExpandAll = withWeight(CaretDoubleDown);
/** Close every collapsible group at once. */
export const CollapseAll = withWeight(CaretDoubleUp);

// The Login page's feature list (src/routes/Login.tsx) is the one caller for
// most of the section below — grouped here so a reader can see they're a set.
/** Skill training and progression. */
export const Skills = withWeight(GraduationCap);
/** Manufacturing build plans. */
export const Industry = withWeight(Factory);
/** Live order books. */
export const Market = withWeight(ChartLineUp);
/** Balance and open orders. */
export const Wallet = withWeight(WalletGlyph);
/** Colonies and extraction timers. */
export const Planetary = withWeight(Planet);
/** An extractor program's live telemetry — the one PI card with real-time data. */
export const Extraction = withWeight(Gauge);
/** Mail, calendar and contacts, grouped as one row. */
export const Social = withWeight(EnvelopeSimple);
/**
 * The four System Label mail folders (CONTEXT.md), as the glyphs that let a
 * mail row say which folder it is in without spending a hue on it — see
 * `docs/context/decisions/` (Mail rows go two-line). Corp reuses
 * `Corporation` below rather than taking a fifth glyph: it is the same
 * organisation this app draws Buildings for everywhere else.
 */
export const MailInbox = withWeight(Tray);
export const MailSent = withWeight(PaperPlaneRight);
export const MailAlliance = withWeight(UsersFour);
/** Reply and Forward, on the reading pane's compose actions. */
export const MailReply = withWeight(ArrowBendUpLeft);
export const MailForward = withWeight(ArrowBendUpRight);
/** Jump clones and implants. */
export const Clones = withWeight(Stack);
/** A calendar event — the Coming Up rail's own kind. */
export const CalendarEvent = withWeight(CalendarBlank);
/** Contracts — courier, item exchange, auction. */
export const Contracts = withWeight(FileText);
/** Corporation-owned surfaces: ops board, wallet divisions, roster, corp assets. */
export const Corporation = withWeight(Buildings);
/** The Moon Mining Tax ledger. Its own glyph, not the industry factory — this is rent, not production. */
export const MoonMining = withWeight(Moon);
/**
 * The notification *feature* as a whole, as sold on the login page. Distinct
 * from `BrowserNotifyOn`/`BrowserNotifyOff`, which are the two states of one
 * row's toggle and must stay a pair.
 */
export const Notifications = withWeight(Bell);
/**
 * Where a feature's own preferences live — the Alerts page's shortcut into
 * Settings, say. The destination, not an action, so it is never the glyph on a
 * button that changes something.
 */
export const Settings = withWeight(Gear);
/**
 * Clear every alert currently listed. A double check, not a bin: dismissal is
 * a flag and the rows stay stored (CONTEXT.md, Notification Feed) — a delete
 * glyph would promise a destruction that does not happen.
 */
export const DismissAll = withWeight(Checks);
/** Works with no connection: the installed PWA serving what it last fetched. */
export const Offline = withWeight(CloudSlash);
/** A character's own open market orders, as distinct from `Market`'s general price lookup. */
export const Orders = withWeight(Receipt);
/** Read-only access — the app never writes to the player's account. */
export const ReadOnly = withWeight(ShieldCheck);
/** Credentials that stay on the device. */
export const TokenPrivacy = withWeight(LockKey);
/** A build row no character on the account has the skills to install. */
export const SkillLocked = withWeight(LockKey);
/** The project's source being public. */
export const OpenSource = withWeight(Code);
/** Start the EVE SSO round trip. Replaces the `▶` dingbat the login button used to draw (DESIGN.md §5). */
export const SignIn = withWeight(SignInGlyph);
/**
 * A contact this character has flagged to watch. Same glyph as
 * `SeverityWatch`, kept separate because that one is a notification severity
 * and this one is a per-contact flag — they are free to diverge.
 */
export const Watched = withWeight(Eye);
/** A contact this character has blocked. */
export const Blocked = withWeight(Prohibit);
/** Card-grid view mode toggle. */
export const CardsView = withWeight(SquaresFour);
/** Table view mode toggle. */
export const TableView = withWeight(TableGlyph);
/** Opens the column-visibility picker for a table. */
export const ColumnsPicker = withWeight(ColumnsGlyph);
