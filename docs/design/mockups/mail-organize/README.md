# Mail organize: mark unread, delete, label tags

First draft mockup; sample data. Story: `mockups-mailorganize--*` (`src/mockups/MailOrganize.stories.tsx`). Issue links are added once the tickets exist.

Everything here reads and writes ESI (`esi-mail.organize_mail.v1`, the existing **Mail organize** Write to EVE Permission, off by default, asked for on first use). No new Permission, no new Dexie table, nothing synced. When the Permission is not held the new menu items are not shown and the existing grant note applies.

| Picture | What it shows |
|---|---|
| [row-menu-1440](row-menu-1440.png) / [phone](row-menu-phone-390.png) | The row's existing ⋮ menu gains **Mark as unread** (or **Mark as read**) and **Delete…**, set apart and red. Custom label names show as quiet tags under the row and in the reader. |
| [reader-menu-1440](reader-menu-1440.png) | The reader's existing ⋮ menu gains the same two items. |
| [selecting-1440](selecting-1440.png) / [phone](selecting-phone-390.png) | **Select** in the page header swaps the unread dots for checkboxes and shows a selection bar: Mark read, Mark unread, Delete…. The header button becomes Done. New component: `SelectionBar`. |
| [delete-confirm-1440](delete-confirm-1440.png) | One confirm, in words: deleted in EVE too, cannot be undone. |

Why this shape (Mobbin references): an action menu with the destructive item last and separated ([Quo](https://mobbin.com/screens/dfea71ab-f939-48cd-a568-c4330ae52c31)), a "N selected" bar with the destructive action apart ([Customer.io](https://mobbin.com/screens/0596b84f-f48a-4e08-86df-052f7333ff9d)), a short "cannot be undone" confirm ([Hilos](https://mobbin.com/screens/7f1abbfc-f504-4ae7-b680-a046aeef4731)), quiet inline label tags on list rows ([Plain](https://mobbin.com/screens/1764602c-b875-482f-a13f-059bf78c15b7)).

Deliberately left out: a "Label as…" action (ESI replaces the whole label array, so a stale set could clobber labels changed in game), label filter chips (removed 2026-09-05), creating or deleting labels.
