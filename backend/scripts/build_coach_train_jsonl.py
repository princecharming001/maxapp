#!/usr/bin/env python3
"""Build starter fine-tune dataset for Max coach + dynamic onboarding.

Run from backend/:
  python scripts/build_coach_train_jsonl.py

Output: training/coach_train.jsonl (upload to Hugging Face AutoTrain)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
_REPO = _BACKEND.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.prompt_constants import MAX_CHAT_SYSTEM_PROMPT
from services.task_catalog_service import warm_catalog, get_doc
import asyncio

OUT = _REPO / "training" / "coach_train.jsonl"

ONBOARDING_SYSTEM = (
    "You are Max, a direct lookmaxxing coach running per-max onboarding. "
    "Given KNOWN user facts and MISSING schedule fields, return JSON only: "
    '{"field_id": "...", "question": "...", "inferred_value": null} '
    "or infer with inferred_value when already known. Never repeat KNOWN facts. "
    "One question, lowercase-friendly, practical."
)


def _row(system: str, user: str, assistant: str) -> dict:
    return {"messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
        {"role": "assistant", "content": assistant},
    ]}


def _onboarding_rows() -> list[dict]:
    rows: list[dict] = []
    asyncio.get_event_loop().run_until_complete(warm_catalog())

    skip_scenarios = [
        {
            "maxx": "hairmax",
            "known": {"wake_time": "07:00", "sleep_time": "23:00", "dietary_restrictions": "vegan", "hair_type": "wavy", "scalp_state": "oily"},
            "infer": {"field_id": "hair_scalp_profile", "inferred_value": "wavy_normal"},
        },
        {
            "maxx": "skinmax",
            "known": {"skin_type": "oily", "primary_skin_concern": "acne breakouts", "wake_time": "07:00"},
            "infer": {"field_id": "skin_concern", "inferred_value": "acne"},
        },
    ]
    for sc in skip_scenarios:
        rows.append(_row(
            ONBOARDING_SYSTEM,
            f"KNOWN:\n{json.dumps(sc['known'])}\n\nMISSING: see hairmax/skinmax required fields.\nInfer if already answered.",
            json.dumps(sc["infer"]),
        ))

    for maxx_id in ("hairmax", "skinmax", "fitmax", "bonemax", "heightmax"):
        doc = get_doc(maxx_id)
        if not doc:
            continue
        for field in doc.required_fields:
            if not field.get("required", True):
                continue
            fid = str(field.get("id"))
            q = str(field.get("question") or fid)
            known = {"wake_time": "07:00", "sleep_time": "23:00", "gender": "male", "age": 22}
            user = (
                f"MAX: {maxx_id}\nKNOWN:\n{json.dumps(known)}\n\n"
                f"MISSING field to ask next: {fid}\n"
                f"WHY: {field.get('why') or ''}\n"
                f"RAG hint: ask about products/protocol for this field in max voice."
            )
            assistant = json.dumps({
                "field_id": fid,
                "question": q.lower(),
                "inferred_value": None,
            })
            rows.append(_row(ONBOARDING_SYSTEM, user, assistant))

    return rows


def _coach_chat_rows() -> list[dict]:
    sys_prompt = MAX_CHAT_SYSTEM_PROMPT
    pairs = [
        ("how do i debloat my face", "cut sodium hard 48-72hrs, push potassium (banana, potato), sleep elevated. no alcohol those nights. that's the fast win."),
        ("what shampoo for oily scalp", "clarifying 2-3x week max — ketoconazole 1% twice weekly if flaky/oily. don't daily harsh sulfate wash, you'll rebound oilier."),
        ("i don't eat meat, plan my meals", "eggs, greek yogurt, tofu, tempeh, lentils, beans — hit protein without chicken/beef. i'll keep meat off your schedule."),
        ("can you skip questions you already know", '{"field_id": "routine_time_pref", "question": "how much time do you want for hair each day?", "inferred_value": null}'),
    ]
    return [_row(sys_prompt, u, a) for u, a in pairs]


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = _onboarding_rows() + _coach_chat_rows()
    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} examples → {OUT}")
    print("Next: upload to https://huggingface.co/autotrain → LLM Fine-tuning")


if __name__ == "__main__":
    main()
