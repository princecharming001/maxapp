# Max — Explore "jelly" icon style & color system (`c.md`)

The brand visual language for the native-max icons on the Explore/Marketplace
page. Use this for any new icon/illustration that should feel native to the app
(e.g. the streak flame). Source assets: `mobile/assets/maxxThumbs/*.png` (on a
soft backdrop) and `mobile/assets/maxxThumbs/cut/*.png` (background-removed,
transparent — the float-anywhere variant).

## The look (what makes it "jelly")

- A **soft, frosted, glossy 3D blob** — smooth rounded volume, not a flat icon and
  not a hard candy-glass gem. Reads like backlit frosted resin / soft gradient mesh.
- **Luminous glowing core**: the center is a soft, bright peach-white that glows
  outward, so the object feels lit from within.
- **Warm→cool diagonal gradient**: warm **coral / orange / amber at the TOP**,
  melting through the glowing pale center, down to **cool sky-blue / periwinkle at
  the BASE**. (Both `fitmax` and `skinmax` thumbs follow this same warm-top →
  cool-bottom flow regardless of the max's nominal brand hue.)
- **Soft diffuse edges** — no outline, no harsh specular hotspots; gentle studio
  lighting and a faint soft shadow. Ethereal, premium, calm.
- Centered, generous negative space, renders cleanly at small sizes.

## Palette

Per-max brand color (`mobile/utils/maxxBrand.ts` → `MAXX_BRAND_FALLBACK`):

| Max         | Hex       | Hue    |
|-------------|-----------|--------|
| hairmax     | `#3B82F6` | blue   |
| bonemax     | `#F59E0B` | amber  |
| heightmax   | `#8B5CF6` | purple |
| skinmax     | `#E879A9` | pink   |
| fitmax      | `#10B981` | green  |
| coloringmax | `#BC7A3C` | bronze |

The jelly gradient itself (the actual surface colors, top→bottom):

- Warm top: coral-orange `#F5703A` → amber `#F59E0B`
- Glowing core: soft peach-white `#FBE9DD` / near-white
- Cool base: sky-blue `#5BA0F2` → brand blue `#3B82F6` → periwinkle/`#8B5CF6`

## Generation recipe (Higgsfield / nano-banana)

> A soft, glossy 3D gradient {SHAPE} — a smooth frosted three-dimensional form with
> a dreamy gradient-mesh surface and a luminous glowing core, soft diffuse edges and
> no hard outline. The gradient flows from warm coral-orange + amber at the TOP
> (#F5703A, #F59E0B), through a soft glowing peach-white center, down to cool
> sky-blue + periwinkle at the BASE (#3B82F6, #8B5CF6). Matte-glossy, ethereal,
> premium, soft studio lighting, gentle inner glow, subtle soft shadow. Matches a
> set of soft 3D gradient "jelly" app icons. Centered, plain white background, ultra
> clean. No text, no numbers.

Then background-remove for the transparent (float-anywhere) variant.
