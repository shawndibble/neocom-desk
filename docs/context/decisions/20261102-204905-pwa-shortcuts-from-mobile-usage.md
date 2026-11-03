# Scope decisions — pwa shortcuts from mobile usage

_Recorded 2026-11-02._

- **The four home-screen shortcuts are Alerts, Mail, Wallet (`/wallet/balance`) and Open orders, in that order.** Chosen from Google Analytics for Oct 5 – Nov 1, 2026 (163 mobile users of 490): these are the feature pages phone users open more than desktop users do (mobile is about 33% of users and views overall; Alerts 74% of its views, Mail 50%, Wallet Balance 45%, Orders at baseline), and none is in the phone's default tab bar. Replaces Route planner and Pilot lookup, which sat at or below the baseline (Pilot lookup: 9 mobile users).
- **A shortcut is not picked by raw page-view rank.** Industry Plans, Market Browser and Skill Plans top the mobile list only because the default tab bar (Overview, Skills, Industry, Market) and the section redirects (`/skills` → `/skills/plans`) land phone users on them; their mobile share is at the baseline. They are already one tap away, so a shortcut would duplicate the bar. Overview is what the icon opens, so it is never a shortcut.
- **Samples are small, so ranks are a judgement, not a measurement.** Revisit with fresh analytics if the default tab bar changes or Android's four-shortcut limit is lifted.
