# PostHog: turning it on

Everything is wired and OFF until a key is set. Nothing else to build.

## What it captures
- **App (posthog-react-native + @posthog/react-native-plugin, in builds from 3.1.5/348):**
  screen views (every navigation), taps (component name + testID only, never their text),
  app lifecycle, the existing funnel events (`lib/analytics.ts` mirrors every `track()`),
  every failed API call (`api_error`: endpoint pattern, method, status, network flag),
  uncaught JS errors, unhandled promise rejections, `console.error`, native crashes,
  and crashes caught by the in-app error boundary.
- **Session replay:** text inputs, images and the system contacts picker masked; recording is
  paused on Chat, TaskGuide, ChannelChat and AdminUserChat; never records anyone running Peptidemax.
- **Identity:** account id only (`identify(user.id, {is_paid, is_admin})`), reset on sign-out.
- **Backend (`services/posthog_server.py`):** every unhandled 500/503 as an exception, with the
  route pattern and the caller's account id, so it lines up with their app session.

## To turn it on (after the key arrives)
1. App: put `EXPO_PUBLIC_POSTHOG_KEY=phc_…` in `mobile/.env` and in `eas.json` → `build.production.env`.
   (EU project? also set `EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`.)
2. OTA to every runtime that has the native plugin (3.1.5 and later). Older runtimes get the
   JS-only part (events, errors) but no replay.
3. Backend: set `POSTHOG_API_KEY` (and `POSTHOG_HOST` if EU) on BOTH Render services, restart.
4. Policies: merge maxweb branch `posthog-disclosure` (health-data + privacy pages); the in-app
   copies already ship in the app.
5. PostHog project settings: turn on Session replay ("Record user sessions") and Error tracking
   (exception autocapture). Owner: App Store Connect → App Privacy: add Usage Data (Product
   Interaction), Diagnostics (Crash, Performance, Other) and Identifiers (User ID), linked to the
   user, not tracking (see mobile/app-store-privacy-questionnaire.txt).
