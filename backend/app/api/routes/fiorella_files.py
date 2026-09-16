from __future__ import annotations

import os
from pathlib import Path

from fastapi import (
    APIRouter,
    HTTPException,
)

from fastapi.responses import (
    FileResponse,
)


router = APIRouter(
    prefix="/api/v1/fiorella/files",
    tags=["Fiorella Files"],
)


EXPORT_DIR = Path(
    os.getenv(
        "FIORELLA_EXPORT_DIR",
        "data/fiorella_exports",
    )
).resolve()


@router.get(
    "/{filename}",
)
async def download_fiorella_file(
    filename: str,
):

    safe_name = Path(
        filename
    ).name

    filepath = (
        EXPORT_DIR
        / safe_name
    ).resolve()

    if (
        EXPORT_DIR
        not in filepath.parents
    ):
        raise HTTPException(
            status_code=400,
            detail="Archivo inválido.",
        )

    if not filepath.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "Archivo no encontrado."
            ),
        )

    return FileResponse(
        path=str(
            filepath
        ),

        filename=safe_name,

        media_type=(
            "application/"
            "vnd.openxmlformats-"
            "officedocument."
            "spreadsheetml.sheet"
        ),
    )