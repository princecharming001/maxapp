"""Peptidemax: the protocol check (deterministic quiz) and who gets what support.

The app never chooses, doses or sources a peptide: choosing a drug and a dose
for a person is a prescriber's job. What this module decides is which KIND of
support each peptide gets, and it only schedules dose reminders when it can
honestly say the protocol is right for this person as far as an app can know:

  * a licensed clinician prescribed it after a real evaluation, and it is
    dispensed by a pharmacy or the prescribing clinic (not a "research use
    only" seller or a website that skips the prescription)
  * the pharmacy label carries their name and who dispensed it, its use-by
    date hasn't passed, and a compounding pharmacy shows up in the national
    provider registry (NPPES)
  * the person checked our summary against that label
  * nothing in the screen for that peptide's class rules it out, or their
    prescriber already knows about it

Verdicts, per peptide:
  remind       dose reminders exactly as the label says, plus the support
               habits its class and form call for
  hold         a hard flag their prescriber doesn't know about (e.g. MTC/MEN 2
               on a GLP-1, cancer on a GH-axis peptide, pregnancy): no
               reminders, "talk to your prescriber before your next dose"
  safety_only  no licensed prescriber or a research-chemical source, or an
               investigational drug nobody can prescribe: no dose reminders,
               harm-reduction habits and a clinician visit instead

Tracks for the whole plan: blocked_minor and no_consent (no plan at all),
learn_first (only considering peptides), protocol (at least one reminder),
hold, safety_first.

The quiz is an event log so corrections never lose history: when the label
check says "something's different", the named part is asked again under a
round suffix ("pep_freq_semaglutide~1"), and every reader uses the latest round.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# ── the peptides people bring (status as of October 2026, see peptidemax.md) ──

GLP1, GH, MELANO, RESEARCH, APPROVED_OTHER, INVESTIGATIONAL, TOPICAL, UNKNOWN = (
    "glp1", "gh_axis", "melanocortin", "research", "approved_other", "investigational", "topical", "unknown")


@dataclass(frozen=True)
class Peptide:
    slug: str
    name: str
    klass: str
    status: str            # approved | approved_other_use | not_approved | investigational | cosmetic
    aliases: tuple[str, ...] = ()
    wada: str = ""         # "" = not prohibited / not named
    note: str = ""         # one plain line for the label check / flags
    scope: str = ""        # what the label approves it for, when people mostly use it for something else
    cat2: bool = False     # FDA lists it as a significant safety risk for compounding (Category 2)


CATALOG: tuple[Peptide, ...] = (
    Peptide("semaglutide", "Semaglutide", GLP1, "approved", ("semaglutide", "wegovy", "ozempic", "rybelsus", "sema")),
    Peptide("tirzepatide", "Tirzepatide", GLP1, "approved", ("tirzepatide", "zepbound", "mounjaro", "tirz")),
    Peptide("liraglutide", "Liraglutide", GLP1, "approved", ("liraglutide", "saxenda", "victoza")),
    # a pill, not a peptide (approved April 2026); here so it isn't "unknown" and counts as a second GLP-1
    Peptide("orforglipron", "Orforglipron", APPROVED_OTHER, "approved", ("orforglipron", "foundayo")),
    Peptide("retatrutide", "Retatrutide", INVESTIGATIONAL, "investigational", ("retatrutide", "reta"),
            note="it's still in trials, FDA says it can't be compounded, and anything sold today is an unapproved drug"),
    Peptide("cagrilintide", "Cagrilintide", INVESTIGATIONAL, "investigational", ("cagrilintide", "cagrisema", "cagri"),
            note="it's still in trials, FDA says it can't be compounded, and anything sold today is an unapproved drug"),
    Peptide("survodutide", "Survodutide", INVESTIGATIONAL, "investigational", ("survodutide",),
            note="it's still in trials, and anything sold today is an unapproved drug"),
    Peptide("mazdutide", "Mazdutide", INVESTIGATIONAL, "investigational", ("mazdutide",),
            note="it isn't approved in the US, and anything sold here is an unapproved drug"),
    Peptide("somatropin", "Somatropin (HGH)", GH, "approved",
            ("somatropin", "hgh", "human growth hormone", "genotropin", "norditropin", "omnitrope",
             "humatrope", "saizen", "zomacton", "nutropin", "sogroya", "skytrofa", "ngenla"), "S2",
            scope="HGH is approved only for specific growth-hormone conditions, and US law bars giving it for anything "
                  "else, like anti-aging or bodybuilding: make sure there's a diagnosis behind your prescription"),
    Peptide("tesamorelin", "Tesamorelin", GH, "approved_other_use", ("tesamorelin", "egrifta", "tesa"), "S2",
            scope="Egrifta is approved only for extra belly fat in adults with HIV; other uses are off-label, and "
                  "its label asks for IGF-1 and blood sugar checks"),
    # Geref (sermorelin) left the market for business reasons, not safety, so
    # 503A pharmacies may compound it as a component of an approved drug
    Peptide("sermorelin", "Sermorelin", GH, "discontinued", ("sermorelin",), "S2"),
    Peptide("cjc1295", "CJC-1295", GH, "not_approved", ("cjc-1295", "cjc1295", "cjc", "mod grf", "modgrf"), "S2"),
    Peptide("ipamorelin", "Ipamorelin", GH, "not_approved", ("ipamorelin", "ipa"), "S2"),
    Peptide("ghrp", "GHRP-2 / GHRP-6", GH, "not_approved", ("ghrp-2", "ghrp-6", "ghrp2", "ghrp6", "ghrp", "hexarelin"), "S2"),
    Peptide("mk677", "MK-677", GH, "not_approved", ("mk-677", "mk677", "ibutamoren"), "S2", cat2=True,
            note="FDA lists it as a significant safety risk (a trial was stopped early for heart failure), so no "
                 "pharmacy should be making it"),
    Peptide("bremelanotide", "Bremelanotide", MELANO, "approved", ("bremelanotide", "vyleesi", "pt-141", "pt141")),
    Peptide("melanotan2", "Melanotan II", MELANO, "not_approved", ("melanotan", "mt-2", "mt2", "mt-ii"),
            note="not approved; case reports of melanoma, new or changing moles and brain swelling"),
    Peptide("setmelanotide", "Setmelanotide", MELANO, "approved", ("setmelanotide", "imcivree"),
            scope="Imcivree is approved only for certain rare genetic or hypothalamic obesity, not general weight "
                  "loss, and its label asks for skin checks and mood monitoring"),
    Peptide("elamipretide", "Elamipretide", APPROVED_OTHER, "approved_other_use", ("elamipretide", "ss-31", "ss31", "forzinity"),
            scope="Forzinity is approved only for Barth syndrome; other uses are off-label, and compounded copies "
                  "of an approved drug are restricted"),
    Peptide("bpc157", "BPC-157", RESEARCH, "not_approved", ("bpc-157", "bpc157", "bpc"), "S0"),
    Peptide("tb500", "TB-500", RESEARCH, "not_approved", ("tb-500", "tb500", "thymosin beta"), "S2"),
    Peptide("motsc", "MOTS-c", RESEARCH, "not_approved", ("mots-c", "motsc", "mots"), "S4"),
    Peptide("aod9604", "AOD-9604", RESEARCH, "not_approved", ("aod-9604", "aod9604", "aod", "hgh frag", "hgh fragment",
                                                              "176-191"), "S2"),
    Peptide("epitalon", "Epitalon", RESEARCH, "not_approved", ("epitalon", "epithalon")),
    Peptide("semax", "Semax", RESEARCH, "not_approved", ("semax",)),
    Peptide("selank", "Selank", RESEARCH, "not_approved", ("selank",)),
    Peptide("kpv", "KPV", RESEARCH, "not_approved", ("kpv",)),
    Peptide("kisspeptin", "Kisspeptin-10", RESEARCH, "not_approved", ("kisspeptin-10", "kisspeptin"), "S2", cat2=True,
            note="FDA lists it as a significant safety risk for compounding, so no pharmacy should be making it"),
    Peptide("thymosin_a1", "Thymosin alpha-1", RESEARCH, "not_approved", ("thymosin alpha", "ta1", "ta-1", "thymalfasin")),
    Peptide("dihexa", "Dihexa", RESEARCH, "not_approved", ("dihexa",)),
    Peptide("ll37", "LL-37", RESEARCH, "not_approved", ("ll-37", "ll37")),
    Peptide("ghkcu", "GHK-Cu (injected)", RESEARCH, "not_approved", ("ghk-cu", "ghkcu", "ghk cu", "copper peptide")),
)
BY_SLUG = {p.slug: p for p in CATALOG}
MAX_PEPTIDES = 4

# the tap chips for "which ones?" (anything else is typed and matched by alias)
NAME_CHIPS = ["Semaglutide (Wegovy, Ozempic)", "Tirzepatide (Zepbound, Mounjaro)", "Tesamorelin",
              "Sermorelin", "CJC-1295 or Ipamorelin", "BPC-157", "TB-500", "Something else (type it)"]

GH_PEPTIDES = {p.slug for p in CATALOG if p.klass == GH}
INCRETINS_OTHER = {"retatrutide", "cagrilintide", "survodutide", "mazdutide", "orforglipron"}


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")[:24] or "peptide"


_FILLER = {"the", "for", "with", "use", "my", "and", "also", "plus", "take", "taking", "peptide", "peptides",
           "none", "some", "this", "that", "dose", "shot", "shots", "pen", "vial", "inject", "injection", "idk",
           "dunno", "not", "sure", "unsure", "idea", "know", "dont", "don't", "forgot", "something", "else",
           "thing", "stuff", "maybe", "think", "called", "name", "label", "from", "clinic", "doctor", "weekly",
           "daily", "every", "week", "morning", "night", "about", "really", "kind", "weight", "loss",
           # how it's made or sold, not what it is ("compounded semaglutide", "sema + b12", "zepbound kwikpen")
           "compounded", "compound", "compounding", "generic", "brand", "injectable", "injections", "tablet",
           "tablets", "pill", "pills", "oral", "nasal", "spray", "cream", "serum", "sodium", "acetate", "salt",
           "b12", "b-12", "cyanocobalamin", "methylcobalamin", "niacinamide", "glycine", "pyridoxine", "kwikpen",
           "flextouch", "autoinjector", "syringe", "syringes", "needle", "needles", "mixed", "blend", "stack",
           "combo", "units", "unit", "vials", "pens", "microdose", "microdosing", "telehealth", "pharmacy",
           "prescribed", "prescription", "frag", "fragment", "version", "only", "currently", "right", "now"}


def parse_names(raw: str) -> list[Peptide]:
    """Every peptide named in a tap answer or typed text, catalog first, in
    the order they appear; unknown names kept as UNKNOWN (max 4)."""
    text = f" {str(raw or '').lower()} "
    # "HGH frag 176-191" is AOD-9604, not growth hormone
    text = re.sub(r"\bhgh[\s-]*frag(?:ment)?\b", " aod-9604 ", text)
    found: list[tuple[int, Peptide]] = []
    for p in CATALOG:
        pos = min((text.find(a) for a in p.aliases if re.search(rf"(?<![a-z0-9]){re.escape(a)}(?![a-z0-9])", text)),
                  default=-1)
        if pos >= 0:
            found.append((pos, p))
    # "CJC-1295 or Ipamorelin" chip = both
    out = [p for _, p in sorted(found, key=lambda x: x[0])]
    seen = {p.slug for p in out}
    leftover = text
    for p in out:
        for a in p.aliases:
            leftover = re.sub(rf"(?<![a-z0-9]){re.escape(a)}(?![a-z0-9])", " ", leftover)
    leftover = re.sub(r"\((?:[^)]*)\)|something else|type it|\band\b|\bor\b|[,;/+&]", " ", leftover)
    for word in re.findall(r"[a-z][a-z0-9\-]{2,}", leftover):
        if word in _FILLER:
            continue
        # an unknown name has to look like one: 5+ letters, or a digit (foxo4-dri, ss-31)
        if len(word) < 5 and not re.search(r"\d", word):
            continue
        slug = "x_" + slugify(word)
        if slug not in seen:
            out.append(Peptide(slug, word.capitalize(), UNKNOWN, "unknown"))
            seen.add(slug)
    return out[:MAX_PEPTIDES]


# ── answers: tap labels → meaning ───────────────────────────────────────────

SITUATION = {
    "Prescribed, and I'm taking it": "prescribed",
    "Prescribed, starting soon": "starting",
    "Taking it without a prescription": "self",
    "Just considering peptides": "considering",
}
PRESCRIBER = {
    "My doctor or nurse practitioner": "clinician",
    "A telehealth service": "telehealth",
    "A peptide, wellness or med spa clinic": "clinic",
    "A coach, trainer or friend": "unlicensed",
}
SOURCE = {
    "A regular pharmacy": "retail_pharmacy",
    "A compounding pharmacy, my name on the label": "compounding",
    "My clinic hands it to me": "clinic",
    "A website, no prescription needed": "website",
    "It says 'research use only'": "research_use",
}
FORM = {
    "Pre-filled pen": "pen", "Vial I draw from": "vial", "Powder I mix": "powder",
    "Pill": "pill", "Nasal spray": "nasal", "Cream or serum": "topical",
}
FREQ = {
    "Once a week": "weekly", "Every day": "daily", "Some days on, some off": "cycle",
    "Only when needed": "as_needed", "Something else (type it)": "other",
}
DAYS = {"Monday": "mon", "Tuesday": "tue", "Wednesday": "wed", "Thursday": "thu", "Friday": "fri",
        "Saturday": "sat", "Sunday": "sun", "Any day": "any"}
TIMES = {"Morning": "morning", "Evening": "evening", "Before bed": "bed", "Any time": "any"}
MONITORING = {"Labs and check-ins": "labs", "Check-ins only": "checkins", "Nothing set yet": "none", "Not sure": "unsure"}
SUPPLY = {"Within a week": "week", "In 2 to 4 weeks": "month", "More than a month": "later", "Not sure": "unsure"}
INTEREST = {"Weight": "weight", "Recovery and training": "recovery", "Sleep": "sleep", "Skin or hair": "skin",
            "Longevity or focus": "longevity", "Sex drive": "libido"}
EVALUATION = {"A video or in-person visit": "visit", "A phone call": "phone", "Only an online form": "form_only",
              "Not sure": "unsure"}
# what the pharmacy label shows (multi); anything missing is checked in decide()
LABEL = {
    "My name": "name",
    "Who dispensed it (pharmacy or clinic) and a phone": "dispenser",
    "My prescriber's name": "prescriber",
    "How often to take it": "directions",
    "Just 'use as directed'": "as_directed",
    "A use-by date that has passed": "expired",
    "There's no pharmacy label": "none",
    "I can't check right now": "cant_check",
}
LABEL_FULL = {"name", "dispenser", "prescriber", "directions"}
SKIP_OPT = "Skip this"
FIX = {"Which peptide it is": "names", "How often or when": "freq", "Who prescribed it or where it's from": "source",
       "The form it comes in": "form"}

# screens (multi): label → flag code
URGENT = {
    "Severe belly pain that won't go away": "belly",
    "Trouble breathing, or face or throat swelling": "allergy",
    "Chest pain, fainting or a racing heart at rest": "heart_now",
    "Thoughts of harming myself": "self_harm",
}

SCREEN_GENERAL = {
    "Pregnant, trying, or breastfeeding": "pregnancy",
    "Surgery or a procedure coming up": "surgery",
    "I compete in a drug-tested sport": "athlete",
    "I take other prescription medicines": "other_meds",
}
SCREEN_GLP1 = {
    "Thyroid cancer (MTC) or MEN 2, me or family": "mtc_men2",
    "Pancreatitis, ever": "pancreatitis",
    "Gallbladder problems": "gallbladder",
    "Insulin, or diabetes pills like glipizide": "hypo_meds",
    "An eating disorder, now or before": "eating_disorder",
    "Severe stomach problems (gastroparesis)": "gastroparesis",
    "Diabetic eye disease": "retinopathy",
}
SCREEN_GLP1_ORAL = {"Thyroid medicine (levothyroxine)": "levothyroxine"}       # oral semaglutide raises it
SCREEN_GH = {
    "Cancer, now or in the past": "cancer",
    "Diabetes or high blood sugar": "diabetes",
    "A pituitary or hypothalamus condition": "pituitary",
}
SCREEN_GH_MK677 = {"Heart failure": "heart_failure"}
SCREEN_MELANO = {
    "High blood pressure that isn't controlled": "uncontrolled_bp",
    "Heart disease": "heart",
    "I take naltrexone": "naltrexone",
    "Moles that changed, or skin cancer": "moles",
}
SCREEN_RESEARCH = {
    "Cancer, now or in the past": "cancer",
    "An autoimmune condition": "autoimmune",
}
SCREEN_RESEARCH_TA1 = {"A transplant, or a weakened immune system": "transplant"}
SCREEN_RESEARCH_SEMAX = {"Blood thinners, or a bleeding problem": "bleeding"}
NONE_OPT = "None of these"

# flag code → (severity, plain talking point for the prescriber task)
FLAG_TEXT = {
    "pregnancy": ("hard", "you're pregnant, trying, or breastfeeding: most peptides have no safety data in pregnancy"),
    "mtc_men2": ("hard", "thyroid cancer (MTC) or MEN 2 in you or your family: GLP-1 labels say not to use them"),
    "eating_disorder": ("hard", "an eating disorder now or before: expert guidance says GLP-1s generally shouldn't be used during one, and a past one needs specialist input"),
    "cancer": ("hard", "a cancer history: growth-hormone and growth-signalling peptides raise questions your prescriber should weigh"),
    "pituitary": ("hard", "a pituitary or hypothalamus condition: tesamorelin's label rules it out, and other GH peptides act on the same axis"),
    "uncontrolled_bp": ("hard", "high blood pressure that isn't controlled: bremelanotide's label rules it out"),
    "heart": ("hard", "heart disease: bremelanotide's label rules it out"),
    "moles": ("hard", "changing moles or skin cancer: melanotan II has case reports of melanoma"),
    "melanotan": ("hard", "melanotan II isn't approved anywhere and has case reports of melanoma and brain swelling"),
    "pancreatitis": ("soft", "pancreatitis in the past: GLP-1 labels warn about pancreatitis, so your prescriber should know your history"),
    "gallbladder": ("soft", "gallbladder problems: GLP-1s can cause gallbladder issues"),
    "hypo_meds": ("soft", "insulin or a sulfonylurea: together with a GLP-1 they raise the risk of low blood sugar"),
    "gastroparesis": ("soft", "severe stomach problems: GLP-1 labels don't recommend them with severe gastroparesis"),
    "retinopathy": ("soft", "diabetic eye disease: GLP-1 labels ask your prescriber to monitor it"),
    "levothyroxine": ("soft", "levothyroxine: oral semaglutide raises its levels, so your prescriber may want thyroid labs"),
    "oral_bc": ("soft", "birth control pills: tirzepatide's label says to switch to a non-pill method or add a barrier method for 4 weeks after starting and after each dose increase"),
    "two_incretins": ("hard", "two GLP-1 type drugs at once: their labels say not to combine them"),
    "compounded_glp1": ("soft", "a compounded GLP-1: compounded drugs aren't FDA-approved, and since the shortages ended a pharmacy may only compound one for a documented medical need, so ask why yours is compounded and about the approved version"),
    "diabetes": ("soft", "diabetes or high blood sugar: growth-hormone peptides can raise blood sugar"),
    "heart_failure": ("hard", "heart failure: an MK-677 trial was stopped early for heart failure"),
    "transplant": ("hard", "a transplant or a weakened immune system: thymosin alpha-1's foreign labels warn against it, and FDA flags transplant complications"),
    "bleeding": ("soft", "blood thinners or a bleeding problem: FDA flags a possible anti-clotting effect for semax"),
    "naltrexone": ("soft", "naltrexone: bremelanotide can lower how much of it your body absorbs"),
    "male_bremelanotide": ("soft", "bremelanotide is approved only for premenopausal women; other uses are off-label"),
    "autoimmune": ("soft", "an autoimmune condition: FDA's main concern with these peptides is immune reactions"),
    "surgery": ("soft", "a procedure coming up: tell your surgeon and anesthesia team you take this before the day"),
    "other_meds": ("soft", "other prescription medicines: ask your pharmacist to check them against your peptides"),
    "athlete": ("info", "you compete in a drug-tested sport: several of yours are banned at all times (WADA), so check each on Global DRO before your next test"),
    "not_compoundable": ("soft", "one of yours isn't FDA-approved, and whether pharmacies may compound it is still being decided: ask which pharmacy made it and what testing it had"),
    "unknown_name": ("soft", "a peptide i don't have on file: ask your pharmacist exactly what it is and whether it's FDA-approved"),
    "questionnaire_only": ("soft", "you were prescribed from an online form alone: medical boards say that doesn't meet the standard of care, so ask for a video or in-person visit"),
    "label_prescriber": ("soft", "your label doesn't show a prescriber: ask the pharmacy to confirm it was filled on a real prescription"),
    "as_directed": ("soft", "your label doesn't spell out the schedule, so get it in writing from your prescriber"),
    "pharmacy_elsewhere": ("soft", "the registry lists a pharmacy by that name, but not in the state you gave: check the name and address on your label match the pharmacy you expect"),
    "pharmacy_not_found": ("soft", "i couldn't find your compounding pharmacy in the national provider registry under that name: ask your prescriber to confirm it's licensed, or look it up on your state board of pharmacy's site"),
}


def _pick(raw: str, table: dict) -> Optional[str]:
    t = str(raw or "").strip().lower()
    if not t:
        return None
    for label, code in table.items():
        if label.lower() == t:
            return code
    for label, code in table.items():
        if label.lower() in t or t in label.lower():
            return code
    return None


def _multi(raw: str, table: dict) -> set[str]:
    t = str(raw or "").lower()
    return {code for label, code in table.items() if label.lower() in t}


def _prescriber(raw: str) -> Optional[str]:
    """Tap label, or a typed answer ('Dr. Patel', 'hims', 'my trainer')."""
    hit = _pick(raw, PRESCRIBER)
    if hit or not raw:
        return hit
    t = str(raw).lower()
    for code, pat in (("unlicensed", r"\b(coach|trainer|friend|gym|myself|nobody|no one|forum|reddit)\b"),
                      ("clinic", r"\b(clinic|spa|wellness|anti-?aging|longevity|iv bar)\b"),
                      ("telehealth", r"\b(telehealth|telemedicine|online|app|website|hims|hers|mochi|calibrate|noom|weightwatchers)\b"),
                      ("clinician", r"\b(dr|doctor|md|np|nurse|physician|endo\w*|gp|primary care|obgyn|gyn\w*)\b")):
        if re.search(pat, t):
            return code
    return None


def _label(raw: Optional[str]) -> Optional[set[str]]:
    """What the pharmacy label shows. None = not asked."""
    if raw is None:
        return None
    t = str(raw).lower()
    got = _multi(t, LABEL)
    if "as directed" in t:
        got.add("as_directed")
    if got:
        return got
    if re.search(r"\b(all|everything|every|yes|yep|yeah)\b", t):
        return set(LABEL_FULL)
    return {"cant_check"}


def _label_hold(label: Optional[set[str]]) -> Optional[str]:
    """A label that doesn't show it was dispensed for this person holds reminders."""
    if not label or "cant_check" in label:
        return None
    if "none" in label:
        return "there's no pharmacy label with your name on it, so nothing shows it was dispensed for you"
    if "expired" in label:
        return "the use-by date on your label has passed: ask the pharmacy before using it"
    if "name" not in label:
        return "the label doesn't show your name, so nothing shows it was dispensed for you"
    if "dispenser" not in label:
        return "the label doesn't show who dispensed it or a phone number to reach them"
    return None


