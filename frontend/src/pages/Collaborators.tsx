import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

type PunchEmp = {
  codigo: string;
  nombre?: string;
  departamento?: string;
  ultimo_dispositivo?: string;
  reloj?: string;
};

type Device = { name: string; ip?: string };

type Profile = {
  codigo: string;
  nombre: string;
  departamento: string;
  cargo: string;
  activo: boolean;
  dispositivos: string[];
  notas: string;
  rfid: string;
  card_no: string;
  password_device: string;
  has_fingerprint: boolean;
  has_face: boolean;
  fingerprint_slots: number[];
  face_registered: boolean;
  privilege: number;
  schedule_id: string;
  reloj_oficina: string;
};

type ClockInfo = {
  device: string;
  found?: boolean;
  mode?: string;
  card?: number;
  finger_count?: number;
  fingers?: { fid: number; label: string }[];
  message?: string;
};

const emptyProfile = (): Profile => ({
  codigo: "",
  nombre: "",
  departamento: "",
  cargo: "",
  activo: true,
  dispositivos: [],
  notas: "",
  rfid: "",
  card_no: "",
  password_device: "",
  has_fingerprint: false,
  has_face: false,
  fingerprint_slots: [],
  face_registered: false,
  privilege: 0,
  schedule_id: "",
  reloj_oficina: "",
});

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `Error ${res.status}`);
  }
  return data;
}

