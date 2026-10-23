# Character achievement score and title (issue #4777)

Sources: `src/mockups/ContactsScoreTitle.stories.tsx`, `CharactersScoreTitle.stories.tsx`, `PublicInfoScoreTitle.stories.tsx`, `OverviewScoreTitle.stories.tsx`. Each runs the real page in the real shell. `ScoreTitleInject.tsx` and `scoreTitleTargets.tsx` add the new pieces into the page, with a dashed outline around each one. Sample data. Where the ticket and the pictures differ, the ticket wins.

No new components. The new pieces are one text line (`Title · 1,240 points`) and one optional table column (`Title / Score`, title over points).

A Character with a score of 0 and no title shows nothing new. In the pictures that is Pell Ashgrove (Contacts) and Orsa Tellemar (Characters).

## Contacts

The Columns button (the column picker) already shows on both widths, on This character and on All characters. Proposed: the picker gets one new entry, off by default. Contacts is not in the ticket. It was added at review.

|                                               | 1440                                   | 390                                   |
| --------------------------------------------- | -------------------------------------- | ------------------------------------- |
| Today                                         | ![](contacts-today-1440.png)           | ![](contacts-today-390.png)           |
| Proposed: column on                           | ![](contacts-proposed-1440.png)        | ![](contacts-proposed-390.png)        |
| Columns menu today                            | ![](contacts-picker-today-1440.png)    | ![](contacts-picker-today-390.png)    |
| Columns menu, proposed (new entry, unchecked) | ![](contacts-picker-proposed-1440.png) | ![](contacts-picker-proposed-390.png) |

On a phone, the column joins each row's meta line, the same way Corp / Alliance does. Corporation and alliance contacts get a dash, and the dash is hidden on a phone.

## Show info (the public info modal)

The line goes under the corporation · alliance line. The Character tab is Pilot Lookup's `PilotProfileView`, so Travel › Pilot Lookup gets the line too.

|          | 1440                             | 390                             |
| -------- | -------------------------------- | ------------------------------- |
| Today    | ![](show-info-today-1440.png)    | ![](show-info-today-390.png)    |
| Proposed | ![](show-info-proposed-1440.png) | ![](show-info-proposed-390.png) |

## Characters page

Card view: the line goes under the corporation and alliance lines. Table view: an optional column after Name, off by default. On a phone the table scrolls sideways, so the cell keeps two lines.

|                            | 1440                                     | 390                                     |
| -------------------------- | ---------------------------------------- | --------------------------------------- |
| Cards today                | ![](characters-cards-today-1440.png)     | ![](characters-cards-today-390.png)     |
| Cards proposed             | ![](characters-cards-proposed-1440.png)  | ![](characters-cards-proposed-390.png)  |
| Table today                | ![](characters-table-today-1440.png)     | ![](characters-table-today-390.png)     |
| Table proposed (column on) | ![](characters-table-proposed-1440.png)  | ![](characters-table-proposed-390.png)  |
| Columns menu, proposed     | ![](characters-picker-proposed-1440.png) | ![](characters-picker-proposed-390.png) |

At Cozy density a long title and a big score do not fit on the card, and the line cuts off (`2,315 poi…`). The line truncates, the same as the corporation line above it. Give it a `title` attribute so the full text can still be read.

## Overview

The ticket says "`character` widget". No widget of that name exists. `character` is a widget category. The Character header (`CharacterHeader`, the header above the widgets) is the place that describes the Character, so the line goes there, under the corporation.

| | 1440 | 390 |
|---|---|---|
| Today | ![](overview-today-1440.png) | ![](overview-today-390.png) |
| Proposed | ![](overview-proposed-1440.png) | ![](overview-proposed-390.png) |

## Data facts (checked 2026-10-23)

- `COMPATIBILITY_DATE` is already `2026-08-01`, which is later than 2026-06-09. No bump is needed.
- ESI's OpenAPI spec at that date (`CharactersDetail`) has these fields:
  - `achievement_score`: an `int64`.
  - `character_title_id`: a `UUID` string, the "equipped cosmetic title".
  - `corporation_title`: the old `title` string, renamed.
- Live calls return `achievement_score` even when it is `0`. No pilot in the sample had `character_title_id`. It is left out when the pilot shows no title.
- `CharacterPublicInfo` (`src/esi/endpoints/character.ts`) lacks both new fields. Its `title?: string` is now `corporation_title`. No code reads it, so the field is a leftover.
- `GET /corporations/{id}/titles` still has `title_id`, so role audit is not affected by the rename.
- Title names are in CCP's JSONL export, file `characterTitles.jsonl`. Build 3607705 has 45 rows. Each row has a UUID `_key` and a localised `name` (use `name.en`).
  - `scripts/build-sde.mjs` already downloads that export. It does not extract this file yet, so the SDE bake needs a new table.

## What the build touches

- **Show info:** `PilotProfile` and `loadPilotProfile` (`src/features/travel/pilotLookup.ts`) carry only corp and alliance. Both need the two fields. The line goes in `PilotIdentity` (`PilotProfileView.tsx`).
- **Character card and Overview header:** `stores/publicInfo` carries only corp and alliance names. `CharacterCard` and `CharacterHeader` read from it. The store needs the two fields.
- **Characters table:** one new id in `characterColumns.ts`, kept out of `DEFAULT_VISIBLE_CHARACTER_COLUMNS`. Its cell goes in `charactersTableColumns.tsx`.
- **Contacts:** one new id in `contactsColumns.ts`, plus a default-visible list that leaves it out. Its cell goes in `useContactsCharacterColumns.tsx`.
- The ticket's "phone card" and "Character card" bullets are the same thing. On a phone the Characters page shows `CharacterCard` in card view, and the table scrolls sideways.

## Decided: when to fetch

ESI has no bulk route for the score and title, so each character costs one `GET /characters/{id}`. Affiliations come from one bulk POST, but this data does not.

- **Contacts:** fetch only while the Title / Score column is on. The column is off by default, so most people make no extra calls. Cache the results under the long static window, as `publicInfoData.ts` does today.
- **Skip what can never have a score or title.** Corporation, alliance and faction contacts are never fetched. NPC agents (`isNpcCharacterId`) are never fetched either. Their cells show the dash.
- **Show info:** `loadPilotProfile` already reads the public record, so the line adds no calls. An NPC agent gets `NpcCharacterCard`, which has no line. The Corporation and Alliance tabs have no line.
- **Characters page and Overview header:** your own Characters are never NPCs. `stores/publicInfo` already reads their public record, so the fields add no calls.
