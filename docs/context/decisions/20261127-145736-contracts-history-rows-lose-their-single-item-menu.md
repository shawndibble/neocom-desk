# Scope decisions — Contracts history rows lose their single-item menu; Open in EVE lives in the contract detail

_Recorded 2026-11-27._

- **A Contracts history row has no ⋮ and no custom right-click; Open in EVE
  for a contract lives in its detail side panel only.** This narrows
  `20261014-130951` ("a contract opens from its detail modal and its row
  menu"). The row menu held one item, Open in EVE, which breaks the ⋮ rule of
  `20261005-200824` (two or more real actions), and the detail one click away
  already carries it beside the copy-id button. The UX audit of Nov 2026
  (S-063) found the ⋮ also widened the table at 768. The table keeps its
  export right-click (`exportable`).
