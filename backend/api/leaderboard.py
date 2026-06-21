"""
Leaderboard API
"""

from fastapi import APIRouter, Depends
from datetime import datetime
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from db import get_db
from middleware.auth_middleware import require_paid_user
from models.sqlalchemy_models import Leaderboard, User, Scan

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])


@router.get("")
async def get_leaderboard(
    limit: int = 100,
    current_user: dict = Depends(require_paid_user),
    db: AsyncSession = Depends(get_db),
):
    """Get leaderboard rankings.

    Rank is computed on read (ORDER BY score) rather than maintained as a stored
    column rewritten on every scan — that write was O(n) per scan and serialized
    uploads. Admins are excluded in SQL (no per-row user fetch / N+1).
    """
    result = await db.execute(
        select(Leaderboard, User.email)
        .join(User, User.id == Leaderboard.user_id)
        .where(User.is_admin == False)  # noqa: E712
        .order_by(Leaderboard.score.desc())
        .limit(limit)
    )
    entries = []
    for rank, (entry, email) in enumerate(result.all(), 1):
        entries.append({
            "rank": rank,
            "user_id": str(entry.user_id),
            "user_email": (email[:3] + "***") if email else "Anonymous",
            "score": entry.score or 0,
            "level": entry.level or 0,
            "streak_days": entry.streak_days or 0,
            "improvement_percentage": entry.improvement_percentage or 0
        })
    return {"entries": entries, "total_users": len(entries)}


@router.get("/me")
async def get_my_rank(
    current_user: dict = Depends(require_paid_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's rank"""
    if current_user.get("is_admin"):
        return {"rank": None, "total_users": 0, "message": "Admins are excluded from leaderboard"}

    user_id = current_user["id"]
    user_uuid = UUID(user_id)
    result = await db.execute(select(Leaderboard).where(Leaderboard.user_id == user_uuid))
    entry = result.scalar_one_or_none()

    async def _non_admin_total() -> int:
        q = await db.execute(
            select(func.count())
            .select_from(Leaderboard)
            .join(User, User.id == Leaderboard.user_id)
            .where(User.is_admin == False)  # noqa: E712
        )
        return int(q.scalar() or 0)

    async def _rank_for(score: float) -> int:
        # 1 + number of non-admin entries strictly ahead. Computed on read.
        q = await db.execute(
            select(func.count())
            .select_from(Leaderboard)
            .join(User, User.id == Leaderboard.user_id)
            .where((User.is_admin == False) & (Leaderboard.score > score))  # noqa: E712
        )
        return int(q.scalar() or 0) + 1

    total = await _non_admin_total()

    # If no leaderboard entry, check if user has completed scans and create entry
    if not entry:
        latest_scan_result = await db.execute(
            select(Scan)
            .where((Scan.user_id == user_uuid) & (Scan.processing_status == "completed"))
            .order_by(Scan.created_at.desc())
            .limit(1)
        )
        latest_scan = latest_scan_result.scalar_one_or_none()
        
        if latest_scan:
            # User has completed scan but no leaderboard entry - create one
            analysis = latest_scan.analysis or {}
            overall_score = analysis.get("overall_score") or analysis.get("metrics", {}).get("overall_score", 0)
            leaderboard_score = (float(overall_score) if overall_score else 0) * 10
            
            # Count scans
            scans_result = await db.execute(
                select(Scan).where(
                    (Scan.user_id == user_uuid) & (Scan.processing_status == "completed")
                )
            )
            scans_count = len(scans_result.scalars().all())
            
            # Create leaderboard entry
            new_entry = Leaderboard(
                user_id=user_uuid,
                score=leaderboard_score,
                level=float(overall_score) if overall_score else 0,
                streak_days=1,
                improvement_percentage=0,
                scans_count=scans_count,
                last_scan_at=latest_scan.created_at or datetime.utcnow(),
                created_at=datetime.utcnow()
            )
            db.add(new_entry)
            await db.commit()
            await db.refresh(new_entry)
            entry = new_entry
            total = await _non_admin_total()
        else:
            return {"rank": None, "total_users": total, "message": "Complete a scan to join"}

    return {
        "rank": await _rank_for(entry.score or 0),
        "total_users": total,
        "score": entry.score or 0,
        "level": entry.level or 0,
        "streak_days": entry.streak_days or 0,
        "improvement_percentage": entry.improvement_percentage or 0
    }

