"""Transaction helpers for isolating best-effort side-effects.

The failure mode this exists for: a request does a CRITICAL write (e.g. mark
onboarding `completed: true`) and then a few BEST-EFFORT side-effects (schedule
regen, context sync, personalization rebuild). When a side-effect shares the
transaction and raises a DB error, Postgres aborts the WHOLE transaction — so the
request's final `commit()` silently becomes a ROLLBACK and the critical write is
lost, even though the side-effect error was "caught" and logged as non-fatal. The
user is then stranded (their onboarding never persisted; the client keeps reading
`completed: false` and never advances).

The rule: commit the critical write FIRST, then run each best-effort step through
`best_effort()`, which isolates it in its own commit/rollback so one failure can
neither poison the next step nor undo the already-committed critical write.
"""
from __future__ import annotations

import logging
from typing import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def best_effort(
    db: AsyncSession, label: str, step: Callable[[], Awaitable[object]]
) -> bool:
    """Run one best-effort side-effect fully isolated from already-committed state.

    Commits on success; on failure rolls back ONLY this step's uncommitted work
    (a poisoned/aborted transaction is cleared) so the next best-effort step runs
    clean. Never raises. Returns True iff the step committed.

    Precondition: the caller has already committed any critical write, so a
    failure here cannot roll it back.
    """
    try:
        await step()
        await db.commit()
        return True
    except Exception as e:  # noqa: BLE001 - best-effort by contract
        try:
            await db.rollback()
        except Exception:  # pragma: no cover - rollback of an already-dead session
            pass
        logger.warning("%s failed (non-fatal): %s", label, e)
        return False