def _flag_text(code: str) -> tuple[str, str]:
    if code.startswith("scope_"):
        p = BY_SLUG.get(code[len("scope_"):])
        return ("soft", p.scope if p else "")
    return FLAG_TEXT.get(code, ("", ""))


def _yes(raw: str) -> bool:
    return bool(re.match(r"\s*(yes|yeah|yep|y\b|ok|sure|they know)", str(raw or "").lower()))


# ── the event log: corrections re-ask a part under a round suffix ───────────

def _fix_groups(answers: dict) -> list[set[str]]:
    """groups invalidated by fix round 1, round 2"""
    out = []
    for n in (1, 2):
        raw = answers.get(f"pep_fix_{n}")
        if raw is None:
            break
        groups = _multi(raw, FIX) or {"names"}
        if "names" in groups:
            groups |= {"freq", "source", "form"}
        out.append(groups)
    return out


def _round(group: Optional[str], answers: dict) -> int:
    if not group:
        return 0
    r = 0
    for n, groups in enumerate(_fix_groups(answers), start=1):
        if group in groups:
            r = n
    return r


def _key(base: str, group: Optional[str], answers: dict) -> str:
    r = _round(group, answers)
    return base if r == 0 else f"{base}~{r}"


def _get(answers: dict, base: str, group: Optional[str] = None) -> Optional[str]:
    v = answers.get(_key(base, group, answers))
    return None if v is None else str(v)


