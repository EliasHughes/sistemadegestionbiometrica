from datetime import date, time

from app.services.overtime import calculate_day, classify_day_hours


def test_weekday_extra_after_8h():
    b = classify_day_hours(date(2026, 9, 7), 10, 0, False)  # lunes
    assert b["h45"] == 2
    assert b["h15"] == 0
    assert b["h100"] == 0
    assert b["h165"] == 0
    assert b["regular_hours"] == 8


def test_weekday_night_inside_jornada():
    # 14:00-00:00 = 10h, noche 18-06
    d = calculate_day(
        date(2026, 9, 7),
        time(14, 0),
        time(0, 0),
        scheduled_hours=8,
        night_start=time(18, 0),
        night_end=time(6, 0),
    )
    assert d["h15"] == 4   # 18:00-22:00 dentro de las 8h
    assert d["h45"] == 2   # 22:00-00:00 extra
    assert d["h100"] == 0


def test_saturday_after_4h():
    b = classify_day_hours(date(2026, 9, 5), 10, 0, False)  # sábado
    assert b["h100"] == 6
    assert b["regular_hours"] == 4
    assert b["h45"] == 0


def test_sunday_all_100():
    b = classify_day_hours(date(2026, 9, 6), 8, 3, False)
    assert b["h100"] == 8
    assert b["h15"] == 0
    assert b["h45"] == 0


def test_holiday_165():
    b = classify_day_hours(date(2026, 9, 7), 8, 2, True)
    assert b["h165"] == 8
    assert b["h15"] == 0
    assert b["h45"] == 0
    assert b["h100"] == 0


def test_missing_salida():
    d = calculate_day(date(2026, 9, 7), time(8, 0), None)
    assert d["worked_hours"] == 0
    assert d["note"]