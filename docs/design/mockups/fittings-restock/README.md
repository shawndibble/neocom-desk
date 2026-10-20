# Appraisal: From my Fittings

Source: `src/mockups/FittingsRestock.stories.tsx` (`mockups-fittingsrestock--proposed`). Sample data; the ticket text wins over the picture. Issue #4550.

Only the input card changes; the result table is the existing Appraisal's and is drawn as a dashed placeholder. The one result-side addition is the dashed "Send to Build Group…" entry in the actions menu.

New component: `FittingsSourcePicker` (the Fittings list with hull-count steppers). The title select is the existing `Select` in the card title.

| Story | 1440 | 390 |
|---|---|---|
| `proposed`: From my Fittings, menu open | ![](proposed-1440.png) | ![](proposed-390.png) |
| `paste-source`: Paste, Recent returns | ![](paste-source-1440.png) | ![](paste-source-390.png) |
| `no-assets`: no Assets read, existing grant note | ![](no-assets-1440.png) | ![](no-assets-390.png) |
| `nothing-buildable`: no Send to Build Group entry | ![](nothing-buildable-1440.png) | ![](nothing-buildable-390.png) |

The phone shots clip the bottom of the open menu; the desktop shots show it in full.
