"""hero_image_service.py — resolve a cached hero image URL for a task guide.

SC4 wants each step to render an appropriate hero image that fades into the cream page
background. The images themselves are GENERATED ONCE (build-time, via the Higgsfield
image pipeline — see scripts/generate_hero_images.py) with a neutral cream background so
the gradient fade blends with no seam, and committed under backend/uploads/hero/. They
are NEVER regenerated per request — this module only *resolves* a deterministic URL.

Chosen granularity: TASK-LEVEL hero (one curated image per maxx program), applied to
every step page. This is the spec's accepted "first pass" granularity. The resolved
relative URL is cached inside the task_guides payload by task_guide_service so it is
not recomputed on the hot path.

Fallback chain (per SC4): generated/curated per-maxx asset -> generic asset -> "" (the
page still renders correctly on solid cream — never a broken-image box).
"""
from __future__ import annotations

import os
from typing import Optional

_HERO_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "uploads",
    "hero",
)

# Known maxx programs that have a curated hero asset.
_MAXXES = ("skinmax", "hairmax", "fitmax", "heightmax", "bonemax")

# Supported extensions in resolution order (we save as .jpg from the pipeline).
_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def _first_existing(stem: str) -> Optional[str]:
    for ext in _EXTS:
        path = os.path.join(_HERO_DIR, f"{stem}{ext}")
        if os.path.isfile(path):
            return f"/uploads/hero/{stem}{ext}"
    return None


def resolve_hero_image(maxx_id: Optional[str]) -> str:
    """Return the relative /uploads/hero/... URL for this maxx, or a generic
    fallback, or "" when no curated asset exists. Mobile absolutizes the path
    against the API origin (api.resolveAttachmentUrl)."""
    mid = (maxx_id or "").strip().lower()
    if mid in _MAXXES:
        hit = _first_existing(mid)
        if hit:
            return hit
    generic = _first_existing("generic")
    return generic or ""
