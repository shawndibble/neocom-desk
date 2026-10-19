# Scope decisions — overview is a widget grid the pilot builds

_Recorded 2026-10-11._

- **The Overview is a free grid of Widgets the pilot chooses, sizes, orders,
  renames and removes.** The fixed board of domain cards, the summary strip and
  the phone "Everything else" fold are retired. Each Widget is a Widget Kind
  instance shown as a Number, Chart or List. Full record and verification
  checklist: `docs/design/overview-widgets.md`; mockup deleted when its tickets
  closed (in git history).
- **Size is width, not height.** S, M, L and Full are a third, half, two thirds
  and all of a row. Rows are packed in order with no gap-filling, so reading
  order is screen order.
- **Alerts leave the page.** The bell in every page header opens the alerts
  panel (popover on desktop, sheet on phone), an unacknowledged danger Alert
  also shows as a banner on the Overview, and `/alerts` redirects to the
  Overview with the panel open. Mark all read never clears a danger Alert;
  Acknowledge does.
- **One Overview Layout per pilot, not per Character,** synced like the hidden
  Overview cards setting it replaces. One list serves desktop and phone; a
  Widget can be set to Hide on phone.
- **First run asks for Roles** (Trader, Industrialist, Planetary industry,
  Miner, Fighter, Explorer and hauler) and builds the Layout from them; absence
  of a stored Layout is what marks a first run.
- **Clones and Employment history stay as pages** beside the Overview tab.
  Nothing is deleted.
