"""step_image_service.py — resolve a distinct, cached image URL per guide step (SC1).

Defect A fix: every step of every task used to collapse to the single per-maxx hero.
Now each step gets its OWN image, generated/created ONCE (build-time) and cached on disk
keyed by (task_key, step.n). This module only RESOLVES a stable on-disk path — it never
generates at request time.

Layout: backend/uploads/hero/steps/<task_key_hash>/<n>.jpg
  task_key_hash = sha1(task_key)[:12]  (filesystem-safe, stable)

Fallback chain (handled by the caller / mobile): per-step image -> per-maxx hero ->
generic -> "" (page still renders correctly on solid cream — never a broken box).
"""
from __future__ import annotations

import hashlib
import os
from typing import Optional

_STEPS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "uploads",
    "hero",
    "steps",
)

_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def task_key_hash(task_key: str) -> str:
    return hashlib.sha1((task_key or "").encode("utf-8")).hexdigest()[:12]


def step_dir(task_key: str) -> str:
    return os.path.join(_STEPS_DIR, task_key_hash(task_key))


def step_image_path(task_key: str, n: int, ext: str = ".jpg") -> str:
    """Absolute on-disk path where a step image should live (for the generator)."""
    return os.path.join(step_dir(task_key), f"{n}{ext}")


def resolve_step_image(task_key: str, n: int) -> str:
    """Return the relative /uploads/... URL for this step's image, or "" if none exists.
    Mobile absolutizes the path against the API origin (api.resolveAttachmentUrl)."""
    d = step_dir(task_key)
    h = task_key_hash(task_key)
    for ext in _EXTS:
        if os.path.isfile(os.path.join(d, f"{n}{ext}")):
            return f"/uploads/hero/steps/{h}/{n}{ext}"
    return ""
