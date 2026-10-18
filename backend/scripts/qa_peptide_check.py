"""Peptidemax protocol check through the real chat path (LOCAL backend,
scheduler off). Each persona answers by tapping chips (or typing) the way a
person would; prints every question, the reply and the plan, then checks the
verdicts.

    RUN_SCHEDULER=false ../.venv/bin/python scripts/qa_peptide_check.py [--only glp1_basic,teen]
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "scripts")
from qa_personas import new_account, onboarding  # noqa: E402

OB = onboarding(wake="06:45", bed="22:45", minutes=40, level="medium", goals=["energy", "sleep"],
                work=("09:00", "17:30"), commute=20, meals=("07:15", "12:30", "19:00"), workout="18:00")

FULL_LABEL = "My name, Who dispensed it (pharmacy or clinic) and a phone, My prescriber's name, How often to take it"
# asked of most personas; a persona's own keys win
COMMON = {"pharmacy label for": FULL_LABEL, "evaluate you": "A video or in-person visit",
          "pharmacy's name": "Belmar Pharmacy, CO"}

# question substring -> answer (first match wins; unmatched = first chip)
PERSONAS = {
    "glp1_basic": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                    "which ones": "Tirzepatide (Zepbound, Mounjaro)", "who prescribed": "A telehealth service",
                    "come from": "A regular pharmacy", "what form": "Pre-filled pen", "how often": "Once a week",
                    "which day": "Sunday", "what time": "Evening", "apply to you": "None of these",
                    "birth control": "No", "follow-up": "Labs and check-ins", "supply": "In 2 to 4 weeks",
                    "match exactly": "Yes, it matches my label"},
                   {"tirzepatide": "remind"}),
    "glp1_mtc_unaware": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                          "which ones": "Ozempic", "who prescribed": "My doctor or nurse practitioner",
                          "come from": "A regular pharmacy", "what form": "Pre-filled pen", "how often": "Once a week",
                          "which day": "Monday", "what time": "Morning", "for semaglutide": "Thyroid cancer (MTC) or MEN 2, me or family",
                          "apply to you": "None of these", "important check": "No, or I'm not sure",
                          "follow-up": "Check-ins only", "supply": "Within a week", "match exactly": "Yes, it matches my label"},
                         {"semaglutide": "hold"}),
    "clinic_stack_mixed": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                            "which ones": "BPC-157, CJC-1295 or Ipamorelin", "who prescribed": "A peptide, wellness or med spa clinic",
                            "bpc-157 come from": "It says 'research use only'", "come from": "A compounding pharmacy, my name on the label",
                            "what form": "Powder I mix", "how often": "Some days on, some off", "pattern": "5 days on, 2 off",
                            "what time": "Before bed", "growth-hormone": "Diabetes or high blood sugar",
                            "apply to you": "I compete in a drug-tested sport", "follow-up": "Nothing set yet",
                            "supply": "Not sure", "match exactly": "Yes, it matches my label"},
                           {"bpc157": "safety_only", "cjc1295": "remind", "ipamorelin": "remind"}),
    "self_sourced": ({"ok to collect": "Yes, I agree", "how old": "18–29", "where are you": "Taking it without a prescription",
                      "which ones": "i use bpc 157 and tb500 from a site", "come from": "A website, no prescription needed",
                      "what form": "Powder I mix", "apply to you": "None of these"},
                     {"bpc157": "safety_only", "tb500": "safety_only"}),
    "considering": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Just considering peptides",
                     "drawing you": "Recovery and training"}, {}),
    "teen": ({"ok to collect": "Yes, I agree", "how old": "Under 18"}, {}),
    "no_consent": ({"ok to collect": "No thanks"}, {}),
    "label_fix": ({"ok to collect": "Yes, I agree", "how old": "50–59", "where are you": "Prescribed, starting soon",
                   "which ones": "Wegovy", "who prescribed": "My doctor or nurse practitioner",
                   "come from": "A regular pharmacy", "what form": "Pre-filled pen", "how often": "Once a week",
                   "which day": "Friday", "what time": "Morning", "apply to you": "None of these",
                   "follow-up": "Labs and check-ins", "supply": "More than a month",
                   "match exactly": ["Something's different", "Yes, it matches my label"], "what's different": "How often or when"},
                  {"semaglutide": "remind"}),
    "urgent": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                "safety check": "Severe belly pain that won't go away"}, {}),
    "two_glp1": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                  "which ones": "ozempic and zepbound", "who prescribed": "A telehealth service",
                  "come from": "A regular pharmacy", "what form": "Pre-filled pen", "how often": "Once a week",
                  "which day": "Tuesday", "what time": "Morning", "important check": "No, or I'm not sure",
                  "match exactly": "Yes, it matches my label"},
                 {"semaglutide": "hold", "tirzepatide": "hold"}),
    "compounded_sema": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                         "which ones": "compounded semaglutide", "who prescribed": "A telehealth service",
                         "come from": "A compounding pharmacy, my name on the label", "what form": "Vial I draw from",
                         "how often": "Once a week", "which day": "Saturday", "what time": "Morning",
                         "match exactly": "I don't have the label handy"},
                        {"semaglutide": "remind"}),
    "label_no_name": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                       "which ones": "Tirzepatide (Zepbound, Mounjaro)", "who prescribed": "A telehealth service",
                       "pharmacy label for": "How often to take it, Who dispensed it (pharmacy or clinic) and a phone",
                       "come from": "A regular pharmacy", "what form": "Pre-filled pen", "apply to you": "None of these",
                       "birth control": "No", "match exactly": "Yes, it matches my label"},
                      {"tirzepatide": "hold"}),
    "belmar_registry": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                         "which ones": "compounded tirzepatide", "who prescribed": "A telehealth service",
                         "evaluate you": "Only an online form",
                         "come from": "A compounding pharmacy, my name on the label", "what form": "Vial I draw from",
                         "how often": "Once a week", "which day": "Thursday", "what time": "Evening",
                         "apply to you": "None of these", "birth control": "Yes",
                         "match exactly": "Yes, it matches my label"},
                        {"tirzepatide": "remind"}),
    "fake_pharmacy": ({"ok to collect": "Yes, I agree", "how old": "30–49", "where are you": "Prescribed, and I'm taking it",
                       "which ones": "sema", "who prescribed": "A peptide, wellness or med spa clinic",
                       "pharmacy's name": "Zzqxv Peptide Lab, NV",
                       "come from": "A compounding pharmacy, my name on the label", "what form": "Vial I draw from",
                       "how often": "Once a week", "which day": "Monday", "what time": "Morning",
                       "apply to you": "None of these", "match exactly": "Yes, it matches my label"},
                      {"semaglutide": "remind"}),
    "hgh_compounded": ({"ok to collect": "Yes, I agree", "how old": "50–59", "where are you": "Prescribed, and I'm taking it",
                        "which ones": "hgh", "who prescribed": "A peptide, wellness or med spa clinic",
                        "come from": "A compounding pharmacy, my name on the label", "what form": "Powder I mix",
                        "growth-hormone": "None of these", "apply to you": "None of these"},
                       {"somatropin": "safety_only"}),
    "oral_sema": ({"ok to collect": "Yes, I agree", "how old": "60 or older", "where are you": "Prescribed, and I'm taking it",
                   "which ones": "rybelsus", "who prescribed": "My doctor or nurse practitioner",
                   "come from": "A regular pharmacy", "what form": "Pill", "how often": "Every day", "what time": "Morning",
                   "for semaglutide": "Thyroid medicine (levothyroxine)", "apply to you": "I take other prescription medicines",
                   "follow-up": "Labs and check-ins", "supply": "More than a month",
                   "match exactly": "Yes, it matches my label"},
                  {"semaglutide": "remind"}),
}


async def run(name: str, script: dict, expect: dict) -> list[str]:
    api = await new_account(OB)
    r = await api.post("/chat/message", {"message": "I want to start my Peptidemax plan.",
                                          "init_context": "peptidemax", "chat_intent": "start_schedule"})
    conv = r.get("conversation_id")
    log, used = [], {}
    for _ in range(40):
        if "plan" in [b.get("type") for b in r.get("visual_blocks") or []] or not (r.get("choices") or "?" in (r.get("response") or "")):
            break
        q = (r.get("response") or "").lower()
        ans = None
        for key, val in {**{k: v for k, v in COMMON.items() if k not in script}, **script}.items():
            if key in q:
                if isinstance(val, list):
                    i = used.get(key, 0)
                    ans = val[min(i, len(val) - 1)]
                    used[key] = i + 1
                else:
                    ans = val
                break
        if ans is None:
            ans = (r.get("choices") or ["not sure"])[0]
        log.append(f"   Q: {q.splitlines()[-1][:110]}  ->  {ans}")
        r = await api.post("/chat/message", {"message": ans, "conversation_id": conv})
    reply = r.get("response") or ""
    full = await api.get("/schedules/active/full")
    s = next((s for s in full["schedules"] if s.get("maxx_id") == "peptidemax"), None)
    plan = ((s or {}).get("schedule_context") or {}).get("ai_plan") or {}
    prof = plan.get("peptide_profile") or {}
    print(f"\n===== {name}")
    print("\n".join(log))
    print("   REPLY:", reply[:500].replace("\n", " | "))
    print("   TRACK:", prof.get("track"), "| verdicts:", {p["slug"]: p["verdict"] for p in prof.get("peptides") or []})
    print("   FLAGS:", [f["code"] for f in prof.get("flags") or []], "| registry:", prof.get("registry"))
    print("   SUMMARY:", plan.get("summary"))
    for h in plan.get("habits") or []:
        print(f"   - {h.get('time') or '--:--'} {h['habit_id']:24} {h['title'][:38]:38} days={','.join(h.get('days') or [])}"
              f"{' weeks=' + str(h['weeks']) if h.get('weeks') else ''}{' every=' + str(h['every_weeks']) if h.get('every_weeks') else ''}")
    problems = []
    got = {p["slug"]: p["verdict"] for p in prof.get("peptides") or []}
    for slug, v in expect.items():
        if got.get(slug) != v:
            problems.append(f"{name}: {slug} expected {v}, got {got.get(slug)}")
    if expect and set(got) != set(expect):
        problems.append(f"{name}: peptides {sorted(got)} but expected {sorted(expect)}")
    if name in ("teen", "no_consent", "urgent") and s is not None:
        problems.append(f"{name}: a plan was built")
    bad = re.compile(r"\b\d+(\.\d+)?\s*(mg|mcg|iu|units?|ml)\b|you should (try|take|start)", re.I)
    for h in plan.get("habits") or []:
        if bad.search(h.get("how", "") + h.get("title", "")):
            problems.append(f"{name}: {h['habit_id']} mentions an amount or recommends")
    days = (s or {}).get("days") or []
    doses = sum(1 for d in days for t in d.get("tasks", []) if "custom_dose" in t.get("catalog_id", ""))
    print(f"   schedule: {len(days)} days, {doses} dose tasks")
    return problems


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    names = [n for n in PERSONAS if not args.only or n in args.only.split(",")]
    results = await asyncio.gather(*[run(n, *PERSONAS[n]) for n in names])
    problems = [p for r in results for p in r]
    print("\nSUMMARY:", "all clean" if not problems else "\n  " + "\n  ".join(problems))


asyncio.run(main())
