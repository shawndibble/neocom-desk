# Scope decisions (round 18) — Mail page rebuild

_Recorded 2026-09-01._

- **Tab bar over folder sidebar.** The existing `Tabs` component switches
  between System Labels (Inbox/Sent/Corp/Alliance) plus a synthetic **All**
  tab; list pane and reading pane sit side by side beneath it, the same
  two-region shape as the Market Browser. A persistent sidebar earns its
  keep at Gmail's folder counts, not five fixed ones.
- **Category buckets come from ESI's `/mail/labels/` endpoint**, not derived
  locally from `recipients`/`from` — authoritative, and its `unread_count`
  is used as-is rather than computed client-side from cached headers.
- **Custom Labels are out of v1.** A fixed 5-tab bar has no room for a
  character's unbounded custom labels without overflow handling (a "more"
  menu) — later ticket.
- **No `last_mail_id` pagination.** The Mail page keeps ESI's single-call
  50-most-recent cap, same as today; going beyond it is a separate feature
  (loading state, per-category cache interplay with an unfiltered
  `last_mail_id` stream), not what makes 30 items feel broken today.
- **No subject/sender search.** Once mail splits across up to 5 buckets, no
  single bucket is likely to need searching within it.
- **Tabs**: All (default), Inbox, Corp, Alliance, Sent — in that order, each
  carrying `/mail/labels/`'s `unread_count` as a badge. A header matching no
  recognized System Label folds into Inbox.
- **One-line mail row**: sender, subject, received date, and System Label
  tag all render on a single line (not the old two-line stack), same fields
  on every tab — including the tag on non-All tabs, traded for one row
  layout instead of a conditional one. **Narrow screens drop the date**
  from the row (mockup's `.phone .mail-date { display: none; }`): sender +
  subject + tag already compete hard for ~340px, and the date is the one
  field also visible in the reading pane once a mail is open, so it's the
  one that can go first.
- **List pane shrink-to-fits** up to a max-height, then scrolls internally;
  it does not take a fixed full-viewport height. The reading pane keeps its
  own independent scroll, so a long body never stretches the page.
- **Reading pane gains a "To:" line** above the body, names resolved the
  same way the existing sender name already is.
- **Narrow screens reuse the Market Browser's one-column-at-a-time
  pattern**: tab bar + list, replaced by reading pane + back control on
  selecting a mail. The tab strip itself scrolls horizontally within its own
  bar on narrow widths rather than gaining a second narrow-only rendering
  (icon-only tabs, wrapping, etc.).
- **Export CSV is removed**, not just re-scoped. Tab-filtered mail buckets
  make "export what I'm looking at" ambiguous enough (which tab? unioned
  across tabs?) that dropping the feature is cleaner than picking a scoping
  rule for a button that predates the tabs.
