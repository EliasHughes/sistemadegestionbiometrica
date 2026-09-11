import { FormEvent, useEffect, useMemo, useState } from "react";
import { authFetch } from "../lib/api";

type ScreenMap = Record<string, boolean>;
type AppUser = {
  username: string;
  name: string;
  role: string;
  active: boolean;
  remote?: boolean;
  screens: ScreenMap;
};
type RoleRow = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  screens?: ScreenMap;
};

const SCREEN_KEYS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "records", label: "Ponches" },
  { key: "db_records", label: "Historial SQL" },
  { key: "remote_punch", label: "Ponche Remoto" },
  { key: "devices", label: "Dispositivos" },
  { key: "employees", label: "Empleados" },
  { key: "collaborators", label: "Colaboradores" },
  { key: "schedules", label: "Horarios" },
  { key: "biometric_inventory", label: "Inventario" },
  { key: "bulk_ops", label: "Operaciones masivas" },
  { key: "reports", label: "Reportes" },
  { key: "data_export", label: "Exportar" },
  { key: "advanced_reports", label: "Reportes Avanzados" },
  { key: "sync_history", label: "Historial Sync" },
  { key: "users", label: "Usuarios" },
  { key: "settings", label: "Configuración" },
];

const emptyScreens = (): ScreenMap =>
  Object.fromEntries(SCREEN_KEYS.map((s) => [s.key, false]));

const emptyForm = () => ({
  username: "",
  name: "",
  role: "Supervisor",
  password: "",
  active: true,
  remote: false,
  screens: emptyScreens(),
});

