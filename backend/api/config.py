"""Public runtime config for the mobile app (feature flags).

Feature flags live as a JSON object in the `system_prompts` table under the key
`feature_flags_json` — reusing the same DB-driven mechanism as the LLM prompts, so
flags can be toggled straight from the DB with NO app rebuild and NO backend
redeploy. The client merges whatever this returns OVER its built-in defaults, so
the endpoint is purely an override: on any error / missing row it returns `{}` and
the app behaves exactly as before.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.sqlalchemy_models import SystemPrompt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/flags")
async def get_feature_flags(db: AsyncSession = Depends(get_db)) -> dict:
    """Feature-flag overrides as ``{flagName: bool}``.

    Returns ``{}`` (client falls back to its built-in defaults) on a missing row,
    malformed JSON, or any DB error — flags must never be able to break the app.
    """
    try:
        content = (
            await db.execute(
                select(SystemPrompt.content).where(
                    SystemPrompt.key == "feature_flags_json",
                    SystemPrompt.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if not content:
            return {}
        data = json.loads(content)
        if not isinstance(data, dict):
            return {}
        # Defensive: only surface real booleans, ignore anything else.
        return {k: bool(v) for k, v in data.items() if isinstance(v, bool)}
    except Exception as exc:  # never break the client over a flag lookup
        logger.warning("get_feature_flags failed, returning {}: %s", exc)
        return {}
