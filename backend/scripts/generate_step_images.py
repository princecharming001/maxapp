"""generate_step_images.py — create a DISTINCT, cached image per guide step (SC1/SC3).

Defect A fix: each step gets its own image keyed by (task_key, step.n), created ONCE and
reused for every user/read. This generator is:

  • IDEMPOTENT — skips any step whose image already exists (re-running creates 0).
  • CACHED on disk at backend/uploads/hero/steps/<task_key_hash>/<n>.jpg.
  • COST-GUARDED — logs created vs skipped; never generates at request time.

Image source:
  • Premium per-step photos for key tasks are pre-generated via the Higgsfield pipeline
    (same as hero images — neutral cream background, prompt built from the step's
    title/body + maxx). Drop them at the keyed path and this script skips them.
  • For any step lacking a premium asset, this script renders a runnable, on-aesthetic
    Pillow fallback (cream still-life of an abstract product silhouette, hue varied
    deterministically per step) so the fallback chain never shows a broken box and the
    idempotency test is genuinely runnable without external APIs.

Usage:
  .venv312/bin/python scripts/generate_step_images.py [task_key_substring]
  (no arg = all cached skinmax guides; substring filters task_key)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402

from db import AsyncSessionLocal  # noqa: E402
from services.step_image_service import step_dir, step_image_path, _EXTS  # noqa: E402


def step_prompt(maxx_id: str, step: dict) -> str:
    """The Higgsfield prompt of record for this step (neutral cream still-life)."""
    title = step.get("title", "")
    body = (step.get("body", "") or "")[:160]
    return (
        f"Editorial still-life product photo representing this {maxx_id} skincare step: "
        f"{title}. {body} Soft diffused natural light, centered subject, seamless warm "
        f"cream off-white background, generous negative space, calm premium mood, "
        f"no text, no logos, no people."
    )


def _exists(task_key: str, n: int) -> bool:
    d = step_dir(task_key)
    return any(os.path.isfile(os.path.join(d, f"{n}{e}")) for e in _EXTS)


def _hue_for(task_key: str, n: int) -> int:
    h = hashlib.sha1(f"{task_key}|{n}".encode()).hexdigest()
    return int(h[:2], 16)  # 0-255 deterministic per step


def _render_fallback(out_path: str, seed: int, label: str) -> None:
    """Render a calm cream still-life of an abstract product silhouette (Pillow).
    Neutral background so the page fade (SC4) stays seamless; distinct per seed."""
    from PIL import Image, ImageDraw, ImageFilter

    W, H = 896, 1200
    # Warm cream base, slightly varied so steps differ subtly even in the wash.
    base = (244 - (seed % 6), 241 - (seed % 5), 234 - (seed % 7))
    img = Image.new("RGB", (W, H), base)
    draw = ImageDraw.Draw(img)

    # Soft floor shadow / pedestal.
    shadow = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([W * 0.22, H * 0.62, W * 0.78, H * 0.74], fill=70)
    shadow = shadow.filter(ImageFilter.GaussianBlur(40))
    img.paste((205, 200, 190), (0, 0), shadow)

    # Abstract "product" silhouette: a soft rounded bottle, hue varied by seed.
    accent = (150 + (seed % 60), 140 + (seed * 2 % 50), 130 + (seed * 3 % 60))
    cx = int(W * 0.5)
    bw = int(W * (0.20 + (seed % 5) * 0.012))
    bh = int(H * (0.30 + (seed % 7) * 0.012))
    top = int(H * 0.30)
    body = [cx - bw, top, cx + bw, top + bh]
    draw.rounded_rectangle(body, radius=int(bw * 0.5), fill=accent)
    # Cap.
    cap_w = int(bw * 0.5)
    draw.rounded_rectangle(
        [cx - cap_w, top - int(H * 0.05), cx + cap_w, top + int(H * 0.01)],
        radius=int(cap_w * 0.4), fill=tuple(max(0, c - 30) for c in accent),
    )
    # Soft highlight.
    hl = Image.new("L", (W, H), 0)
    hd = ImageDraw.Draw(hl)
    hd.ellipse([cx - bw + 12, top + 16, cx - bw + 12 + int(bw * 0.5), top + int(bh * 0.7)], fill=60)
    hl = hl.filter(ImageFilter.GaussianBlur(18))
    img.paste((255, 255, 255), (0, 0), hl)

    img = img.filter(ImageFilter.GaussianBlur(0.4))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "JPEG", quality=86)


async def main(filt: str) -> int:
    created = skipped = 0
    async with AsyncSessionLocal() as db:
        like = f"%{filt}%" if filt else "skinmax%"
        rows = await db.execute(
            text("SELECT task_key, payload FROM task_guides WHERE task_key LIKE :l ORDER BY task_key"),
            {"l": like},
        )
        for task_key, payload in rows.fetchall():
            p = payload if isinstance(payload, dict) else json.loads(payload)
            maxx = (task_key.split("|", 1)[0]) if "|" in task_key else "skinmax"
            for s in (p.get("steps") or []):
                n = int(s.get("n") or 0)
                if not n:
                    continue
                if _exists(task_key, n):
                    skipped += 1
                    continue
                out = step_image_path(task_key, n)
                _render_fallback(out, _hue_for(task_key, n), s.get("title", ""))
                created += 1
                print(f"created {task_key} step {n} -> {out}")
    print(f"\n[step-images] created={created} skipped={skipped}")
    return created, skipped


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else ""))
    sys.exit(0)
