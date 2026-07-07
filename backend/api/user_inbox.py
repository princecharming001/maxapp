"""In-app user inbox — admin messages shown in the app (bell icon on home).

GET  /user-inbox              — list notifications for the current user
GET  /user-inbox/unread-count — badge count
POST /user-inbox/{id}/read    — mark one read
POST /user-inbox/read-all     — mark all read
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.sqlalchemy import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import UserInboxMessage

router = APIRouter(prefix="/user-inbox", tags=["UserInbox"])


def _uid(current_user: dict) -> UUID:
    raw = current_user.get("id") or current_user.get("user_id")
    return UUID(str(raw))


def _row_dict(row: UserInboxMessage) -> dict:
    return {
        "id": str(row.id),
        "title": row.title,
        "body": row.body,
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("")
async def list_inbox(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    rows = (
        await db.execute(
            select(UserInboxMessage)
            .where(UserInboxMessage.user_id == uid)
            .order_by(UserInboxMessage.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return {"messages": [_row_dict(r) for r in rows]}


@router.get("/unread-count")
async def unread_count(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    n = (
        await db.execute(
            select(func.count(UserInboxMessage.id)).where(
                (UserInboxMessage.user_id == uid) & (UserInboxMessage.read_at.is_(None))
            )
        )
    ).scalar_one()
    return {"unread": int(n or 0)}


@router.post("/{message_id}/read")
async def mark_read(
    message_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    try:
        mid = UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Bad id")
    row = (
        await db.execute(
            select(UserInboxMessage).where(
                (UserInboxMessage.id == mid) & (UserInboxMessage.user_id == uid)
            )
        )
    ).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    if row.read_at is None:
        row.read_at = datetime.utcnow()
        await db.commit()
    return {"read": True}


@router.post("/read-all")
async def mark_all_read(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = _uid(current_user)
    await db.execute(
        update(UserInboxMessage)
        .where((UserInboxMessage.user_id == uid) & (UserInboxMessage.read_at.is_(None)))
        .values(read_at=datetime.utcnow())
    )
    await db.commit()
    return {"read": True}
