"""Creator maxx card art — generation pipeline (STUB).

The house style: a Higgsfield-generated 3D object in the native "jelly" family,
derived from the maxx's description (e.g. a glass-skin maxx → a glossy dew-drop
face form), rendered on green screen → chroma-keyed to transparency → composited
on the card's accent field.

TODAY this is manual-first: art is generated via the Higgsfield tooling by ops
and attached through POST /admin/creators/{id}/art. This stub is the seam for
server-side auto-generation at approval time — gated by
settings.creator_art_autogen_enabled and a HIGGSFIELD_API_KEY, neither of which
ship enabled.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def request_art_generation(creator) -> None:
    """Queue art generation for a creator maxx. STUB: logs and returns.

    Intended implementation (when enabled):
      1. Prompt-build from creator.display_name + tagline + bio ("house 3D
         jelly object embodying <what the maxx is about>, glossy translucent
         material, studio green screen background").
      2. POST to the Higgsfield generate-image API (nano_banana family).
      3. Chroma-key (greenness = G - max(R,B)), despill, trim, center, webp.
      4. storage_service.upload_image → creator.art_url, art_status='ready'.
    """
    logger.info(
        "creator_art: auto-generation requested for %s (stub — attach art via "
        "POST /admin/creators/{id}/art)",
        getattr(creator, "maxx_id", "?"),
    )
