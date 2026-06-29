# RALPH_FACE_MESH.md — live white face-landmark mesh on the scan (Ralph loop)

> Persistent build spec for a Ralph loop. **Read in full each iteration.** Do the first unchecked UNIT, run its VERIFY, log it (Iteration Log), `commit + push` (prefix `mesh:`), continue. Native steps the loop CANNOT do itself (a dev rebuild) are marked **HUMAN** — stop and ask the user to run them, then resume. When all COMPLETION CRITERIA pass, emit the completion promise and stop.

## GOAL

On the face-scan **capture** screen, overlay a real-time **white face-landmark mesh** that tracks the user's face (like the reference screenshot — a dense dot mesh + "Your face here" guide), in WHITE. It must track smoothly, sit correctly over the live front-camera preview, and **not break** the existing 3-angle capture → `FaceScanResults` flow.

## HARD REALITY (read before U0)

- This needs **native modules** → an **EAS/dev rebuild**. It **cannot run on a simulator** (no camera). Per the owner's decision: **the loop plans + writes code; the OWNER runs the rebuild and tests on a real device.** Every VERIFY that needs the camera is a **HUMAN** step — stage the change, ask the owner to rebuild + report, then continue from their result.
- **Do NOT start an EAS build yourself. Do NOT push to `main`.**
- **Stay out of the other loop's files.** A separate loop is rewriting onboarding + PaymentScreen. Keep ALL mesh work in a **new component** + the scan capture screen only (`screens/scan/FaceScanScreen.tsx`). Do not touch onboarding/payment/RootNavigator.

## STACK (recommended — matches the dense 468-point look)

Current capture = `expo-camera` `CameraView`. For a live landmark mesh use a frame-processor camera:
- `react-native-vision-camera` (v4) — camera + frame processor.
- `react-native-worklets-core` — **already installed** ✓ (frame-processor runtime).
- `react-native-mediapipe` (MediaPipe **FaceLandmarker**, 468 landmarks) — closest match to the screenshot. (Fallback: `react-native-vision-camera-face-detector` = MLKit contours, ~130 pts — lighter but sparser; only if MediaPipe integration stalls.)
- `@shopify/react-native-skia` — draw the white dots over the preview at 60fps (far better than absolute-positioned Views).
- Bundle the FaceLandmarker `.task` model as an asset.

VisionCamera and expo-camera can coexist; the mesh screen uses VisionCamera, the rest of the app keeps expo-camera. Prefer **adding** a VisionCamera-based capture path behind a flag over ripping out the working expo-camera one.

## CONSTRAINTS (every iteration)

- Branch **`face-mesh`** (from the current branch). No `main`, no EAS-by-the-loop.
- `cd mobile && npx tsc --noEmit` clean after each change. Mesh code isolated to a new component + FaceScanScreen.
- The existing scan → capture → `FaceScanResults` flow must keep working (don't regress capture).
- Camera verification is device-only and **HUMAN** — never claim the mesh "works" from code alone.

## UNITS

### [ ] U0 — Deps + native config (then HUMAN rebuild)
Branch `face-mesh`. Add `react-native-vision-camera`, `react-native-mediapipe`, `@shopify/react-native-skia` (confirm `react-native-worklets-core` present). Add the VisionCamera + Skia config plugins to `app.json`/`app.config.js`; confirm `NSCameraUsageDescription` is set (expo-camera already needs it — reuse). Bundle the FaceLandmarker `.task` model. Create `SIM`-free notes in `FACE_MESH_LOG.md`.
**HUMAN:** owner runs a dev build (`npx expo run:ios --device` or an EAS dev build) and confirms the app launches + camera preview shows. **VERIFY:** owner reports build OK + preview renders.

### [ ] U1 — VisionCamera preview component
New `components/scan/FaceMeshCamera.tsx`: a VisionCamera front-camera preview with a frame processor stub (logs frame dims/fps). Render it standalone behind a dev entry first (don't wire into the funnel yet).
**VERIFY (HUMAN):** preview renders on device; frame-processor logs fire.

### [ ] U2 — FaceLandmarker in the frame processor
Run MediaPipe FaceLandmarker in the frame processor; output the 468 landmarks (normalized coords) to a shared value. Throttle to ~20-30 fps. Log landmark count + a couple of coords.
**VERIFY (HUMAN):** logs show 468 landmarks when a face is present, none when absent.

### [ ] U3 — White Skia mesh overlay
Skia canvas over the preview draws a **white** dot at each landmark, correctly **mirrored** for the front camera and scaled/rotated to the preview frame. Add the "Your face here" guide + a subtle frame. Tune dot radius/opacity to read like the reference (clean white).
**VERIFY (HUMAN):** dots track the face accurately (eyes/nose/jaw line up), white, smooth.

### [ ] U4 — Wire into the scan capture
Use `FaceMeshCamera` as the capture preview in `FaceScanScreen` (behind a flag so the expo-camera path stays as fallback). Keep the 3-angle flow + `takePicture` working (VisionCamera's `takePhoto`), then proceed to `FaceScanResults` exactly as before.
**VERIFY (HUMAN):** full scan flow — mesh visible during capture, 3 angles captured, lands on results, no crash.

### [ ] U5 — Performance + edge cases
Target a smooth frame rate; render the mesh only when a face is detected; graceful no-face / permission-denied / backgrounded states; no leak when leaving the screen.
**VERIFY (HUMAN):** smooth on device; no crash on deny/background/re-enter.

### [ ] U6 — Final report
`FACE_MESH_LOG.md`: stack used, the model, fps achieved, any fallbacks, and the device test results. `tsc` clean.
**VERIFY:** report complete; owner confirms the mesh + capture work on device.

## COMPLETION CRITERIA
1. Every UNIT checked off (HUMAN verifies recorded).
2. White face mesh tracks the live face on a real device at an acceptable frame rate.
3. The scan → capture → `FaceScanResults` flow is unbroken (expo-camera fallback intact).
4. No onboarding/payment/RootNavigator files touched; `tsc` clean; nothing pushed to `main`; no EAS started by the loop.

Completion promise (emit verbatim only when all hold):
> FACE MESH COMPLETE — white live landmark mesh verified on device, scan capture intact, log at FACE_MESH_LOG.md.

## ITERATION LOG
- (none yet)