def _fix_round(answers: dict) -> int:
    return len(_fix_groups(answers))


# ── reading the whole answer set ────────────────────────────────────────────

def read(answers: dict, profile: Optional[dict] = None) -> dict:
    about = (profile or {}).get("about") or {}
    age = str(answers.get("age_band") or about.get("age_band") or "")
    sex = str(answers.get("sex") or about.get("sex") or "")
    consent = answers.get("pep_consent")
    situation = _pick(answers.get("pep_situation", ""), SITUATION)
    names_raw = _get(answers, "pep_names", "names")
    typed = _get(answers, "pep_names_typed", "names")
    names_text = f"{names_raw or ''} {typed or ''}"
    peptides = parse_names(names_text) if names_raw is not None else []
    # semaglutide sodium / acetate: salt forms FDA knows no lawful basis to compound
    salt = bool(re.search(r"\b(sodium|acetate)\b", names_text.lower()))
    if names_raw is not None and typed is not None and not peptides:
        peptides = [Peptide("x_peptide", "Your peptide", UNKNOWN, "unknown")]
    per = []
    for p in peptides:
        s = p.slug
        per.append({
            "peptide": p,
            "source": _pick(_get(answers, f"pep_source_{s}", "source") or "", SOURCE),
            "form": _pick(_get(answers, f"pep_form_{s}", "form") or "", FORM),
            "freq": _pick(_get(answers, f"pep_freq_{s}", "freq") or "", FREQ),
            "freq_text": _get(answers, f"pep_freq_{s}", "freq") or "",
            "cycle_text": _get(answers, f"pep_cycle_{s}", "freq") or "",
            "day": _pick(_get(answers, f"pep_day_{s}", "freq") or "", DAYS),
            "time": _pick(_get(answers, f"pep_time_{s}", "freq") or "", TIMES),
            "label": _label(_get(answers, f"pep_label_{s}", "source")),
            "salt": salt and p.klass == GLP1,
        })
    urgent = _multi(answers.get("pep_urgent", ""), URGENT)
    general = _multi(answers.get("pep_screen_general", ""), SCREEN_GENERAL)
    glp1 = _multi(answers.get("pep_screen_glp1", ""), {**SCREEN_GLP1, **SCREEN_GLP1_ORAL})
    gh = _multi(answers.get("pep_screen_gh", ""), {**SCREEN_GH, **SCREEN_GH_MK677})
    melano = _multi(answers.get("pep_screen_melano", ""), SCREEN_MELANO)
    research = _multi(answers.get("pep_screen_research", ""),
                      {**SCREEN_RESEARCH, **SCREEN_RESEARCH_TA1, **SCREEN_RESEARCH_SEMAX})
    registry = answers.get("pep_registry")
    confirm_raw = answers.get(f"pep_confirm{'' if _fix_round(answers) == 0 else '~' + str(_fix_round(answers))}")
    return {
        "consent": None if consent is None else _yes(consent) or "continue" in str(consent).lower(),
        "urgent": urgent,
        "age_band": age, "minor": "under 18" in age.lower(), "sex": sex,
        "situation": situation,
        "interest": _pick(answers.get("pep_interest", ""), INTEREST),
        "prescriber": _prescriber(_get(answers, "pep_prescriber", "source") or ""),
        "evaluation": _pick(_get(answers, "pep_evaluation", "source") or "", EVALUATION),
        "pharmacy": _get(answers, "pep_pharmacy", "source"),
        "registry": registry if isinstance(registry, dict) else None,
        "peptides": per,
        "screens": {"general": general, "glp1": glp1, "gh": gh, "melano": melano, "research": research},
        "oral_bc": _yes(answers.get("pep_oral_bc", "")),
        "aware": None if answers.get("pep_aware") is None else _yes(answers.get("pep_aware")),
        "monitoring": _pick(answers.get("pep_monitoring", ""), MONITORING),
        "supply": _pick(answers.get("pep_supply", ""), SUPPLY),
        "confirm": None if confirm_raw is None else (
            "yes" if re.search(r"\bmatch|exactly|yes\b", str(confirm_raw).lower())
            else "no_label" if "label" in str(confirm_raw).lower() and "don" in str(confirm_raw).lower()
            else "different"),
        "fix_round": _fix_round(answers),
    }


