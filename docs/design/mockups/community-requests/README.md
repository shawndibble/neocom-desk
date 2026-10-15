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

Delete this folder and the story when the last ticket that links it closes.
