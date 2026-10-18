"""Peptidemax details never leave the app for a lock screen, an SMS thread
or a (possibly shared) calendar (services/outbound_privacy.py)."""
from __future__ import annotations

import services.outbound_privacy as O
from services import gcal_mirror, notification_signals


def test_peptide_names_brands_and_nicknames_are_caught_and_normal_copy_isnt():
    for s in ("Semaglutide dose", "time for your ozempic", "your tirz shot", "bpc-157 tonight",
              "ipamorelin before bed", "Peptidemax check", "Sharps container check", "hgh frag"):
        assert O.mentions_health_detail(s), s
    for s in ("Sleep wind-down", "magnesium with dinner", "morning, chad. sunlight first.", "keep the streak alive"):
        assert not O.mentions_health_detail(s), s


def test_every_peptidemax_task_goes_out_under_a_neutral_title():
    assert O.task_title({"maxx_id": "peptidemax", "title": "Weekly protocol review"}) == O.PRIVATE_TITLE
    assert O.task_title({"catalog_id": "peptidemax.side_effect_log", "title": "30-second log"}) == O.PRIVATE_TITLE
    assert O.task_title({"provenance": {"program_id": "peptidemax"}, "title": "Plan your refill"}) == O.PRIVATE_TITLE
    assert O.task_title({"maxx_id": "sleepmax", "title": "Wind down"}) == "Wind down"


def test_push_tasks_are_neutral_but_keep_their_keys():
    raw = [{"maxx_id": "peptidemax", "title": "Semaglutide dose", "time": "07:10", "catalog_id": "peptidemax.custom_dose_semaglutide"},
           {"maxx_id": "sleepmax", "title": "Wind down", "time": "22:00"}]
    tasks = notification_signals.engine_tasks(raw, 7 * 60, 23 * 60)
    by = {t.maxx: t for t in tasks}
    assert by["peptidemax"].title == O.PRIVATE_TITLE and "semaglutide" in by["peptidemax"].key
    assert by["sleepmax"].title == "Wind down"


def test_calendar_mirror_never_writes_a_peptide_name():
    view = [{"date": "2026-10-19", "tasks": [
        {"maxx_id": "peptidemax", "catalog_id": "peptidemax.custom_dose_semaglutide", "title": "Semaglutide dose",
         "time": "07:10", "duration_min": 2, "status": "completed"},
        {"maxx_id": "sleepmax", "catalog_id": "sleepmax.wind_down", "title": "Wind down", "time": "22:00", "duration_min": 10}]}]
    titles = sorted(e.title for e in gcal_mirror.build_desired(view, "00000000-0000-0000-0000-000000000001", "America/New_York").values())
    assert "Wind down" in titles and not any("emaglutide" in t for t in titles)
    assert any(t.endswith(O.PRIVATE_TITLE) for t in titles)


def test_push_and_sms_text_naming_a_peptide_is_replaced():
    t, b, c = O.scrub_alert("Semaglutide dose", "semaglutide dose is up, chad.",
                            {"params": {"title": "Semaglutide dose", "maxx": "peptidemax"}})
    assert (t, b) == ("Superpower", O.PRIVATE_BODY) and c["params"]["title"] == O.PRIVATE_TITLE
    assert O.scrub_alert("morning, chad.", "sunlight first.", None)[:2] == ("morning, chad.", "sunlight first.")
    assert O.scrub_sms("don't forget your ozempic tonight") == O.PRIVATE_BODY
    assert O.scrub_sms("lights out by 11 tonight") == "lights out by 11 tonight"
