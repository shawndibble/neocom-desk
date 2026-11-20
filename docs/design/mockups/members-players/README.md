# Members page with Players: three mockups

Static Storybook mockups (no working code) of `/corp/members` once **Player** groups exist. All three use the same fixture: four Players (one with a never-mining primary and an outside **Officer claim**, one with a **Self-proven link** outside the corp, one with a silent alt, one with a legacy pending guest), plus a conflict, a declined link and seven solo members. Stories: `src/mockups/CorpMembersPlayersA|B|C.stories.tsx`. Images are `<story id>-1440.png` and `-390.png`. Character portraits show as "?" because Storybook has no image network.

Shared rules: last-seen stays per character; outside-corp characters read **"No data"**, never "Never" or amber; per-character chips are "Not signed in yet" (Officer claim), "Pending", "Declined", "Conflict".

| | A: Players view | B: Flat rows, visibly linked | C: One row per Player + drawer |
|---|---|---|---|
| Idea | `Characters \| Players` switch; Player parent row expands to its alts in the same columns | Rows stay one per character as today; a link chip ("2 of 4"), a left rule and a Main pill tie siblings together | Table lists Players; row click opens a drawer with every character |
| Last seen per character | In expanded rows | Every row, always | Only in the drawer; table shows Latest and Oldest |
| Find a whole group | Search auto-expands the Player | Click the chip: filter to that Player | Search a Player; open the drawer |
| Outside-corp alt | Muted row under its Player | Ghost row (opt-in) | Card in the drawer |
| Cost | Sort and `?highlight` must understand groups | No Mobbin precedent; needs a per-Player tint token | Weakest at scanning each character at a glance |
| Today vs proposed | `a--today` is the current page | | |

Research: Toggl and Salesforce (expandable parent rows), Qatalog and Airtable (group-by toggle), Clerk and Spellbook (primary tag), incident.io and Hotjar (linked identities in a drawer), Kajabi (primary picker). Search-returns-the-whole-group and sibling tinting have no product precedent.

Not validated: a real browser at 768/1024/1280, and Player tints (B borrows clock-kind tokens as stand-ins).
