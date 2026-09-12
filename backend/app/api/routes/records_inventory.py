# backend/app/api/routes/records_inventory.py
from datetime import datetime

from fastapi import APIRouter,Depends

from app.api.routes.records_shared import DEVICES_FILE, DeviceIn, read_json, write_json
from app.core.deps import require_permission

router = APIRouter()

@router.get("/inventory-devices")
def inventory_list(_user: dict = Depends(require_permission("inventory.read"))):
    return {"items": read_json(DEVICES_FILE, [])}


@router.post("/inventory-devices")
def inventory_save(body: DeviceIn, _user: dict = Depends(require_permission("inventory.write"))):
    items = read_json(DEVICES_FILE, [])
    name = body.name.strip()
    entry = body.model_dump()
    entry["name"] = name
    entry["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for i, d in enumerate(items):
        if d.get("name") == name:
            items[i] = entry
            write_json(DEVICES_FILE, items)
            return entry
    entry["created"] = entry["updated"]
    items.append(entry)
    write_json(DEVICES_FILE, items)
    return entry


@router.delete("/inventory-devices/{name}")
def inventory_delete(name: str, _user: dict = Depends(require_permission("inventory.write"))):
    items = [d for d in read_json(DEVICES_FILE, []) if d.get("name") != name]
    write_json(DEVICES_FILE, items)
    return {"ok": True}