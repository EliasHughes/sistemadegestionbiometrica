from datetime import date

from fastapi import HTTPException

from app.api.routes.exports import _resolve_date_range, _resolve_device


def test_single_day_alias():
    start, end = _resolve_date_range(fecha="2026-09-05")
    assert start == date(2026, 9, 5)
    assert end == date(2026, 9, 5)


def test_canonical_range():
    start, end = _resolve_date_range(fecha_desde="2026-09-01", fecha_hasta="2026-09-10")
    assert start == date(2026, 9, 1)
    assert end == date(2026, 9, 10)


def test_inverted_range_rejected():
    try:
        _resolve_date_range(fecha_desde="2026-09-10", fecha_hasta="2026-09-01")
        assert False, "debió fallar"
    except HTTPException as exc:
        assert exc.status_code == 422


def test_device_todos_is_none():
    assert _resolve_device(dispositivo="todos") is None
    assert _resolve_device(dispositivo="Reloj 1") == "Reloj 1"