def classes(r: dict) -> set[str]:
    return {x["peptide"].klass for x in r["peptides"]}


def _has_slug(r: dict, slug: str) -> bool:
    return any(x["peptide"].slug == slug for x in r["peptides"])


def _protocol_path(r: dict) -> bool:
    return r["situation"] in ("prescribed", "starting")


LICENSED = ("clinician", "telehealth", "clinic")


def _no_reminder_reason(r: dict, x: dict) -> Optional[str]:
    """Why this peptide can never be reminded, whatever the label and screens
    say (None = it can). These are the safety_only verdicts."""
    p = x["peptide"]
    if not (_protocol_path(r) and r["prescriber"] in LICENSED):
        return "no licensed prescriber set this protocol"
    if x["source"] in ("website", "research_use"):
        return "sold without a prescription or as 'research use only', so nobody can vouch for what's in it"
    if p.klass == INVESTIGATIONAL or p.cat2:
        return p.note
    if x.get("salt"):
        return ("it's a salt form (sodium or acetate), which isn't the approved drug, and FDA knows of no lawful "
                "way to compound it")
    if p.slug == "somatropin" and x["source"] in ("compounding", "clinic"):
        return "HGH can't be compounded; real HGH comes only from a pharmacy, with your name on the label"
    return None


# ── the questions, in order ─────────────────────────────────────────────────

AGE_OPTIONS = ["Under 18", "18–29", "30–49", "50–59", "60 or older"]


def _summary_lines(r: dict) -> list[str]:
    lines = []
    for x in r["peptides"]:
        p = x["peptide"]
        freq = {"weekly": "once a week", "daily": "every day", "cycle": f"on and off ({x['cycle_text'] or 'a cycle'})",
                "as_needed": "only when needed"}.get(x["freq"] or "", x["freq_text"] or "as your label says")
        if x["freq"] == "weekly" and x["day"] and x["day"] != "any":
            freq += f" on {next(k for k, v in DAYS.items() if v == x['day'])}s"
        form = next((k.lower() for k, v in FORM.items() if v == x["form"]), "")
        src = next((k for k, v in SOURCE.items() if v == x["source"]), "")
        lines.append(f"• {p.name}, {freq}" + (f", {form}" if form else "") + (f", from {src[0].lower() + src[1:]}" if src else ""))
    who = next((k for k, v in PRESCRIBER.items() if v == r["prescriber"]), "")
    if who:
        lines.append(f"• prescribed by {who[0].lower() + who[1:]}")
    return lines


def _flag_codes(r: dict) -> set[str]:
    """Every screen answer that applies to a peptide this person actually named."""
    k = classes(r)
    s = r["screens"]
    codes: set[str] = set()
    if "pregnancy" in s["general"] and k - {TOPICAL}:
        codes.add("pregnancy")
    codes |= s["general"] & {"surgery", "other_meds", "athlete"}
    incretins = [x for x in r["peptides"] if x["peptide"].klass == GLP1 or x["peptide"].slug in INCRETINS_OTHER]
    if len(incretins) >= 2:
        codes.add("two_incretins")
    if _protocol_path(r) and any(x["source"] == "compounding" and x["peptide"].klass == GLP1 for x in r["peptides"]):
        codes.add("compounded_glp1")
    if GLP1 in k:
        codes |= s["glp1"] - {"levothyroxine"}
        if "levothyroxine" in s["glp1"] and _oral_sema(r):
            codes.add("levothyroxine")
        if r["oral_bc"] and _has_slug(r, "tirzepatide"):
            codes.add("oral_bc")
    if GH in k:
        codes |= s["gh"] - {"heart_failure"}
        if "heart_failure" in s["gh"] and _has_slug(r, "mk677"):
            codes.add("heart_failure")
    if MELANO in k:
        codes |= s["melano"]
        if _has_slug(r, "melanotan2"):
            codes.add("melanotan")
        if _has_slug(r, "bremelanotide") and r["sex"].lower() == "male":
            codes.add("male_bremelanotide")
    if k & {RESEARCH, UNKNOWN}:
        codes |= s["research"] - {"transplant", "bleeding"}
        if "transplant" in s["research"] and _has_slug(r, "thymosin_a1"):
            codes.add("transplant")
        if "bleeding" in s["research"] and _has_slug(r, "semax"):
            codes.add("bleeding")
    if "athlete" in codes and not any(_wada_prohibited(x["peptide"]) for x in r["peptides"]):
        codes.discard("athlete")
    # a prescribed research peptide still isn't approved, and isn't on the list
    # pharmacies may compound from: the prescriber should say which pharmacy made it
    if _protocol_path(r) and any(x["peptide"].status == "not_approved" for x in r["peptides"]):
        codes.add("not_compoundable")
    if _protocol_path(r) and UNKNOWN in k:
        codes.add("unknown_name")
    if _protocol_path(r):
        codes |= {f"scope_{x['peptide'].slug}" for x in r["peptides"] if x["peptide"].scope}
    if r["evaluation"] == "form_only" and r["prescriber"] in ("telehealth", "clinic"):
        codes.add("questionnaire_only")
    for x in r["peptides"]:
        lab = x["label"]
        if not lab or "cant_check" in lab or _label_hold(lab) or _no_reminder_reason(r, x):
            continue
        if "prescriber" not in lab:
            codes.add("label_prescriber")
        if "as_directed" in lab or "directions" not in lab:
            codes.add("as_directed")
    if (r["registry"] or {}).get("status") == "not_found":
        codes.add("pharmacy_not_found")
    if (r["registry"] or {}).get("status") == "elsewhere":
        codes.add("pharmacy_elsewhere")
    return codes


def _oral_sema(r: dict) -> bool:
    return any(x["peptide"].slug == "semaglutide" and x["form"] == "pill" for x in r["peptides"])


def _wada_prohibited(p: Peptide) -> bool:
    """Named in the list, or not approved anywhere (S0 covers every unapproved substance)."""
    return bool(p.wada) or p.status in ("not_approved", "investigational", "unknown")


def _hard_codes(r: dict) -> set[str]:
    return {c for c in _flag_codes(r) if _flag_text(c)[0] == "hard"}


def _q(key: str, question: str, options: list, *, multi: bool = False, ack: str = "") -> dict:
    return {"done": False, "ack": ack, "question": question, "options": list(options), "multi": multi, "fact_key": key}


# Washington's My Health My Data Act (and Nevada's, Connecticut's) want a
# separate, opt-in consent that names what's collected, why, who handles it
# and how to withdraw, before any of it is collected. Apple 5.1.2(i) wants
# third-party AI named. Keep this in step with the privacy policy.
CONSENT_TEXT = (
    "before we start, here's what peptidemax keeps and why.\n\n"
    "what i'll ask and save: the peptides you take, what your label says about them, a few health questions, "
    "and anything you log.\n"
    "what it's for: only your reminders and this plan.\n"
    "who handles it: our hosting and AI providers process it for us under contract. it's never sold, never used "
    "for ads, and never shared with ad or social media companies.\n"
    "your control: stop peptidemax any time and i delete your answers and plan details; delete this chat or "
    "your account to erase the rest.\n\n"
    "this organizes what your prescriber set. it isn't medical advice, and it never chooses or doses anything. "
    "ok to collect this?")

DONE = {"done": True, "ack": "thanks, building your plan", "question": "", "options": [], "multi": False, "fact_key": ""}


def _remindable(r: dict, x: dict) -> bool:
    """Could still get reminders, given everything asked so far."""
    if _no_reminder_reason(r, x) or _label_hold(x["label"]):
        return False
    mine = {c for c in _hard_codes(r) if _applies(c, x["peptide"])}
    return not mine or bool(r["aware"])


