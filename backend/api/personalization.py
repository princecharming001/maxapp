"""Personalization API — the user-facing surface over the hyper-personalization
spine (services.personalization).

    GET    /api/personalization/profile        the assembled "what Max knows" view
    POST   /api/personalization/remember       add/correct a durable fact
    DELETE /api/personalization/memory/{id}     retract a fact the user disowns
    POST   /api/personalization/refresh         rebuild the profile read-model

Everything is per-user and best-effort: the profile is a rebuildable read-model,
so these endpoints never block the rest of the app.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware import get_current_user
from models.sqlalchemy_models import UserMemory
from services import personalization as pers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/personalization", tags=["Personalization"])


def _iso(ts) -> Optional[str]:
    return ts.isoformat() if ts else None


def _memory_dict(m: UserMemory) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "dimension": m.dimension,
        "key": m.key,
        "text": m.text,
        "value": m.value,
        "source": m.source,
        "confidence": float(m.confidence) if m.confidence is not None else None,
        "created_at": _iso(m.created_at),
        "updated_at": _iso(m.updated_at),
    }


class RememberBody(BaseModel):
    dimension: str = Field(..., description="identity|culture|diet|work|lifestyle|personality|comms_style|goals|interests|constraints|misc")
    text: str = Field(..., description="Short human phrasing, e.g. 'vegetarian'")
    key: Optional[str] = Field(default=None, description="Canonical slot when this replaces a prior value, e.g. 'diet.pattern'")
    value: Any = Field(default=None, description="Optional structured value")


@router.get("/profile")
async def get_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """The assembled personalization profile + the durable facts behind it."""
    user_id = str(current_user["id"])
    built = await pers.get_profile(db, user_id)
    memories = await pers.get_memories(db, user_id)
    # Group facts by dimension for a tidy "what Max knows" UI.
    by_dim: dict[str, list[dict[str, Any]]] = {}
    for m in memories:
        by_dim.setdefault(m.dimension, []).append(_memory_dict(m))
    return {
        "profile": built.get("profile") or {},
        "completeness": built.get("completeness") or {},
        "brief": built.get("brief"),
        "sources": built.get("sources") or [],
        "dimensions": list(pers.DIMENSIONS),
        "memories": [_memory_dict(m) for m in memories],
        "memories_by_dimension": by_dim,
    }


@router.post("/remember", status_code=status.HTTP_200_OK)
async def remember(
    body: RememberBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Persist a durable fact the user told us about themselves (source=chat —
    an explicit statement, so it outranks inferred signals)."""
    user_id = str(current_user["id"])
    if not (body.text or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")
    mem = await pers.remember_fact(
        db, user_id,
        dimension=body.dimension,
        text=body.text,
        key=body.key,
        value=body.value,
        source="chat",
    )
    if mem is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="nothing to remember")
    built = await pers.get_profile(db, user_id)
    return {"ok": True, "memory": _memory_dict(mem), "brief": built.get("brief")}


@router.delete("/memory/{memory_id}", status_code=status.HTTP_200_OK)
async def forget(
    memory_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retract a fact (the user corrected us). Soft delete — keeps history."""
    user_id = str(current_user["id"])
    ok = await pers.retract_fact(db, user_id, memory_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="memory not found")
    return {"ok": True, "removed": memory_id}


@router.post("/refresh", status_code=status.HTTP_200_OK)
async def refresh(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Rebuild the profile read-model from all current sources."""
    user_id = str(current_user["id"])
    built = await pers.rebuild_profile(user_id, db)
    return {"ok": True, "profile": built.get("profile"), "brief": built.get("brief")}
