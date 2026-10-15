# Community Requests (Requests tab)

Source: `src/mockups/CommunityRequests.stories.tsx` (`mockups-communityrequests--*`). Sample data. **The ticket's Agent Brief wins over the picture where they differ**, but a ticket that builds any of these screens implements them as shown: same layout, same primitives, same wording of controls. Scope: `docs/context/decisions/20261014-221403-community-requests-a-non-locking-board-of-requests.md`, ADR 0021.

New components (dashed, labelled in the pictures): `RequestsTab`, `PledgeBar` (delivered / pledged / needed as one stacked bar with the figures printed beside it, never colour alone), `RequestPanel`, `PledgeRow` (a line with its inline quantity field and Pledge button), `ComposeRequestDialog`. Everything else is an existing `src/components/ui` primitive: `Tabs`, `FilterChip`, `SearchInput`, `NativeSelect`, `DataTable` (dense phone cards), `SlideOver`, `Modal`, `TextInput`, `TextArea`, `Checkbox`, `EmptyState`.

The board counts **lines** ("1 delivered · 2 pledged · 3 needed lines"), never summed units: ore and BPC copies do not add. Units appear per line in the side panel.

| Screen | 1440 | 390 |
|---|---|---|
| Board: Requests tab, filters, table | ![](board-1440.png) | ![](board-390.png) |
| Side panel, as a Member: inline quantity + Pledge, over-pledge note, Message | ![](panel-member-1440.png) | ![](panel-member-390.png) |
| Side panel, as the requester: Extend, Close request, no Pledge controls | ![](panel-requester-1440.png) | |
| Compose, step 1: location, terms, pasted list, lines, add an item | ![](compose-lines-1440.png) | ![](compose-lines-390.png) |
| Compose, step 2: who to mail, day's mail count | ![](compose-recipients-1440.png) | |
| Empty state | ![](empty-1440.png) | |

Not shown, specified in the ticket text: My pledges slide-out (the same shape as My sharing), the loading and failed states (as the other Community tabs), and the Message button's behaviour (opens an in-game mail).

## Deviations in the first build (issue #3807)

The Requests tab, board, read-only side panel, compose step 1 and the empty state are built (`pages-communities--requests-*` stories). Where they differ from the pictures:

- **Not built, by scope (other tickets):** Pledge controls and the over-pledge note (#3808), the delivery note and Message button, the "My pledges" button and the "and 1 Pledge in progress" half of the strip (#3808), the "I can fill" chip and the distance select (#3811), compose step 2 and the mail count (#3810). The strip reads "You have N open Requests." and carries only New request….
- **Compose button:** step 1 ends in **Post request** (posts without mail) where the picture has "Next: who to mail".
- **Statuses and bars:** with no Pledges yet every Request is Open and every bar is empty. Closed and Expired exist as statuses (Mine lists a closed Request so it can be reopened) and are not pictured.
- **Panel title:** the requester sees "Your request" (the picture's "You's request" is the sample name run through the template).
- **Panel for a Member:** only the terms and each line's progress, no controls. The requester's panel reads Reopen request when closed.
- **Added to compose:** a blueprint line gets a Blueprint copy / Original (loan) select and, for a copy, optional Runs, ME and TE fields on a second row (the scope decision lets a BPC line carry them; the picture has no entry point). A line is typed by name: a type name ending "Blueprint".
- **Pasted list** is the proportional font like the picture, not monospace; unrecognised pasted names are listed under the box.
- **Search results** list under the add box as a plain list of buttons.
- **Search placeholder** ends in "…" (the i18n convention test requires it).
- **Column header** Age has no default sort (rows arrive newest first); Request, Status and Age sort.

Delete this folder and the story when the last ticket that links it closes.