def _needs_pharmacy(r: dict) -> bool:
    """A compounding pharmacy we might remind from: worth a registry lookup."""
    return any(x["source"] == "compounding" and not _no_reminder_reason(r, x) and not _label_hold(x["label"])
               for x in r["peptides"])


def next_question(answers: dict, asked: list, profile: Optional[dict] = None) -> dict:
    a = answers or {}
    r = read(a, profile)

    if "pep_consent" not in a:
        return _q("pep_consent", CONSENT_TEXT, ["Yes, I agree", "No thanks"])
    if not r["consent"]:
        return {**DONE, "ack": ""}
    if not r["age_band"]:
        return _q("age_band", "how old are you?", AGE_OPTIONS)
    if r["minor"]:
        return {**DONE, "ack": ""}
    if not r["situation"]:
        return _q("pep_situation", "where are you with peptides right now?", list(SITUATION))
    if r["situation"] == "considering":
        if "pep_interest" not in a:
            return _q("pep_interest", "what's drawing you to them?", list(INTEREST))
        return {**DONE, "ack": "got it"}
    if r["situation"] in ("prescribed", "self") and "pep_urgent" not in a:
        return _q("pep_urgent", "first, a safety check. right now, do you have any of these?",
                  [NONE_OPT] + list(URGENT), multi=True)
    if r["urgent"]:
        return {**DONE, "ack": ""}

    if _get(a, "pep_names", "names") is None:
        return _q(_key("pep_names", "names", a),
                  f"which ones? tap all that apply, or type the name as it's on the label (up to {MAX_PEPTIDES}).",
                  NAME_CHIPS, multi=True)
    if not r["peptides"] and _get(a, "pep_names_typed", "names") is None:
        # answered, but nothing we could read: ask once more, typed
        return _q(_key("pep_names_typed", "names", a), "i didn't catch the name. type it as it's written on the label.", [])

    if _protocol_path(r) and _get(a, "pep_prescriber", "source") is None:
        return _q(_key("pep_prescriber", "source", a), "who prescribed it?", list(PRESCRIBER))
    if _protocol_path(r) and r["prescriber"] in ("telehealth", "clinic") and _get(a, "pep_evaluation", "source") is None:
        return _q(_key("pep_evaluation", "source", a), "before prescribing, how did they evaluate you?", list(EVALUATION))

    for x in r["peptides"]:
        p, s = x["peptide"], x["peptide"].slug
        if _get(a, f"pep_source_{s}", "source") is None:
            return _q(_key(f"pep_source_{s}", "source", a), f"where does your {p.name} come from?", list(SOURCE))
        if _get(a, f"pep_form_{s}", "form") is None:
            return _q(_key(f"pep_form_{s}", "form", a), f"what form is your {p.name}?", list(FORM))
        if _no_reminder_reason(r, x):
            continue        # nothing will be reminded, so no label or schedule questions
        if _get(a, f"pep_label_{s}", "source") is None:
            return _q(_key(f"pep_label_{s}", "source", a),
                      f"find the pharmacy label for your {p.name} (on the box, bag, bottle or vial). what does it show? "
                      "tap all that apply.", list(LABEL), multi=True)
        if _label_hold(x["label"]):
            continue        # held until the label is sorted, so no schedule questions yet
        if _get(a, f"pep_freq_{s}", "freq") is None:
            return _q(_key(f"pep_freq_{s}", "freq", a),
                      f"how often does your label say to take {p.name}?", list(FREQ))
        if x["freq"] == "cycle" and _get(a, f"pep_cycle_{s}", "freq") is None:
            return _q(_key(f"pep_cycle_{s}", "freq", a), f"what's the on and off pattern for {p.name}?",
                      ["5 days on, 2 off", "Weekdays only", "Some weeks on, then a break"])
        if x["freq"] == "weekly" and _get(a, f"pep_day_{s}", "freq") is None:
            return _q(_key(f"pep_day_{s}", "freq", a), f"which day do you take {p.name}?", list(DAYS))
        if x["freq"] in ("weekly", "daily", "cycle", "other") and _get(a, f"pep_time_{s}", "freq") is None:
            return _q(_key(f"pep_time_{s}", "freq", a), f"what time of day do you take {p.name}?", list(TIMES))

    if _needs_pharmacy(r) and r["pharmacy"] is None:
        return _q(_key("pep_pharmacy", "source", a),
                  "what's the compounding pharmacy's name and state on the label? (for example: Belmar Pharmacy, CO) "
                  "i'll look it up in the national provider registry.", [SKIP_OPT])

    k = classes(r)
    if "pep_screen_general" not in a:
        return _q("pep_screen_general", "now a few health questions. do any of these apply to you?",
                  [NONE_OPT] + list(SCREEN_GENERAL), multi=True)
    if GLP1 in k and "pep_screen_glp1" not in a:
        names = " and ".join(x["peptide"].name for x in r["peptides"] if x["peptide"].klass == GLP1)
        opts = [NONE_OPT] + list(SCREEN_GLP1) + (list(SCREEN_GLP1_ORAL) if _oral_sema(r) else [])
        return _q("pep_screen_glp1", f"for {names}: do any of these apply to you?", opts, multi=True)
    if _has_slug(r, "tirzepatide") and r["sex"].lower() != "male" and "pep_oral_bc" not in a:
        return _q("pep_oral_bc", "do you use birth control pills?", ["Yes", "No", "Not relevant to me"])
    if GH in k and "pep_screen_gh" not in a:
        opts = [NONE_OPT] + list(SCREEN_GH) + (list(SCREEN_GH_MK677) if _has_slug(r, "mk677") else [])
        return _q("pep_screen_gh", "growth-hormone peptides act on the same system. do any of these apply?",
                  opts, multi=True)
    if MELANO in k and "pep_screen_melano" not in a:
        names = " and ".join(x["peptide"].name for x in r["peptides"] if x["peptide"].klass == MELANO)
        return _q("pep_screen_melano", f"for {names}: do any of these apply to you?", [NONE_OPT] + list(SCREEN_MELANO), multi=True)
    if k & {RESEARCH, UNKNOWN} and "pep_screen_research" not in a:
        research = [x["peptide"].name for x in r["peptides"] if x["peptide"].klass == RESEARCH]
        unknown = [x["peptide"].name for x in r["peptides"] if x["peptide"].klass == UNKNOWN]
        lead = []
        if research:
            lead.append(f"{' and '.join(research)} {'isn' if len(research) == 1 else 'aren'}'t FDA-approved, so "
                        "there's little human safety data")
        if unknown:
            lead.append(f"i don't have {' or '.join(unknown)} on file")
        opts = [NONE_OPT] + list(SCREEN_RESEARCH) + (list(SCREEN_RESEARCH_TA1) if _has_slug(r, "thymosin_a1") else []) \
            + (list(SCREEN_RESEARCH_SEMAX) if _has_slug(r, "semax") else [])
        return _q("pep_screen_research", "; ".join(lead) + ". do any of these apply to you?", opts, multi=True)

    if _protocol_path(r) and _hard_codes(r) and "pep_aware" not in a:
        why = "; ".join(_flag_text(c)[1].split(":")[0] for c in sorted(_hard_codes(r)))
        return _q("pep_aware", f"one important check. does your prescriber know about this: {why}?",
                  ["Yes, they know and still prescribed it", "No, or I'm not sure"])

    if not any(_remindable(r, x) for x in r["peptides"]):
        return DONE         # nothing will be reminded: follow-up, supply and the label match don't change the plan
    if "pep_monitoring" not in a:
        return _q("pep_monitoring", "what follow-up did your prescriber set?", list(MONITORING))
    if "pep_supply" not in a:
        return _q("pep_supply", "when does your current supply run out?", list(SUPPLY))

    if _protocol_path(r):
        n = r["fix_round"]
        ck = "pep_confirm" if n == 0 else f"pep_confirm~{n}"
        if ck not in a:
            return _q(ck, "last step. check this against your pharmacy label:\n" + "\n".join(_summary_lines(r))
                      + "\ndoes it match exactly?",
                      ["Yes, it matches my label", "Something's different", "I don't have the label handy"])
        if r["confirm"] == "different" and n < 2 and f"pep_fix_{n + 1}" not in a:
            return _q(f"pep_fix_{n + 1}", "what's different? i'll ask that part again.", list(FIX), multi=True)
    return DONE


# ── who gets what ───────────────────────────────────────────────────────────

