from fastapi import HTTPException
from pydantic import BaseModel, Field


class MutationFlags(BaseModel):
    """Toda escritura a reloj, ficha o SQL operativo lleva estos dos campos."""

    dry_run: bool = Field(default=True)
    confirm: bool = Field(default=False)


def assert_live(dry_run: bool, confirm: bool, action: str = "operación") -> None:
    """
    Live solo si dry_run=false Y confirm=true.
    Cualquier otra combinación se corta aquí (no en el SDK).
    """
    if dry_run:
        return
    if not confirm:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{action} live bloqueada. "
                "Envía dry_run=false y confirm=true."
            ),
        )


def preview(action: str, **payload) -> dict:
    return {
        "ok": True,
        "mode": "dry_run",
        "would": action,
        **payload,
    }