export default function Collaborators() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PunchEmp[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState<Profile>(emptyProfile());
  const [clocks, setClocks] = useState<ClockInfo[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const loadList = async () => {
    const res = await authFetch(`/api/records/collaborators?q=${encodeURIComponent(q)}&limit=200`);
    const data = await jsonOrThrow(res);
    setList(data.items || []);
  };

  const loadDevices = async () => {
    const res = await authFetch("/api/records/managed-devices");
    const data = await jsonOrThrow(res);
    setDevices(data.items || []);
  };

  const loadDetail = async (codigo: string) => {
    const res = await authFetch(`/api/records/collaborator-detail?codigo=${encodeURIComponent(codigo)}`);
    const data = await jsonOrThrow(res);
    const p = data.profile || {};
    setForm({
      ...emptyProfile(),
      ...p,
      codigo: String(p.codigo || codigo),
      dispositivos: p.dispositivos || [],
      fingerprint_slots: p.fingerprint_slots || [],
      privilege: Number(p.privilege || 0),
      schedule_id: p.schedule_id || "",
      reloj_oficina: p.reloj_oficina || "",
    });
    setClocks(data.clocks || []);
  };

  useEffect(() => {
    loadList().catch((e) => setErr(e.message));
    loadDevices().catch(() => setErr("No se pudieron cargar relojes"));
  }, []);

  useEffect(() => {
    authFetch("/api/records/schedules")
      .then((r) => r.json())
      .then((d) => setSchedules(d.items || d.schedules || []))
      .catch(() => setSchedules([]));
  }, []);

  const onSearch = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErr("");
    await loadList();
    if (q.trim()) {
      try {
        await loadDetail(q.trim());
      } catch {
        /* no hay ficha */
      }
    }
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const res = await authFetch("/api/records/collaborator-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await jsonOrThrow(res);
      setForm({
        ...emptyProfile(),
        ...data,
        dispositivos: data.dispositivos || form.dispositivos,
        privilege: Number(data.privilege ?? form.privilege),
        schedule_id: data.schedule_id || form.schedule_id,
        reloj_oficina: data.reloj_oficina || form.reloj_oficina,
      });
      setMsg("Ficha guardada. Usa Sincronizar para empujar al reloj.");
      await loadList();
      if (form.codigo) await loadDetail(form.codigo);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const syncClocks = async () => {
    if (!form.codigo) {
      setErr("Indica un código");
      return;
    }
    setErr("");
    try {
      await authFetch("/api/records/collaborator-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const res = await authFetch("/api/records/collab-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: form.codigo, dispositivos: form.dispositivos }),
      });
      const data = await jsonOrThrow(res);
      const lines = (data.results || [])
        .map((r: any) => `${r.device}: ${r.mode || (r.ok ? "ok" : r.error || "error")}`)
        .join(" · ");
      setMsg(lines || "Sincronizado");
      await loadList();
      await loadDetail(form.codigo);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo sincronizar");
    }
  };

   const cloneClocks = async () => {
    if (!form.codigo || !form.reloj_oficina) {
      setErr("Elige reloj origen (oficina) y un ponchador asignado distinto");
      return;
    }
    const dest = (form.dispositivos || []).filter((n) => n && n !== form.reloj_oficina);
    if (!dest.length) {
      setErr("El ponchador asignado debe ser distinto al origen");
      return;
    }
    setErr("");
    try {
      const res = await authFetch("/api/records/collab-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: form.codigo,
          from_device: form.reloj_oficina,
          to_devices: dest,
        }),
      });
      const data = await jsonOrThrow(res);
      setMsg(
        (data.results || [])
          .map((r: any) => `${r.device}: ${r.ok ? "ok " + (r.fingers_copied ?? "") : r.error}`)
          .join(" · ")
      );
      await loadDetail(form.codigo);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo copiar");
    }
  };

  const selectRow = async (e: PunchEmp) => {
    setMsg("");
    setErr("");
    setForm({
      ...emptyProfile(),
      codigo: String(e.codigo),
      nombre: e.nombre || "",
      departamento: e.departamento || "",
      dispositivos: e.reloj || e.ultimo_dispositivo ? [String(e.reloj || e.ultimo_dispositivo)] : [],
    });
    try {
      await loadDetail(String(e.codigo));
    } catch {
      /* ficha nueva */
    }
  };

  const removeUser = async () => {
    if (!form.codigo) return;
    if (!confirm(`¿Eliminar ${form.codigo} de la app y de los relojes asignados?`)) return;
    try {
      const res = await authFetch("/api/records/collab-delete-clocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: form.codigo,
          dispositivos: form.dispositivos,
          remove_profile: true,
        }),
      });
      await jsonOrThrow(res);
      setMsg("Usuario eliminado de la app y de los relojes");
      setForm(emptyProfile());
      setClocks([]);
      await loadList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 space-y-3">
        <h2 className="text-lg font-bold">Colaboradores</h2>
        <p className="text-sm text-zinc-500">Alta, edición, baja y copia a relojes</p>
        <form onSubmit={onSearch} className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código o nombre"
            className="flex-1 text-sm border rounded-lg px-3 py-2"
          />
          <button type="submit" className="bg-red-600 text-white text-sm font-semibold px-4 rounded-lg">
            Buscar
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setForm(emptyProfile());
            setClocks([]);
            setMsg("");
            setErr("");
          }}
          className="text-xs font-semibold border rounded-lg px-3 py-2"
        >
          + Nuevo usuario
        </button>
        <div className="bg-white border rounded-2xl overflow-auto max-h-[620px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-[11px] uppercase text-zinc-500 text-left">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Reloj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((e) => (
                <tr
                  key={e.codigo}
                  className="hover:bg-zinc-50 cursor-pointer"
                  onClick={() => selectRow(e)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{e.codigo}</td>
                  <td className="px-3 py-2">{e.nombre || "—"}</td>
                  <td className="px-3 py-2 text-xs">{e.reloj || e.ultimo_dispositivo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={save} className="lg:col-span-3 bg-white border rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-sm">Ficha del usuario</h3>
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
        {err && <p className="text-xs text-rose-700">{err}</p>}

        <div className="grid sm:grid-cols-2 gap-2">
          <input
            required
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            placeholder="Código"
            className="text-sm border rounded-lg px-3 py-2"
          />
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre completo"
            className="text-sm border rounded-lg px-3 py-2"
          />
          <input
            value={form.departamento}
            onChange={(e) => setForm({ ...form, departamento: e.target.value })}
            placeholder="Departamento"
            className="text-sm border rounded-lg px-3 py-2"
          />
          <input
            value={form.cargo}
            onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            placeholder="Cargo"
            className="text-sm border rounded-lg px-3 py-2"
          />
          <input
            value={form.card_no}
            onChange={(e) => setForm({ ...form, card_no: e.target.value, rfid: e.target.value })}
            placeholder="RFID / Nº tarjeta"
            className="text-sm border rounded-lg px-3 py-2"
          />
          <input
            value={form.password_device}
            onChange={(e) => setForm({ ...form, password_device: e.target.value })}
            placeholder="Contraseña en reloj"
            className="text-sm border rounded-lg px-3 py-2"
          />
          <select
            value={form.privilege}
            onChange={(e) => setForm({ ...form, privilege: Number(e.target.value) })}
            className="text-sm border rounded-lg px-3 py-2"
          >
            <option value={0}>Usuario estándar en el reloj</option>
            <option value={14}>Administrador del reloj</option>
          </select>
          <select
            value={form.reloj_oficina}
            onChange={(e) => setForm({ ...form, reloj_oficina: e.target.value })}
            className="text-sm border rounded-lg px-3 py-2"
          >
            <option value="">Reloj de oficina (origen de huellas)</option>
            {devices
              .filter((d) => d.ip)
              .map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
          </select>
          <select
            value={form.schedule_id}
            onChange={(e) => setForm({ ...form, schedule_id: e.target.value })}
            className="text-sm border rounded-lg px-3 py-2 sm:col-span-2"
          >
            <option value="">Sin horario asignado</option>
                       {schedules.map((s) => (
               <option key={String(s.id)} value={String(s.id)}>
                {s.name || s.nombre || s.id}
              </option>
            ))}
          </select>
        </div>

        <textarea
          value={form.notas}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
          placeholder="Notas"
          className="w-full text-sm border rounded-lg px-3 py-2"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
          />
          Activo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.has_fingerprint}
            onChange={(e) => setForm({ ...form, has_fingerprint: e.target.checked })}
          />
          Tiene huella (la captura física se hace en el reloj)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.has_face || form.face_registered}
            onChange={(e) => setForm({ ...form, has_face: e.target.checked, face_registered: e.target.checked })}
          />
          Tiene rostro
        </label>

              <p className="text-[11px] uppercase text-zinc-500">Ponchador asignado (jornada)</p>
        <select
          value={form.dispositivos[0] || ""}
          onChange={(e) => {
            const v = e.target.value;
            setForm({
              ...form,
              dispositivos: v ? [v] : [],
              reloj_oficina: form.reloj_oficina || v,
            });
          }}
          className="w-full text-sm border rounded-xl px-3 py-2"
        >
          <option value="">— Elegir reloj —</option>
          {devices.filter((d) => d.ip).map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} · {d.ip}
            </option>
          ))}
        </select>

        <p className="text-[11px] uppercase text-zinc-500">Copiar huellas desde</p>
        <select
          value={form.reloj_oficina}
          onChange={(e) => setForm({ ...form, reloj_oficina: e.target.value })}
          className="w-full text-sm border rounded-xl px-3 py-2"
        >
          <option value="">Origen (oficina / donde se enroló)</option>
          {devices.filter((d) => d.ip).map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} · {d.ip}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="submit"
            disabled={saving}
            className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            Guardar ficha
          </button>
          <button type="button" onClick={syncClocks} className="border text-sm px-4 py-2 rounded-xl">
            Sincronizar a relojes marcados
          </button>
          <button type="button" onClick={cloneClocks} className="border text-sm px-4 py-2 rounded-xl">
            Copiar huellas a destinos
          </button>
          <button type="button" onClick={removeUser} className="text-sm text-rose-600">
            Eliminar (desvinculado)
          </button>
        </div>

        <div className="border-t pt-3">
          <p className="text-[11px] uppercase text-zinc-500 mb-2">Lo que hay hoy en cada reloj</p>
          {clocks.length === 0 && (
            <p className="text-xs text-zinc-400">Guarda, sincroniza y vuelve a abrir el usuario para leer el hardware.</p>
          )}
          {clocks.map((c) => (
            <div key={c.device} className="border rounded-xl px-3 py-2 mb-2 text-sm">
              <p className="font-semibold">{c.device}</p>
              <p className="text-xs text-zinc-500">
                {c.found ? "Encontrado" : "No está"} · {c.mode || ""} · tarjeta {c.card ? c.card : "no"}
              </p>
              {!!c.finger_count && (
                <p className="text-xs">
                  Huellas: {c.finger_count}
                  {c.fingers?.length ? " · " + c.fingers.map((f) => f.label).join(", ") : ""}
                </p>
              )}
              {c.message && <p className="text-xs text-zinc-400">{c.message}</p>}
            </div>
          ))}
        </div>
      </form>
    </div>
  );
}