# Scope decisions — Ship tree map scales with text size via the camera, not rem (issue #3732)

_Recorded 2026-10-14 · issue #3732._

- **The Ship Tree map scales as a unit with the text-size setting, by multiplying the camera zoom.** `shipTree.css` stays px: `SHIP_TREE_GEOMETRY`, edge paths, Ωs and emblems share one px space, so rem would desync lines from tiles. Rules out the rem conversion in the issue body.