def decide(answers: dict, profile: Optional[dict] = None) -> dict:
    r = read(answers or {}, profile)
    if r["consent"] is False:
        return {"track": "no_consent", "peptides": [], "flags": []}
    if r["minor"]:
        return {"track": "blocked_minor", "peptides": [], "flags": []}
    if r["urgent"]:
        return {"track": "urgent", "urgent": sorted(r["urgent"]), "peptides": [], "flags": []}
    if r["situation"] == "considering":
        return {"track": "learn_first", "interest": r["interest"], "peptides": [], "flags": []}

    hard = _hard_codes(r)
    aware = bool(r["aware"])
    confirmed = r["confirm"]
    unconfirmed = r["confirm"] == "different"      # still different after the fix rounds
    flags = [{"code": c, "severity": _flag_text(c)[0], "text": _flag_text(c)[1]} for c in sorted(_flag_codes(r))]
    out_peps = []
    for x in r["peptides"]:
        p = x["peptide"]
        reasons: list[str] = []
        hold_kind = ""
        never = _no_reminder_reason(r, x)
        if never:
            verdict = "safety_only"
            reasons.append(never)
        else:
            mine = {c for c in hard if _applies(c, p)}
            label_issue = _label_hold(x["label"])
            if mine and not aware:
                verdict, hold_kind = "hold", "flag"
                reasons += [_flag_text(c)[1] for c in sorted(mine)]
            elif label_issue:
                verdict, hold_kind = "hold", "label"
                reasons.append(label_issue)
            elif unconfirmed:
                verdict, hold_kind = "hold", "label"
                reasons.append("the details still don't match your label")
            else:
                verdict = "remind"
                if mine:
                    reasons.append("your prescriber knows about: " + "; ".join(_flag_text(c)[1].split(":")[0] for c in sorted(mine)))
        if verdict == "remind" and x["freq"] == "as_needed":
            reasons.append("taken only when needed, so it's logged rather than reminded")
        out_peps.append({
            "slug": p.slug, "name": p.name, "klass": p.klass, "status": p.status, "wada": p.wada,
            "verdict": verdict, "reasons": reasons, "hold_kind": hold_kind,
            "source": x["source"], "form": x["form"], "freq": x["freq"], "freq_text": x["freq_text"],
            "cycle_text": x["cycle_text"], "day": x["day"], "time": x["time"],
            "label": sorted(x["label"]) if x["label"] is not None else None,
        })
    verdicts = {p["verdict"] for p in out_peps}
    track = "protocol" if "remind" in verdicts else "hold" if "hold" in verdicts else "safety_first"
    return {
        "track": track, "peptides": out_peps, "flags": flags, "prescriber_aware": r["aware"],
        "confirmed": confirmed, "monitoring": r["monitoring"], "supply": r["supply"],
        "situation": r["situation"], "prescriber": r["prescriber"], "evaluation": r["evaluation"],
        "registry": r["registry"],
    }


def _applies(code: str, p: Peptide) -> bool:
    """Which hard flags matter for which peptide."""
    if code == "pregnancy":
        return p.klass != TOPICAL
    if code in ("mtc_men2", "eating_disorder"):
        return p.klass == GLP1
    if code == "two_incretins":
        return p.klass == GLP1 or p.slug in INCRETINS_OTHER
    if code == "cancer":
        return p.klass in (GH, RESEARCH, UNKNOWN)
    if code == "pituitary":
        # for HGH a pituitary condition is often why it's prescribed
        return p.klass == GH and p.slug != "somatropin"
    if code == "heart_failure":
        return p.slug == "mk677"
    if code == "transplant":
        return p.slug == "thymosin_a1"
    if code in ("uncontrolled_bp", "heart"):
        return p.slug == "bremelanotide"
    if code in ("moles", "melanotan"):
        return p.slug == "melanotan2"
    return False


def blocked_reply(decision: dict) -> Optional[str]:
    """The chat reply when no plan is built at all."""
    if decision["track"] == "blocked_minor":
        return ("peptidemax is for adults 18 and over, so i can't set it up for you. peptides need a doctor who "
                "knows your history, and most have no safety data for teens. the other programs, like sleep, "
                "energy and training, are all open to you.")
    if decision["track"] == "urgent":
        if "self_harm" in decision.get("urgent", []):
            return ("i'm glad you told me. please reach out right now: call or text 988 (US), or call 911 if you "
                    "might act on it. you don't have to go through this alone. peptidemax can wait; "
                    "come back to it once you're safe.")
        return ("please get care now: call 911 or go to an emergency room, and tell them every peptide and "
                "medicine you take. severe belly pain, trouble breathing, swelling, chest pain or fainting can be "
                "serious with these medicines. i've paused setup; come back once you've been seen.")
    if decision["track"] == "no_consent":
        return ("no problem, i haven't saved anything. peptidemax needs those health questions to set up "
                "safely, so it stays off for now. you can read the peptides course any time, and start "
                "this again whenever you like.")
    return None


# ── the plan: decision → habits (deterministic; validate_template fits it) ──

ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
INJECTABLE = {"pen", "vial", "powder"}


def _hm_to_min(v: object, default: int) -> int:
    m = re.match(r"^(\d{1,2}):(\d{2})", str(v or ""))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else default


def _fmt(m: int) -> str:
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def _dose_time(when: Optional[str], profile: dict) -> str:
    wake = _hm_to_min(profile.get("wake_time"), 7 * 60)
    bed = _hm_to_min(profile.get("bed_time"), 23 * 60)
    meals = profile.get("meals") or {}
    if when == "evening":
        return _fmt(_hm_to_min(meals.get("dinner"), 19 * 60) + 60)
    if when == "bed":
        return _fmt((bed if bed > wake else bed + 1440) - 30)
    if when == "morning":
        return _fmt(_hm_to_min(meals.get("breakfast"), wake + 30))
    return _fmt(wake + 60)


def _dose_days(x: dict) -> Optional[list[str]]:
    """The reminder days the label's schedule gives, or None when we can't
    turn it into days (then no reminder; the plan says so)."""
    f = x["freq"]
    if f == "daily":
        return list(ALL_DAYS)
    if f == "weekly":
        return [x["day"] if x["day"] and x["day"] != "any" else "sun"]
    if f == "cycle":
        c = (x["cycle_text"] or "").lower()
        if "5 days on" in c or "weekday" in c or "5 on" in c:
            return ALL_DAYS[:5]
        if "weeks on" in c or "break" in c:
            return list(ALL_DAYS)      # every day of an "on" block; cycle tracking handles the breaks
        return None
    return None


def _steps(items: list[str]) -> str:
    return " ".join(f"{i}) {s}" for i, s in enumerate([s for s in items if s], start=1))


def _label_pending(x: dict, d: dict) -> bool:
    return d.get("confirmed") == "no_label" or "cant_check" in (x.get("label") or [])


def _as_directed(x: dict) -> bool:
    lab = x.get("label")
    return bool(lab) and "cant_check" not in lab and ("as_directed" in lab or "directions" not in lab)


def _dose_how(x: dict, d: dict) -> str:
    inj = x["form"] in INJECTABLE
    items = []
    if d.get("situation") == "starting":
        items.append("Start only on the date your prescriber gave you.")
    if _label_pending(x, d):
        items.append("Check this reminder against your pharmacy label.")
    if _as_directed(x):
        items.append("Your label doesn't spell out the schedule, so follow your prescriber's written instructions.")
    items.append("Take exactly the dose on your label. This app never sets or changes an amount.")
    if x["form"] in ("vial", "powder"):
        # FDA's 2024 alert: compounded-vial overdoses came from mL / units / mg mix-ups
        items.append("Measure in the units your label uses; mL, units and mg aren't the same thing. "
                     "Unsure? Ask the pharmacist to show you.")
    if x["slug"] == "semaglutide" and x["form"] == "pill":
        items.append("Follow the label's rules for this pill exactly: empty stomach, a little plain water, and "
                     "the wait before food, drinks or other medicines.")
    if x["slug"] == "tesamorelin":
        items.append("Egrifta WR and Egrifta SV are mixed differently and aren't interchangeable: follow the "
                     "instructions for the one on your label.")
    if inj:
        items.append("Wash your hands, wipe the site (and the vial top) with alcohol, and use a new needle.")
        items.append("Pick a different spot from last time, a couple of fingers away, and note it.")
    if x["freq"] == "cycle" and x["cycle_text"]:
        items.append(f"Your pattern: {x['cycle_text'].lower()}. Skip it on off days.")
    items.append("Missed one? Follow the missed-dose steps on your label, or ask your pharmacist.")
    return _steps(items)


def _habit(hid: str, title: str, minutes: int, days: list, how: str, why: str, *,
           time: str = "", weeks: Optional[list[int]] = None, every_weeks: Optional[int] = None) -> dict:
    h = {"habit_id": hid, "title": title, "minutes": minutes, "time": time, "weekend_time": "",
         "days": days, "how": how, "why": why}
    if weeks:
        h["weeks"] = weeks
    if every_weeks:
        h["every_weeks"] = every_weeks
    return h


