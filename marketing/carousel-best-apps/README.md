# "Best apps I've paid for in my 20s" carousel (Max remix)

An 8-slide 1080x1380 Instagram/TikTok carousel, remixed so Max is the app at the end.
The finished images are in `slides/`, ready to post in order.

| # | Slide | Source |
|---|---|---|
| 1 | Hook, with Max's icon in place of the original's | `src/slide-01.html` (original photo + Max icon) |
| 2–5 | WHOOP, Claude, Notion, Wispr Flow | the original slides, unchanged |
| 6 | Max: "Chad Plan = $5.99/wk" + a coach chat | `src/slide-06.html` |
| 7 | "comment the word MAX and I'll DM you the link" | `src/slide-07.html` |
| 8 | Outro: scan → rating, weak points, daily plan | `src/slide-08.html` |

The sample chat (slides 6 and 7) lives in `src/chat.js`, written in Max's voice (`MAX_BIBLE.md` §5).

## Rebuild

```bash
NODE_PATH="$(npm root -g)" node marketing/carousel-best-apps/build.js
```

Needs Playwright with Chromium and the Inter / Inter Display fonts installed.

## Check before posting

- **Price.** `$5.99/wk` is the paywall's fallback price (`mobile/screens/payment/PaymentScreen.tsx`).
  Confirm it matches App Store Connect.
- **Slides 2–5** still have the original creator's personal reviews ("Switched to Claude earlier this year…").
  Rewrite them if they aren't true for you.
- **Comment → DM.** Slide 7 promises a DM when someone comments "MAX". Set up an auto-DM
  (for example, ManyChat) before posting.
