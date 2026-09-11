# backend/app/api/routes/records_inventory.py
from datetime import datetime

from fastapi import APIRouter

from app.api.routes.records_shared import DEVICES_FILE, DeviceIn, read_json, write_json

router = APIRouter()


@router.get("/inventory-devices")
def inventory_list():
    return {"items": read_json(DEVICES_FILE, [])}


@router.post("/inventory-devices")
def inventory_save(body: DeviceIn):
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
def inventory_delete(name: str):
    items = [d for d in read_json(DEVICES_FILE, []) if d.get("name") != name]
    write_json(DEVICES_FILE, items)
    return {"ok": True}