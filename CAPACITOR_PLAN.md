# Codemine — Cross-Platform App Plan (Web + iOS + Android)

> Status: APPROVED, deferred. Follow up ONLY after the platform is verified flawless + on par with
> Lovable (reliability guarantee earned). Also requires: design the mobile app interface first.

## Approach
Codemine is a Next.js app (SSR + auth + API routes), so use **Capacitor loading the hosted app**:
a native shell (iOS + Android) whose webview points at the live Codemine (`server.url`), plus native
plugins. This keeps ALL server logic working and produces a genuine native binary with native APIs.
It is a **separate build target** — it does NOT touch the generation pipeline or platform code, so it's
safe to build without destabilizing anything.

## Phase 1 — Wrap (both platforms)
- Add Capacitor: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`.
- `capacitor.config` → `server.url = https://<codemine live domain>`.
- App icon, splash screen, status bar, safe-area insets, Android hardware back button.

## Phase 2 — Native features (makes it a REAL app + required for Apple approval)
- **Push notifications** (APNs + FCM) — "your build is ready" (ties into walk-away runs) + re-engagement. THE key native feature.
- **Deep links / universal links** — open a project directly in the app.
- **Mobile builder UX** — the single-screen redesign (chat/preview/cloud toggles) so it feels native, not a cramped desktop page. **Do this FIRST.**
- **Design the mobile app interface** (native-feeling nav, onboarding, account) — a dedicated design pass.

## Phase 3 — Store submission
- **Apple:** Developer account ($99/yr), App Store Connect, screenshots, privacy labels, review. iOS review rejects thin web-wrappers → the Phase-2 native features are what pass it. Expect 1–2 review rounds.
- **Google:** Play Console ($25 once), listing, review (lenient; Capacitor/TWA both fine).

## Effort + sequencing
~1–2 weeks incl. review. Prereqs, in order: (1) reliability guarantee earned, (2) mobile builder
redesign, (3) mobile app interface design, THEN (4) Capacitor wrap + native features + submit.

## Why it grows the business
Most users are phone-first; a real store presence (both platforms) + push-driven re-engagement widens
the customer base and makes Codemine feel solid from day one.