def build_template(answers: dict, profile: dict, *, started_on: str, runs_fitmax: bool = False) -> dict:
    """The plan for this decision. Every habit here is deliberate, so the
    caller protects them all from the fit's trimming."""
    d = decide(answers, profile)
    peps = d["peptides"]
    habits: list[dict] = []
    flags = {f["code"]: f for f in d["flags"]}
    # what goes in the week-1 review: soft flags, plus hard ones the prescriber already knows about
    soft = [f for f in d["flags"] if f["code"] not in ("athlete", "surgery")
            and (f["severity"] in ("soft", "info") or (f["severity"] == "hard" and d.get("prescriber_aware")))]
    remind = [p for p in peps if p["verdict"] == "remind"]
    held = [p for p in peps if p["verdict"] == "hold"]
    safety = [p for p in peps if p["verdict"] == "safety_only"]

    if d["track"] == "learn_first":
        topic = {"weight": "weight", "recovery": "recovery and training", "sleep": "sleep", "skin": "skin and hair",
                 "longevity": "longevity and focus", "libido": "sexual health"}.get(d.get("interest") or "", "your goal")
        habits.append(_habit("learn_first", f"Read: peptides for {topic}", 10, ["sat"],
                             _steps([f"Open the peptides course and read the {topic} section.",
                                     "Note which ones have human trials and which are animal-only.",
                                     "Write down your questions for a clinician."]),
                             "Knowing the evidence and the FDA status first makes the clinician visit count.",
                             weeks=[1]))
        habits.append(_habit("prescriber_followup", "Talk to a clinician about your goal", 10, ["wed"],
                             _steps(["Book a visit with a licensed clinician (your doctor or a telehealth service).",
                                     "Bring your questions and your health history.",
                                     "If they prescribe something, come back and set up Peptidemax with your label."]),
                             "Whether a peptide fits you, and which one, is a prescriber's decision.",
                             weeks=[2]))
        return {"summary": summary_for(d), "habits": habits, "started_on": started_on, "peptide_profile": d}

    # dose reminders: only for verdict "remind", only where the label's schedule maps to days
    unmapped = []
    dose_days_first: Optional[list[str]] = None
    for p in remind:
        if p["freq"] == "as_needed":
            continue
        days = _dose_days(p)
        if not days:
            unmapped.append(p)
            continue
        dose_days_first = dose_days_first or days
        habits.append(_habit(f"custom_dose_{p['slug']}", f"{p['name']} dose", 2 if p["form"] in INJECTABLE else 1,
                             days, _dose_how(p, d),
                             "The same day and time every time makes missed or doubled doses less likely.",
                             time=_dose_time(p["time"], profile)))

    # what must go to a prescriber first
    flag_held = [p for p in held if p["hold_kind"] == "flag"]
    label_held = [p for p in held if p["hold_kind"] != "flag"]
    if flag_held:
        reasons = sorted({r for p in flag_held for r in p["reasons"]})
        names = " and ".join(p["name"] for p in flag_held)
        habits.append(_habit("prescriber_followup", "Talk to your prescriber before your next dose", 10, ["mon"],
                             _steps([f"Before your next {names} dose, tell your prescriber: " + "; ".join(reasons) + ".",
                                     "Ask whether it's still right for you. Don't stop or change anything on your own; that's their call.",
                                     "Then open Peptidemax and run the setup again to turn your reminders on."]),
                             "This is a known reason to stop or rethink this medicine, and only your prescriber can weigh it.",
                             weeks=[1, 2]))
    if label_held:
        reasons = sorted({r for p in label_held for r in p["reasons"]})
        names = " and ".join(p["name"] for p in label_held)
        habits.append(_habit("custom_label_fix", f"Sort out your {names} label", 5, ["mon"],
                             _steps([f"Before your next {names} dose: " + "; ".join(reasons) + ".",
                                     "Ask the pharmacy (or the clinic that gave it to you) for a proper label: your "
                                     "name, who dispensed it, a phone number, the directions and a use-by date.",
                                     "Then run the setup again with the label in hand to turn your reminders on."]),
                             "A pharmacy label with your name on it is how you know this was made and dispensed for you.",
                             weeks=[1, 2]))
    if safety:
        names = " and ".join(p["name"] for p in safety)
        why = "; ".join(sorted({r for p in safety for r in p["reasons"]}))
        tell = [f["text"].split(":")[0] for f in d["flags"]
                if f["code"] not in ("athlete", "not_compoundable", "unknown_name") and not f["code"].startswith("scope_")]
        habits.append(_habit("clinician_visit", f"See a licensed clinician about {names}", 10, ["mon"],
                             _steps([f"Book a licensed clinician (your doctor or a telehealth service) about {names}.",
                                     "Bring what you have: the vial or label, how often you take it, and how you feel."]
                                    + ([f"Tell them about: {'; '.join(tell)}."] if tell else [])
                                    + ["If they prescribe it, get it from a licensed pharmacy and set up Peptidemax again."]),
                             f"I can't set dose reminders here because {why}.", weeks=[1]))
    soft = [f for f in soft if f["code"] != "as_directed"]       # the label check covers it
    if soft and remind:
        habits.append(_habit("prescriber_review", "Review these with your prescriber", 5, ["wed"],
                             _steps(["At your next visit or message, go through:",
                                     "; ".join(f["text"] for f in soft) + ".",
                                     "Update the plan here only with what they tell you."]),
                             "None of these stop your reminders, but each one is something your prescriber should have on file.",
                             weeks=[1]))
    if unmapped:
        names = " and ".join(p["name"] for p in unmapped)
        habits.append(_habit("label_check", f"Set up your {names} schedule", 3, ["tue"],
                             _steps([f"Your label's schedule for {names} didn't fit simple days, so there's no reminder yet.",
                                     "Type it in this chat the way the label says it, for example 'every other day' or 'Mondays and Thursdays'.",
                                     "Or set the reminders in Plan by hand."]),
                             "Reminders that don't match the label do more harm than none.", weeks=[1]))
    elif remind and (any(_label_pending(p, d) for p in remind) or any(_as_directed(p) for p in remind)):
        directed = [p["name"] for p in remind if _as_directed(p)]
        habits.append(_habit("label_check", "Check your reminders against your label", 3, ["tue"],
                             _steps((["Get your pharmacy label or prescription."] if any(_label_pending(p, d) for p in remind) else [])
                                    + ([f"Your {' and '.join(directed)} label doesn't spell out how often to take "
                                        "it: ask your prescriber for the schedule in writing."] if directed else [])
                                    + ["Check each reminder's day and time against it.",
                                       "Anything different: tell me here and I'll fix it."]),
                             "The label, or your prescriber's written instructions, is what counts.", weeks=[1]))

    # tracking and safety habits
    injectables = any(p["form"] in INJECTABLE for p in peps)
    if remind or safety:
        log_days = sorted({*(dose_days_first or ["mon", "thu"])},
                          key=ALL_DAYS.index)[:3] if dose_days_first and len(dose_days_first) <= 2 else ["mon", "thu"]
        if dose_days_first and len(dose_days_first) == 1:
            nxt = ALL_DAYS[(ALL_DAYS.index(dose_days_first[0]) + 1) % 7]
            log_days = [dose_days_first[0], nxt]
        as_needed = [p["name"] for p in remind if p["freq"] == "as_needed"]
        habits.append(_habit("side_effect_log", "30-second side-effect log", 1, log_days,
                             _steps(["Rate how you feel, 1 to 5.",
                                     "Tick anything new: nausea, vomiting, constipation, site redness, headache, dizziness, low mood."]
                                    + ([f"Log each time you take {' and '.join(as_needed)}, and stay within the limits on your label."]
                                       if as_needed else [])
                                    + ["Severe belly pain, trouble breathing, a hot spreading site or fainting: get care now.",
                                       "Tell your prescriber about side effects. You can also report them to FDA MedWatch."]),
                             "A short log shows your prescriber patterns early.",
                             time=_fmt(_hm_to_min((profile.get("meals") or {}).get("dinner"), 19 * 60) + 90)))
        review = ["Doses on time this week?", "Any side effect getting worse or not settling? Flag it for your prescriber."]
        if injectables:
            review.append("Storage: in the fridge, not the door, not frozen; check open and discard dates.")
        if any(p["form"] == "powder" for p in peps):
            review.append("Mixed a new vial? Follow only the pharmacy label for liquid and volume, and write the mix date on it.")
        if any(p["freq"] == "cycle" for p in remind):
            review.append("Which phase of your cycle are you in, and when does it change?")
        habits.append(_habit("weekly_protocol_review", "Weekly protocol review", 5, ["sun"], _steps(review),
                             "Five minutes a week catches problems while they're small."))
    if injectables and (remind or safety):
        habits.append(_habit("sharps_disposal", "Sharps container check", 2, ["sat"],
                             _steps(["Keep an FDA-cleared sharps container where you inject (or a heavy plastic bottle with a screw cap).",
                                     "Seal it when it's three-quarters full.",
                                     "Check your local drop-off or mail-back rules."]),
                             "Used needles never go loose in the trash.", weeks=[1], every_weeks=4))
    if remind:
        if d.get("monitoring") == "labs":
            habits.append(_habit("bloodwork_checkin", "Book your labs", 3, ["tue"],
                                 _steps(["Book the blood draw your prescriber ordered.", "Note any fasting instructions.",
                                         "Bring the results to your next check-in."]),
                                 "Booking ahead keeps it from slipping.", every_weeks=4))
        if not held:
            ask_labs = d.get("monitoring") in ("none", "unsure")
            habits.append(_habit("prescriber_followup", "Prescriber check-in", 5, ["thu"],
                                 _steps(["Bring your side-effect log.",
                                         "Ask whether you need labs or a follow-up schedule." if ask_labs
                                         else "Ask the questions on your list.",
                                         "Update the plan here only with what they tell you."]),
                                 "Dose changes, side effects and stopping are your prescriber's calls.",
                                 weeks=[2] if ask_labs else None, every_weeks=None if ask_labs else 4))
        habits.append(_habit("refill_planning", "Plan your refill", 2, ["wed"],
                             _steps(["Count the doses or pens you have left.",
                                     "Request the refill from your prescriber and pharmacy.",
                                     "When it comes, check the new label still matches your reminders; a dose "
                                     "change means a new label.",
                                     "Never switch to another source to cover a gap."]),
                             "Running out means missed doses, and restarting after a gap may need your prescriber.",
                             weeks=[1] if d.get("supply") == "week" else None,
                             every_weeks=None if d.get("supply") == "week" else 4))
        if "athlete" in flags:
            habits.append(_habit("anti_doping_check", "Check your peptides on Global DRO", 5, ["sat"],
                                 _steps(["Look up each peptide on globaldro.com or with your federation.",
                                         "Several are banned at all times (WADA S0, S2, S4).",
                                         "Ask about a Therapeutic Use Exemption before any tested event."]),
                                 "A positive test can end a season even with a prescription.", weeks=[1]))
        if "surgery" in flags:
            habits.append(_habit("procedure_heads_up", "Tell your surgical team", 3, ["mon"],
                                 _steps(["Before your procedure, tell your surgeon and the anesthesia team every peptide you take.",
                                         "Ask your prescriber whether to pause anything beforehand; don't decide that yourself."]),
                                 "Some peptides, like GLP-1s, slow the stomach, which matters for anesthesia.", weeks=[1]))
        if any(p["slug"] == "bremelanotide" for p in remind):
            habits.append(_habit("custom_review_bremelanotide", "Bremelanotide 8-week check", 5, ["mon"],
                                 _steps(["Look back over your log: has it helped?",
                                         "Its label asks your prescriber to reassess if it hasn't after 8 weeks.",
                                         "Message or book them either way."]),
                                 "The label sets this check, not me.", weeks=[8]))
        glp1 = any(p["klass"] == GLP1 for p in remind)
        if glp1 and "eating_disorder" not in flags:
            habits.append(_habit("protein_at_meals", "Protein at each meal", 0, list(ALL_DAYS),
                                 _steps(["Eat the protein part of the meal first.", "A palm-sized portion at each meal.",
                                         "Small appetite? Smaller protein-rich snacks."]),
                                 "When appetite drops on a GLP-1, protein often drops too."))
            if not runs_fitmax:
                habits.append(_habit("resistance_training", "Strength training to keep muscle", 20, ["mon", "thu"],
                                     _steps(["Squat or sit-to-stand, push, pull, hinge.", "Add a little each week.",
                                             "Feeling faint or very low energy? Go easier and tell your prescriber."]),
                                     "Strength training is the main lever for keeping muscle while losing weight.",
                                     time=_hm_str(profile.get("workout_time"))))
            habits.append(_habit("hydration_fiber", "Water and fiber", 1, list(ALL_DAYS),
                                 _steps(["Keep water in sight and sip through the day.", "Add fiber slowly: vegetables, fruit, beans.",
                                         "Can't keep fluids down? Contact a clinician."]),
                                 "Nausea and constipation are the most common GLP-1 side effects."))
    return {"summary": summary_for(d), "habits": habits, "started_on": started_on, "peptide_profile": d}


