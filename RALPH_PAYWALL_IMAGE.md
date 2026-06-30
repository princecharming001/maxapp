# RALPH_PAYWALL_IMAGE.md — paywall background must fill the whole screen (Ralph loop)

> Persistent build spec for a Ralph loop. **Read in full each iteration.** Do the first
> unchecked UNIT, run its VERIFY, log it, `commit + push` (prefix `paywall-img:`),
> continue. When every COMPLETION CRITERION passes, emit the completion promise and stop.

## GOAL
The **"Unlock Your Potential" paywall** (`mobile/screens/payment/PaymentScreen.tsx`)
background image must take up the **ENTIRETY of the screen** — full-bleed, edge to edge,
with no zoom-cropping that loses the composition and no empty/cream bands. Keep iterating
until it looks the way the owner wants. If the current image simply can't fill the screen
in its format, **regenerate it** (see U3).

## ENVIRONMENT REALITY (read before U0)
- **There is NO Maestro MCP** — use the Maestro **CLI**:
  `~/.maestro/bin/maestro --device <BOOTED_UDID> test <flow.yaml>` with `- takeScreenshot: <path>`.
  Get the booted sim UDID via `xcrun simctl list devices booted`.
- This build rejects `accessibilityId:` — use `text:`; the tour/modal content isn't
  queryable, so use `tapOn: { point: "x%, y%" }` point-taps when text taps fail.
- **Downscale screenshots before reading them** (`PIL thumbnail` to ≤760px) — the
  image-read API rejects anything over ~2000px.
- The background is a bundled **asset** (`mobile/assets/paywall-dust.webp`), so changes
  to the image OR to `resizeMode`/layout show on a **Metro reload** — NO native rebuild
  needed. (Reload: `xcrun simctl terminate booted com.cannon.mobile` then `launch`, or
  shake→Reload.)

## CONSTRAINTS (every iteration)
- Commit each unit to `main` and push (owner's standing deploy rule). `cd mobile && npx tsc --noEmit` clean.
- Do NOT break the paywall's other content (title, plan cards, CTA) — they must stay legible over the image.
- NEVER claim it's fixed from code alone — only a **Maestro screenshot of the actual paywall** counts.
- Only touch `PaymentScreen.tsx` + `assets/paywall-dust.webp` (and a Higgsfield-generated replacement). Leave other sessions' uncommitted files alone (selective `git add`).

## UNITS

### [ ] U0 — Reach the paywall on the sim + baseline screenshot
Find the reliable way to land on the "Unlock Your Potential" `PaymentScreen` on the booted
sim (via the `DEV` drawer → unpaid → funnel, or by driving the funnel, or a deep link).
Write `mobile/maestro/paywall.yaml` that opens the app and navigates there, then
`takeScreenshot`. Downscale + inspect.
**VERIFY:** a screenshot that clearly shows the paywall.

### [ ] U1 — Diagnose the fill gap
From the U0 screenshot, state precisely how it fails: is the dust **zoom-cropped** (content
cut off at the sides), **letterboxed** (cream bands top/bottom), or does the composition
just not reach the edges (empty middle/margins)? Note the image's pixel size + aspect
(`PIL`) vs the device aspect (e.g. 1290×2796 ≈ 0.461).
**VERIFY:** written diagnosis + the two aspect numbers.

### [ ] U2 — Fix by rendering first (cheapest)
Make `resizeMode="cover"` and ensure the asset's aspect matches the phone (it was padded to
~0.462). If cover now fills edge-to-edge with the whole composition visible, done. Reload →
Maestro screenshot.
**VERIFY:** screenshot shows the image filling the full screen, content legible.

### [ ] U3 — If rendering can't do it, REGENERATE the image
If the dust is centred with dead space so it can't fill the screen, regenerate via Higgsfield
(`generate_image`, model `nano_banana_pro`) at the **phone's tall portrait aspect** (request
9:16 or taller; target ≈0.46) with a composition that **fills the frame edge-to-edge** —
brand orange + blue dust/wisps over the cream canvas (match the Explore max-icon hues), no
big empty center, gentle so the title/plans stay legible. Remove the background if needed
(`remove_background`), convert to webp, replace `assets/paywall-dust.webp`. Reload → screenshot.
**VERIFY:** screenshot shows a full-bleed image, no empty bands, no important content cropped.

### [ ] U4 — Final confirmation
Maestro screenshot of the finished paywall: image fills the entire screen AND the title,
plan cards, and CTA are clearly readable over it. Downscale + attach in the log.
**VERIFY:** the owner-desired full-screen effect is visible in the screenshot.

## COMPLETION CRITERIA
1. The paywall image fills the **entire screen** edge-to-edge, verified by a Maestro screenshot.
2. Title / plan cards / CTA remain legible over it.
3. `tsc` clean; changes committed + pushed to `main`; no other session's files swept in.

Completion promise (emit verbatim only when all hold):
> PAYWALL IMAGE COMPLETE — fills the full screen, verified on the sim via Maestro screenshot.

## ITERATION LOG
- (none yet)
