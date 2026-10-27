# Scope decisions — Settings notifications order and collapsible All Characters

_Recorded 2026-09-25._

- **Mobile tabs is part of Display, not a section of its own.** The rail is one entry shorter. A `/settings/mobileTabs` link now lands on Display, the default.
- **"This device" is no longer a section. Its one action, Log out of all characters, is a card at the bottom of Data & storage,** titled "Log out". Behaviour is unchanged (`20260925-084119`). A `/settings/device` link, which nothing in the app makes, lands on Display too.
- **On a phone the section select sits on the right of the page header, on the title's line,** not in a row of its own under it.
- **A Character's notification events read in a fixed order: ordinary events, Quickbar price alerts last among them, then Corp notifications, then EVE notifications.** EVE notifications is last because it is the longest list and would push everything else off screen. This is display order only; the catalog order the poller and the projection read is untouched.
- **Corp notifications is a group, headed like an EVE family:** a label with a select-all per channel, and the five corp events indented beneath it. The "Needs the Corporation permission" line and its Grant button, and the "best-effort, fires only while the app is open" note, appear once on the group header instead of on every row. A corp event a Character has no in-game role for still shows its own row-level explanation, because that is a per-event fact.
- **The All Characters section collapses like a Character's own section, starts collapsed, and stays where it is** above the search box. Its header keeps the broadcast select-all column, so flipping one channel for everyone does not need it opened. Its event list uses the same order and the same Corp notifications group.
