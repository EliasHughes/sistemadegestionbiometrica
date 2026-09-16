# backend/app/services/fiorella_tool_parser.py
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ParsedToolCall:
    name: str
    arguments: dict[str, Any]


_TOOL_BLOCK_RE = re.compile(
    r"<tool_call>\s*(.*?)\s*</tool_call>",
    re.IGNORECASE | re.DOTALL,
)

_ARG_RE = re.compile(
    r"<arg_key>\s*(.*?)\s*</arg_key>\s*"
    r"<arg_value>\s*(.*?)\s*</arg_value>",
    re.IGNORECASE | re.DOTALL,
)

_FUNCTION_NAME_RE = re.compile(
    r"(?:<function>|<tool_name>|<name>)\s*"
    r"([a-zA-Z_][a-zA-Z0-9_]*)\s*"
    r"(?:</function>|</tool_name>|</name>)",
    re.IGNORECASE,
)


def _convert_value(value: str) -> Any:
    value = value.strip()

    if not value:
        return ""

    lower = value.lower()

    if lower == "true":
        return True

    if lower == "false":
        return False

    if lower in {"null", "none"}:
        return None

    try:
        return json.loads(value)
    except Exception:
        pass

    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value


def _tool_name(body: str) -> str:
    tagged = _FUNCTION_NAME_RE.search(body)

    if tagged:
        return tagged.group(1).strip()

    first_tag = body.find("<")

    if first_tag == -1:
        candidate = body.strip()
    else:
        candidate = body[:first_tag].strip()

    candidate = candidate.splitlines()[0].strip() if candidate else ""

    if re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", candidate):
        return candidate

    return ""


def parse_text_tool_calls(
    content: str | None,
) -> list[ParsedToolCall]:
    """
    Fallback para modelos que imprimen tool calls como XML/texto.
    No sustituye el function calling nativo; solo evita que ese
    formato llegue al frontend.
    """

    if not content:
        return []

    parsed: list[ParsedToolCall] = []

    for match in _TOOL_BLOCK_RE.finditer(content):
        body = match.group(1).strip()
        name = _tool_name(body)

        if not name:
            continue

        arguments: dict[str, Any] = {}

        for key, value in _ARG_RE.findall(body):
            clean_key = key.strip()

            if clean_key:
                arguments[clean_key] = _convert_value(value)

        parsed.append(
            ParsedToolCall(
                name=name,
                arguments=arguments,
            )
        )

    return parsed


def parse_text_tool_call(
    content: str | None,
) -> ParsedToolCall | None:
    calls = parse_text_tool_calls(content)
    return calls[0] if calls else None


def contains_text_tool_call(
    content: str | None,
) -> bool:
    return bool(content and _TOOL_BLOCK_RE.search(content))


def strip_text_tool_calls(
    content: str | None,
) -> str:
    if not content:
        return ""

    return _TOOL_BLOCK_RE.sub(
        "",
        content,
    ).strip()
