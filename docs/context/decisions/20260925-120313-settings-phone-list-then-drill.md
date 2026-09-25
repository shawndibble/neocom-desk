# Scope decisions — Settings phone list-then-drill (issue #1673)

_Recorded 2026-09-25 · issue #1673._

- **On a phone, bare `/settings` is a grouped list of sections; each row drills into its section, with a back link to the list.** This replaces the section select, and supersedes the earlier "mocked up and dropped" note: the missing piece was an index state, now `PageTabs.index` (`{ hiddenFrom }`, a media query). Below it the bare base path renders the page instead of redirecting; from it up (`md`) it still redirects to Display. Other tabbed pages declare none and are unchanged.
- **The list has no "Log out" row.** Log out stays a card in Data & storage (`DevicePanel`), per the earlier decision; the issue title's "its own row" is overruled.
- **Row summaries come only from settings already in memory** (Display, Shortcuts, Industry, Market, Characters, Corporation). Sections with nothing cheap to say get none; nothing is fetched to fill one in.
