#!/usr/bin/env python3
"""End-to-end smoke test for creator onboarding API."""
from __future__ import annotations

import asyncio
import json
import sys
import uuid

import httpx

BASE = "http://localhost:8002/api"
PASS = 0
FAIL = 0


def ok(label: str, detail: str = "") -> None:
    global PASS
    PASS += 1
    print(f"  ✓ {label}" + (f" — {detail}" if detail else ""))


def bad(label: str, detail: str = "") -> None:
    global FAIL
    FAIL += 1
    print(f"  ✗ {label}" + (f" — {detail}" if detail else ""))


async def main() -> int:
    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. Health
        r = await client.get(f"{BASE.replace('/api', '')}/health")
        if r.status_code == 200:
            ok("Backend health", r.text[:80])
        else:
            bad("Backend health", str(r.status_code))
            return 1

        # 2. Paid test user
        r = await client.post(f"{BASE}/auth/faux-signup-skip")
        if r.status_code != 200:
            bad("faux-signup-skip", r.text[:200])
            return 1
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        ok("Created paid test user")

        # 3. Create application + provision creator directly (skip OAuth UI for test)
        from db.sqlalchemy import AsyncSessionLocal
        from models.sqlalchemy_models import CreatorApplication, User
        from services import creator_service

        me = await client.get(f"{BASE}/users/me", headers=headers)
        user_id = uuid.UUID(me.json()["id"])

        async with AsyncSessionLocal() as db:
            max_suffix = uuid.uuid4().hex[:6]
            app_row = CreatorApplication(
                user_id=user_id,
                applicant_name="Test Creator",
                max_name=f"TestMax{max_suffix}",
                max_name_normalized=f"testmax{max_suffix}",
                max_description="A test max for onboarding e2e.",
                max_differentiator="Unique test method.",
                brand_fit="Fits test audience.",
                instagram_handle="testcreator",
                instagram_url="https://instagram.com/testcreator",
                course_docs=[{"filename": "protocol.txt", "url": "https://example.com/doc", "source": "link"}],
                status="approved",
            )
            db.add(app_row)
            await db.flush()
            creator = await creator_service.provision_creator_from_application(app_row, db, tier="t1")
            user = await db.get(User, user_id)
            if user:
                user.is_creator = True
            await db.commit()
            app_id = str(app_row.id)
        ok("Provisioned creator", creator.maxx_id)

        # 4. (application already created above)
        r = await client.get(f"{BASE}/creators/me/onboarding", headers=headers)
        if r.status_code != 200:
            bad("GET onboarding", r.text[:300])
            return 1
        state = r.json()
        ok("GET onboarding", f"step={state.get('step')}")

        # 6. Upload doc
        files = {"file": ("test-protocol.txt", b"Day 1: warm up 5 min. Day 2: core drill 15 min.", "text/plain")}
        r = await client.post(f"{BASE}/creators/me/onboarding/upload-doc", headers=headers, files=files)
        if r.status_code != 200:
            bad("Upload doc", r.text[:300])
        else:
            ok("Upload doc", r.json().get("filename", ""))

        # 7. Analyze
        r = await client.post(f"{BASE}/creators/me/onboarding/analyze", headers=headers)
        if r.status_code != 200:
            bad("Analyze knowledge", r.text[:400])
            return 1
        state = r.json()
        protocols = state.get("protocols_pct", 0)
        voice_total = state.get("voice_samples_total", 0)
        habits = state.get("habit_library") or []
        if protocols == 100:
            ok("Protocols pct = 100%", "")
        else:
            bad("Protocols pct", f"got {protocols}, expected 100")
        if voice_total >= 15:
            ok("Voice questions seeded", f"{voice_total} samples")
        else:
            bad("Voice questions", f"only {voice_total}")
        if len(habits) >= 2:
            ok("Habit library generated", f"{len(habits)} habits")
        else:
            bad("Habit library", f"only {len(habits)}")

        # 8. Voice phase 1 — write from scratch (8 answers)
        for i in range(8):
            sample = state.get("current_voice_sample")
            if not sample:
                bad(f"Voice sample {i+1}", "no current sample")
                break
            if sample.get("sample_phase", 1) != 1:
                bad(f"Voice sample {i+1} phase", f"expected phase 1, got {sample.get('sample_phase')}")
                break
            if sample.get("draft_answer"):
                bad(f"Voice sample {i+1} draft", "phase 1 should have no draft")
                break
            ans = f"Test answer {i+1}: stay consistent, start small, track weekly progress."
            r = await client.post(
                f"{BASE}/creators/me/onboarding/voice/answer",
                headers=headers,
                json={"sample_id": sample["id"], "answer": ans},
            )
            if r.status_code != 200:
                bad(f"Voice answer {i+1}", r.text[:200])
                break
            state = r.json()
        else:
            ok("Phase 1 voice answers", "8 cold answers")

        # 8b. Voice phase 2 — Max drafts, creator corrects
        sample = state.get("current_voice_sample")
        if not sample:
            bad("Phase 2 sample", "no current sample after phase 1")
        elif sample.get("sample_phase") != 2:
            bad("Phase 2 sample phase", f"got {sample.get('sample_phase')}")
        elif not sample.get("draft_answer"):
            bad("Phase 2 draft", "expected Max draft on sample 9")
        else:
            r = await client.post(
                f"{BASE}/creators/me/onboarding/voice/feedback",
                headers=headers,
                json={"sample_id": sample["id"], "approved": True},
            )
            if r.status_code == 200:
                ok("Phase 2 voice feedback", "approved draft")
                state = r.json()
            else:
                bad("Phase 2 voice feedback", r.text[:200])

        # Reject scratch answer on phase 2+
        sample = state.get("current_voice_sample")
        if sample and sample.get("sample_phase", 1) >= 2:
            r = await client.post(
                f"{BASE}/creators/me/onboarding/voice/answer",
                headers=headers,
                json={"sample_id": sample["id"], "answer": "should fail"},
            )
            if r.status_code == 422:
                ok("Phase 2 blocks scratch answer")
            else:
                bad("Phase 2 blocks scratch answer", f"status {r.status_code}")

        pct = state.get("voice_pct", 0)
        answered = state.get("voice_samples_answered", 0)
        if answered >= 9:
            ok("Voice progress", f"{pct}% ({answered} answered)")
        else:
            bad("Voice progress", f"{pct}% ({answered} answered)")

        # 9. Update habit targeting
        if habits:
            h = dict(habits[0])
            h["conditions"] = ["All subscribers", "Beginners (first 2 weeks)"]
            h["title"] = h.get("title", "Test habit") + " (edited)"
            r = await client.put(
                f"{BASE}/creators/me/onboarding/habits",
                headers=headers,
                json={"habits": [h] + habits[1:]},
            )
            if r.status_code == 200 and "edited" in (r.json().get("habit_library") or [{}])[0].get("title", ""):
                ok("Habit edit persisted")
            else:
                bad("Habit edit", r.text[:200])

        # 10. Test drive guided flow
        r = await client.post(f"{BASE}/creators/me/onboarding/test-reset", headers=headers)
        state = r.json()
        td = state.get("test_drive") or {}
        steps_done = 0
        while td.get("current") and steps_done < 6:
            cur = td["current"]
            opt = (cur.get("options") or ["Complete beginner"])[0]
            r = await client.post(
                f"{BASE}/creators/me/onboarding/test-drive/answer",
                headers=headers,
                json={"step_id": cur["id"], "answer": opt},
            )
            if r.status_code != 200:
                bad(f"Test drive step {cur['id']}", r.text[:200])
                break
            state = r.json()
            td = state.get("test_drive") or {}
            steps_done += 1
        else:
            if td.get("complete") and len(td.get("schedule") or []) >= 1:
                ok("Test drive schedule", f"{len(td['schedule'])} days")
            else:
                bad("Test drive complete", json.dumps(td)[:200])

        # 11. Delete doc endpoint exists
        docs = state.get("knowledge_docs") or []
        if docs:
            r = await client.request(
                "DELETE",
                f"{BASE}/creators/me/onboarding/docs",
                headers=headers,
                json={"url": docs[0]["url"]},
            )
            if r.status_code == 200 and len(r.json().get("knowledge_docs") or []) < len(docs):
                ok("Delete doc")
            else:
                bad("Delete doc", r.text[:200])

        # 12. Check new routes in openapi
        r = await client.get(f"{BASE.replace('/api', '')}/openapi.json")
        paths = r.json().get("paths", {})
        for p in ["/api/creators/me/onboarding/test-drive/answer", "/api/creators/me/onboarding/docs"]:
            if p in paths:
                ok(f"Route registered: {p}")
            else:
                bad(f"Route missing: {p}")

    print(f"\n{'='*40}\nPassed: {PASS}  Failed: {FAIL}\n{'='*40}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.path.insert(0, ".")
    raise SystemExit(asyncio.run(main()))
