from app.services.fiorella_response_utils import (
    clean_user_text,
    fallback_from_tool_results,
)


def test_clean_markdown():

    result = clean_user_text(
        "Hay **18 relojes fuera de línea**"
    )

    assert result == (
        "Hay 18 relojes fuera de línea"
    )


def test_search_punches_fallback():

    response = (
        fallback_from_tool_results(
            [
                {
                    "tool": "search_punches",

                    "arguments": {
                        "query": "62627",
                        "fecha_desde": "2026-09-16",
                        "fecha_hasta": "2026-09-16",
                    },

                    "result": {
                        "ok": True,
                        "total": 3,
                    },
                }
            ]
        )
    )

    assert "3" in response
    assert "62627" in response


def test_zero_records():

    response = (
        fallback_from_tool_results(
            [
                {
                    "tool": "search_punches",

                    "arguments": {
                        "query": "62627",
                        "fecha_desde": "2026-09-16",
                        "fecha_hasta": "2026-09-16",
                    },

                    "result": {
                        "ok": True,
                        "total": 0,
                    },
                }
            ]
        )
    )

    assert (
        "No encontré"
        in response
    )