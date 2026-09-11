# backend/desktop.py
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import traceback
from pathlib import Path


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


def _root_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


CURRENT_DIR = str(_base_dir())
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)
os.chdir(CURRENT_DIR)

from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.main import app  # noqa: E402

HOST = os.environ.get("PONCHES_DESKTOP_HOST", "127.0.0.1")
PORT = int(os.environ.get("PONCHES_DESKTOP_PORT", "8090"))


def _frontend_dist() -> Path | None:
    candidates = [
        _root_dir() / "frontend" / "dist",
        _base_dir().parent / "frontend" / "dist",
        _base_dir() / "frontend" / "dist",
        Path(getattr(sys, "_MEIPASS", _base_dir())) / "frontend" / "dist",
    ]
    for path in candidates:
        if (path / "index.html").exists():
            print(f"UI encontrada: {path}")
            return path
    print("NO se encontró frontend/dist/index.html")
    for path in candidates:
        print("  -", path, "existe" if path.exists() else "no existe")
    return None


def _drop_get_root() -> None:
    kept = []
    for route in app.router.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", None) or set()
        if path == "/" and "GET" in methods:
            continue
        kept.append(route)
    app.router.routes[:] = kept


def _mount_frontend() -> Path | None:
    dist = _frontend_dist()
    if dist is None:
        return None

    _drop_get_root()

    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="fe-assets")

    index = dist / "index.html"

    @app.get("/", include_in_schema=False)
    def spa_root():
        return FileResponse(index)

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith("api") or full_path in {"docs", "redoc", "openapi.json"}:
            raise HTTPException(status_code=404)
        candidate = (dist / full_path).resolve()
        if str(candidate).startswith(str(dist.resolve())) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)

    return dist


def _port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex((host, port)) == 0


def start_backend() -> None:
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning", access_log=False)


def _wait_ready(timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _port_open(HOST, PORT):
            return True
        time.sleep(0.2)
    return False


def main() -> int:
    try:
        import webview
    except ImportError:
        print("pip install pywebview")
        return 1

    dist = _mount_frontend()
    if dist is None:
        print("Haz primero: cd frontend && npm run build")
        return 4

    if _port_open(HOST, PORT):
        print(f"Puerto {PORT} ocupado. Cierra la otra ventana o cambia PONCHES_DESKTOP_PORT.")
        return 5

    threading.Thread(target=start_backend, daemon=True, name="poche-api").start()
    if not _wait_ready():
        print("El backend de escritorio no arrancó en :8090")
        return 2

    webview.create_window(
        title="Visualizador de Ponches - César Iglesias",
        url=f"http://{HOST}:{PORT}/",
        width=1280,
        height=800,
        min_size=(1024, 600),
    )
    webview.start(private_mode=False)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise SystemExit(3)