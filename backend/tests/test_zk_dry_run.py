from app.services.zk_devices import delete_user_on_device, set_user_on_device


def test_set_user_dry_run_does_not_need_device():
    out = set_user_on_device(
        {"name": "Reloj 1", "ip": "10.0.0.9"},
        {"codigo": "62627", "nombre": "Prueba"},
        dry_run=True,
    )
    assert out["mode"] == "dry_run"
    assert out["would"] == "set_user"
    assert out["codigo"] == "62627"


def test_delete_user_dry_run():
    out = delete_user_on_device({"name": "Reloj 1", "ip": "10.0.0.9"}, "62627", dry_run=True)
    assert out["mode"] == "dry_run"
    assert out["would"] == "delete_user"