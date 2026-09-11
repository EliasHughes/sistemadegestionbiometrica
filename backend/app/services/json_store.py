from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

_lock = threading.Lock()
DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def data_path(*parts: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR.joinpath(*parts)


def read_json(path: Path, default: Any) -> Any:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        write_json(path, default)
        return default
    try:
        with _lock:
            data = json.loads(path.read_text(encoding="utf-8"))
        return data if data is not None else default
    except Exception:
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    with _lock:
        tmp.write_text(payload, encoding="utf-8")
        tmp.replace(path)