def _hm_str(v: object) -> str:
    m = re.match(r"^(\d{1,2}):(\d{2})", str(v or ""))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""


def summary_for(d: dict) -> str:
    """What they got and why, in plain words (never a dose, never a recommendation)."""
    t = d["track"]
    if t == "learn_first":
        return ("you're only considering peptides, so there are no dose reminders: just the evidence, the FDA "
                "status, and a visit with a clinician who can tell you whether anything fits you.")
    parts = []
    on = [p["name"] for p in d["peptides"] if p["verdict"] == "remind" and p["freq"] != "as_needed"]
    if on:
        parts.append(f"reminders for {' and '.join(on)}, exactly on the schedule your label gives")
    held = [p for p in d["peptides"] if p["verdict"] == "hold" and p.get("hold_kind") == "flag"]
    if held:
        parts.append(f"no reminders for {' and '.join(p['name'] for p in held)} yet: before your next dose, tell "
                     f"your prescriber about {held[0]['reasons'][0].split(':')[0]}. this isn't me telling you to stop; "
                     "that call is theirs, and once they've weighed in, run setup again to turn reminders on")
    label_held = [p for p in d["peptides"] if p["verdict"] == "hold" and p.get("hold_kind") != "flag"]
    if label_held:
        parts.append(f"no reminders for {' and '.join(p['name'] for p in label_held)} yet, because "
                     f"{label_held[0]['reasons'][0].split(':')[0]}. sort the label out with the pharmacy, then run "
                     "setup again")
    safe = [p for p in d["peptides"] if p["verdict"] == "safety_only"]
    if safe:
        parts.append(f"no reminders for {' and '.join(p['name'] for p in safe)}, because "
                     f"{safe[0]['reasons'][0]}; you get safety steps and a clinician visit instead")
    s = "; ".join(parts) + "." if parts else "your safety steps are set."
    reg = d.get("registry") or {}
    if reg.get("status") == "found" and on:
        where = f" ({reg['where']})" if reg.get("where") else ""
        s += (f" i found {reg.get('name') or 'your pharmacy'}{where} in the national provider registry; that shows "
              "it's a registered pharmacy, not that it's licensed in your state.")
    if any(f["severity"] in ("soft", "info") for f in d["flags"]) and on:
        s += " a few things to review with your prescriber are in week 1."
    return s[:1].lower() + s[1:]


# ── the registry lookup: this module's only network call. ai_programs awaits
#    it once the quiz is done, before deciding; only the pharmacy's name and
#    state leave the server, never anything about the person. ──

NPPES_URL = "https://npiregistry.cms.hhs.gov/api/"

US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO",
    "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC", "puerto rico": "PR",
}
_STATE_CODES = set(US_STATES.values())
_GENERIC = {"the", "new", "family", "community", "custom", "health", "wellness", "best", "my", "a", "rx",
            "pharmacy", "pharmacies", "compounding", "apothecary", "drug", "drugs", "specialty", "care", "medical"}


def _parse_pharmacy(raw: str) -> tuple[str, str]:
    """'Belmar Pharmacy, CO' → ('belmar pharmacy', 'CO')."""
    t = str(raw or "").strip()
    state = ""
    low = t.lower()
    for nm, code in sorted(US_STATES.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"(?:,|\bin\b|\s)\s*{nm}\s*\.?$", low):
            state, low = code, re.sub(rf"(?:,|\bin\b)?\s*{nm}\s*\.?$", "", low)
            break
    if not state:
        m = re.search(r"(?:,|\s)\s*([A-Za-z]{2})\s*\.?$", t)
        if m and m.group(1).upper() in _STATE_CODES:
            state, low = m.group(1).upper(), low[:m.start()]
    name = re.sub(r"\b(llc|inc|corp|co|ltd|pllc|dba)\b\.?|[^a-z0-9 &'\-]", " ", low)
    return re.sub(r"\s+", " ", name).strip(), state


def _location(h: dict) -> dict:
    return next((x for x in h.get("addresses") or [] if x.get("address_purpose") == "LOCATION"), {})


def _nice(name: str) -> str:
    s = str(name or "").strip().rstrip(".,").title()
    return re.sub(r"\b(Llc|Inc|Pllc|Ltd|Lp|Rx|Usa)\b", lambda m: m.group(1).upper(), s)


def _describe(h: dict, word: str) -> dict:
    """The name people know it by (a DBA like 'Belmar Pharmacy' before the
    legal 'KEBD Enterprises, LLC') and where it dispenses from."""
    legal = str((h.get("basic") or {}).get("organization_name") or "")
    dba = [str(o.get("organization_name") or "") for o in h.get("other_names") or []]
    shown = next((n for n in dba if word and word in n.lower()), "") or legal
    loc = _location(h)
    return {"name": _nice(shown), "where": ", ".join(v for v in (str(loc.get("city") or "").title(), loc.get("state") or "") if v)}


async def check_registry(answers: dict, *, client=None) -> dict:
    """answers plus pep_registry {status: found | not_found | skipped | error,
    name, where}. Never raises: a failed lookup is 'error' and changes nothing."""
    a = dict(answers or {})
    raw = _get(a, "pep_pharmacy", "source")
    if raw is None:
        a.pop("pep_registry", None)
        return a
    name, state = _parse_pharmacy(raw)
    if not name or SKIP_OPT.lower() in str(raw).lower() or re.fullmatch(r"(skip|no|idk|not sure|n/?a)\W*", name):
        a["pep_registry"] = {"status": "skipped"}
        return a
    words = [w for w in name.split() if w not in _GENERIC and len(w) >= 3]
    word = words[0] if words else ""
    terms = [name + "*"] + ([word + "*"] if word and word + "*" != name + "*" else [])
    import httpx
    own = client is None
    http = client or httpx.AsyncClient(timeout=4.0)
    try:
        elsewhere = None
        for st in ([state, ""] if state else [""]):
            for term in terms:
                params = {"version": "2.1", "organization_name": term, "taxonomy_description": "pharmacy",
                          "enumeration_type": "NPI-2", "limit": "20"}
                if st:
                    params["state"] = st
                res = await http.get(NPPES_URL, params=params)
                res.raise_for_status()
                hits = [h for h in (res.json().get("results") or []) if (h.get("basic") or {}).get("status") == "A"]
                # NPPES's state filter matches any address on file; what counts
                # is where it dispenses from (the LOCATION address)
                here = [h for h in hits if not state or _location(h).get("state") == state]
                if here:
                    found = {"status": "found", **_describe(here[0], word)}
                    if not state:
                        found["where"] = ""     # some branch somewhere; not necessarily theirs
                    a["pep_registry"] = found
                    return a
                if hits and elsewhere is None:
                    elsewhere = hits[0]
        a["pep_registry"] = ({"status": "elsewhere", **_describe(elsewhere, word), "stated": state}
                             if elsewhere is not None else {"status": "not_found"})
    except Exception:
        a["pep_registry"] = {"status": "error"}
    finally:
        if own:
            await http.aclose()
    return a
