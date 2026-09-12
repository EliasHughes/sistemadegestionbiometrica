from app.core.permissions import has_permission, resolve_operations


def test_super_admin_has_every_operation():
    user = {"role": "super_admin", "permissions": {"screens": {}}}
    assert has_permission(user, "roles.write")
    assert has_permission(user, "zk.delete")
    assert has_permission(user, "bulk.execute")


def test_consulta_cannot_write_roles_or_zk():
    user = {"role": "consulta"}
    assert has_permission(user, "attendance.read")
    assert not has_permission(user, "roles.write")
    assert not has_permission(user, "zk.clone")
    assert not has_permission(user, "zk.delete")


def test_rrhh_can_write_schedules_but_not_delete_device_user():
    user = {"role": "rrhh"}
    assert has_permission(user, "schedules.write")
    assert has_permission(user, "collaborators.write")
    assert not has_permission(user, "zk.delete")
    assert not has_permission(user, "devices.delete")


def test_ti_can_operate_zk_but_not_roles():
    user = {"role": "ti"}
    assert has_permission(user, "zk.clone", "zk.enroll")
    assert has_permission(user, "inventory.write")
    assert not has_permission(user, "roles.write")
    assert not has_permission(user, "payroll.run")


def test_user_operations_override_role():
    user = {
        "role": "consulta",
        "permissions": {"operations": ["attendance.read", "reports.export"]},
    }
    assert resolve_operations(user) == ["attendance.read", "reports.export"]
    assert has_permission(user, "reports.export")
    assert not has_permission(user, "zk.read")


def test_unknown_operations_are_ignored():
    user = {
        "role": "consulta",
        "permissions": {"operations": ["attendance.read", "drop_database", "zk.delete"]},
    }
    ops = resolve_operations(user)
    assert "drop_database" not in ops
    assert "zk.delete" in ops