export default function UsersAdmin() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [roleId, setRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [roleColor, setRoleColor] = useState("#DC2626");
  const [roleScreens, setRoleScreens] = useState<ScreenMap>(emptyScreens());

  const load = async () => {
    setErr("");
    const [uRes, rRes] = await Promise.all([
      authFetch("/api/users"),
      authFetch("/api/records/app-roles").catch(() => null),
    ]);
    if (!uRes.ok) throw new Error("No se pudieron cargar usuarios");
    const uData = await uRes.json();
    setUsers(uData.items || []);
    if (rRes && rRes.ok) {
      const rData = await rRes.json();
      setRoles(rData.items || rData.roles || []);
    }
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, []);

  const roleNames = useMemo(() => {
    const fromRoles = roles.map((r) => r.name).filter(Boolean);
    const base = ["super_admin", "admin", "Supervisor", "Coordinador", "RRHH", "TIC", "viewer"];
    return Array.from(new Set([...fromRoles, ...base]));
  }, [roles]);

  const editUser = (u: AppUser) => {
    setEditing(true);
    setForm({
      username: u.username,
      name: u.name || u.username,
      role: u.role || "viewer",
      password: "",
      active: u.active !== false,
      remote: !!u.remote,
      screens: { ...emptyScreens(), ...(u.screens || {}) },
    });
    setOk("");
    setErr("");
  };

  const saveUser = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const res = await authFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          name: form.name.trim(),
          role: form.role,
          password: form.password,
          screens: form.screens,
          active: form.active,
          remote: form.remote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "No se pudo guardar");
      setOk("Usuario guardado. Ya puede iniciar sesión.");
      setForm(emptyForm());
      setEditing(false);
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (username: string) => {
    if (!confirm(`¿Eliminar el acceso de ${username}?`)) return;
    const res = await authFetch(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.detail || "No se pudo eliminar");
      return;
    }
    if (form.username === username) setForm(emptyForm());
    await load();
  };

  const editRole = (r: RoleRow) => {
    setRoleId(r.id);
    setRoleName(r.name);
    setRoleDesc(r.description || "");
    setRoleColor(r.color || "#DC2626");
    setRoleScreens({ ...emptyScreens(), ...(r.screens || {}) });
    setTab("roles");
  };

  const saveRole = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const res = await authFetch("/api/records/app-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: roleId,
          name: roleName,
          description: roleDesc,
          color: roleColor,
          screens: roleScreens,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "No se pudo guardar el rol");
      }
      setOk("Rol guardado");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Control de acceso</p>
          <h2 className="text-2xl font-extrabold text-zinc-900 tracking-tight">Usuarios, roles y permisos</h2>
          <p className="text-sm text-zinc-500">El campo Usuario es el que se escribe en el login. El nombre es solo etiqueta.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("users")} className={`px-3 py-1.5 rounded-full text-sm ${tab === "users" ? "bg-red-600 text-white" : "bg-white border"}`}>Usuarios</button>
          <button type="button" onClick={() => setTab("roles")} className={`px-3 py-1.5 rounded-full text-sm ${tab === "roles" ? "bg-red-600 text-white" : "bg-white border"}`}>Roles</button>
        </div>
      </div>

      {err && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-2 text-sm">{err}</div>}
      {ok && <div className="rounded-xl bg-emerald-50 text-emerald-700 px-4 py-2 text-sm">{ok}</div>}

      {tab === "users" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.username} className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-600 text-white grid place-items-center font-bold">{(u.name || u.username).slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{u.name}</p>
                  <p className="text-xs text-zinc-500">login: <b>{u.username}</b> · {u.role} · {u.active ? "activo" : "inactivo"}</p>
                </div>
                <button type="button" className="text-red-600 text-sm" onClick={() => editUser(u)}>Editar</button>
                <button type="button" className="text-zinc-400 text-sm" onClick={() => removeUser(u.username)}>Eliminar</button>
              </div>
            ))}
          </div>

          <form onSubmit={saveUser} className="glass-card rounded-2xl p-5 space-y-3">
            <p className="font-semibold">Nuevo / editar usuario</p>
            <label className="block text-xs uppercase text-zinc-500">Usuario de acceso (login)</label>
            <input className="w-full border rounded-xl px-3 py-2" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required autoComplete="off" disabled={editing} />
            <label className="block text-xs uppercase text-zinc-500">Nombre completo</label>
            <input className="w-full border rounded-xl px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label className="block text-xs uppercase text-zinc-500">Rol</label>
            <select className="w-full border rounded-xl px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <label className="block text-xs uppercase text-zinc-500">Contraseña {editing ? "(vacío = no cambiar)" : ""}</label>
            <input className="w-full border rounded-xl px-3 py-2" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required={!editing} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activo</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.remote} onChange={(e) => setForm({ ...form, remote: e.target.checked })} /> Ponche remoto</label>
            <p className="text-xs uppercase text-zinc-500 pt-2">Pantallas</p>
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto">
              {SCREEN_KEYS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.screens[s.key]}
                    onChange={(e) => setForm({ ...form, screens: { ...form.screens, [s.key]: e.target.checked } })}
                  />
                  {s.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 bg-red-600 text-white rounded-xl py-2">{saving ? "Guardando…" : "Guardar usuario"}</button>
              <button type="button" className="px-3 border rounded-xl" onClick={() => { setForm(emptyForm()); setEditing(false); }}>Nuevo</button>
            </div>
          </form>
        </div>
      )}

      {tab === "roles" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.id} className="glass-card rounded-2xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-zinc-500">{r.description}</p>
                </div>
                <button type="button" className="text-red-600 text-sm" onClick={() => editRole(r)}>Editar</button>
              </div>
            ))}
          </div>
          <form onSubmit={saveRole} className="glass-card rounded-2xl p-5 space-y-3">
            <p className="font-semibold">Nuevo / editar rol</p>
            <input className="w-full border rounded-xl px-3 py-2" placeholder="Nombre" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
            <input className="w-full border rounded-xl px-3 py-2" placeholder="Descripción" value={roleDesc} onChange={(e) => setRoleDesc(e.target.value)} />
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto">
              {SCREEN_KEYS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!roleScreens[s.key]} onChange={(e) => setRoleScreens({ ...roleScreens, [s.key]: e.target.checked })} />
                  {s.label}
                </label>
              ))}
            </div>
            <button type="submit" disabled={saving} className="w-full bg-red-600 text-white rounded-xl py-2">Guardar rol</button>
          </form>
        </div>
      )}
    </div>
  );
}