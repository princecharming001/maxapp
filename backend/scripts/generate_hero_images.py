"""generate_hero_images.py — (re)generate the per-maxx task-guide hero images.

SC4 sources hero images via the Higgsfield image pipeline. Generation is a BUILD-TIME
step (never per request): run this once, commit the results under backend/uploads/hero/,
and task_guide_service caches the resolved /uploads/hero/<maxx>.jpg URL in task_guides.

This script documents the exact prompts + model used. The actual generation in this repo
was performed via the Higgsfield MCP tools (model: marketing_studio_image, 3:4, 1k),
downloaded to backend/uploads/hero/<maxx>.png and converted to .jpg. Re-running requires
Higgsfield API access; the prompts below are the source of truth.

PROMPTS (model=marketing_studio_image, aspect_ratio=3:4):
  skinmax  : single minimalist frosted-glass skincare serum dropper bottle, unbranded,
             seamless warm cream off-white background, negative space at bottom.
  hairmax  : clean wooden wide-tooth hair comb + small amber scalp-serum bottle,
             seamless warm cream off-white background, negative space at bottom.
  fitmax   : single matte black hex dumbbell, seamless warm cream off-white background,
             negative space at bottom.
  heightmax: neatly rolled cork yoga mat upright + soft resistance band,
             seamless warm cream off-white background, negative space at bottom.
  bonemax  : single flat jade gua sha facial tool on a smooth stone,
             seamless warm cream off-white background, negative space at bottom.
  generic  : smooth rounded natural stone + sprig of eucalyptus,
             seamless warm cream off-white background, negative space at bottom.

Common rules baked into every prompt: soft diffused natural light, centered subject,
calm premium mood, NO text, NO logos — so the gradient fade blends with no seam (SC4).
"""

HERO_PROMPTS = {
    "skinmax": "Editorial still-life product photo of a single minimalist frosted-glass skincare serum dropper bottle, unbranded, soft diffused natural light, centered, seamless warm cream off-white background, lots of empty negative space toward the bottom, calm, premium, no text, no logos",
    "hairmax": "Editorial still-life photo of a clean wooden wide-tooth hair comb and a small unbranded amber scalp-serum bottle, soft diffused natural light, centered, seamless warm cream off-white background, generous empty negative space toward the bottom, calm premium mood, no text, no logos",
    "fitmax": "Editorial still-life photo of a single matte black hex dumbbell, soft diffused natural light, centered, seamless warm cream off-white background, lots of empty negative space toward the bottom, calm premium fitness mood, no text, no logos",
    "heightmax": "Editorial still-life photo of a neatly rolled cork yoga stretching mat standing upright with a soft resistance band beside it, soft diffused natural light, centered, seamless warm cream off-white background, generous empty negative space toward the bottom, calm premium wellness mood, no text, no logos",
    "bonemax": "Editorial still-life photo of a single flat jade gua sha facial tool resting on a smooth stone, soft diffused natural light, centered, seamless warm cream off-white background, generous empty negative space toward the bottom, calm premium skincare mood, no text, no logos",
    "generic": "Minimalist editorial still-life of a smooth rounded natural stone and a sprig of eucalyptus, soft diffused natural light, centered, seamless warm cream off-white background, generous empty negative space toward the bottom, calm premium wellness mood, no text, no logos",
}

if __name__ == "__main__":
    print("Hero image prompts (generate via Higgsfield marketing_studio_image, 3:4):")
    for maxx, prompt in HERO_PROMPTS.items():
        print(f"\n[{maxx}]\n{prompt}")
