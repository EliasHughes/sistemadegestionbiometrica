import { useEffect, useMemo, useState } from "react";
import {
  Search,
  UserPlus,
  Save,
  RefreshCw,
  Copy,
  Trash2,
  Fingerprint,
  Watch,
  Shield,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  X,
} from "lucide-react";
import { authFetch } from "../lib/api";

type PunchEmp = {
  codigo: string;
  nombre?: string;
  departamento?: string;
  ultimo_dispositivo?: string;
  reloj?: string;
};

type Device = { name: string; ip?: string; online?: boolean };

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
  card?: number | string;
  finger_count?: number;
  fingers?: { fid: number; label: string }[];
  message?: string;
};

type ConfirmState = {
  title: string;
  detail: string;
  run: () => Promise<void>;
} | null;

function emptyProfile(): Profile {
  return {
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
  };
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new Error(typeof detail === "string" ? detail : `Error ${res.status}`);
  }
  return data as Record<string, unknown>;
}

function Btn({
  children,
  tone = "neutral",
  type = "button",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  tone?: "primary" | "neutral" | "ghost" | "danger";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const tones: Record<string, string> = {
    primary:
      "bg-[#c8102e] text-white shadow-[0_10px_24px_-12px_rgba(200,16,46,.8)] hover:shadow-[0_14px_28px_-12px_rgba(200,16,46,.9)]",
    neutral: "bg-zinc-900 text-white hover:bg-zinc-800",
    ghost: "bg-white border border-zinc-200 text-zinc-700 hover:border-[#c8102e]/40 hover:text-[#c8102e]",
    danger: "bg-white border border-rose-200 text-rose-600 hover:bg-rose-50",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn-modern inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50 disabled:pointer-events-none ${tones[tone]}`}
    >
      <span className="shine" />
      {children}
    </button>
  );
}

export default function Collaborators() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PunchEmp[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState<Profile>(emptyProfile());
  const [clocks, setClocks] = useState<ClockInfo[]>([]);
  const [schedules, setSchedules] = useState<{ id?: string; name?: string; nombre?: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const selected = form.codigo;

  const loadList = async () => {
    const res = await authFetch(`/api/records/collaborators?q=${encodeURIComponent(q)}&limit=200`);
    const data = await jsonOrThrow(res);
    setList((data.items as PunchEmp[]) || []);
  };

  const loadDevices = async () => {
    const res = await authFetch("/api/records/managed-devices");
    const data = await jsonOrThrow(res);
    setDevices((data.items as Device[]) || []);
  };

  const loadSchedules = async () => {
    try {
      const res = await authFetch("/api/records/schedules");
      const data = await jsonOrThrow(res);
      setSchedules((data.items as typeof schedules) || []);
    } catch {
      setSchedules([]);
    }
  };

  const loadDetail = async (codigo: string) => {
    const res = await authFetch(`/api/records/collaborator-detail?codigo=${encodeURIComponent(codigo)}`);
    const data = await jsonOrThrow(res);
    const p = (data.profile || {}) as Partial<Profile>;
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
    setClocks((data.clocks as ClockInfo[]) || []);
  };

  useEffect(() => {
    loadList().catch(() => setErr("No se pudo cargar la lista"));
    loadDevices().catch(() => undefined);
    loadSchedules().catch(() => undefined);
  }, []);

  const onSearch = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErr("");
    await loadList();
    if (q.trim()) {
      try {
        await loadDetail(q.trim());
      } catch {
        /* sin ficha */
      }
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

  const reset = () => {
    setForm(emptyProfile());
    setClocks([]);
    setMsg("");
    setErr("");
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
      const data = (await jsonOrThrow(res)) as Profile;
      setForm({
        ...emptyProfile(),
        ...data,
        dispositivos: data.dispositivos || form.dispositivos,
        privilege: Number(data.privilege ?? form.privilege),
        schedule_id: data.schedule_id || form.schedule_id,
        reloj_oficina: data.reloj_oficina || form.reloj_oficina,
      });
      setMsg("Ficha guardada. Sincroniza para empujar al reloj.");
      await loadList();
      if (form.codigo) await loadDetail(form.codigo);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const runZk = async (
    label: string,
    path: string,
    payload: Record<string, unknown>
  ) => {
    setBusy(label);
    setErr("");
    try {
      const previewRes = await authFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, dry_run: true, confirm: false }),
      });
      const preview = await jsonOrThrow(previewRes);
      const would = String(preview.would || label);
      const extra = JSON.stringify(preview.targets || preview.to_devices || payload, null, 0);
      setConfirm({
        title: `Confirmar ${would}`,
        detail: extra.slice(0, 280),
        run: async () => {
          const liveRes = await authFetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, dry_run: false, confirm: true }),
          });
          const data = await jsonOrThrow(liveRes);
          const lines = ((data.results as { device?: string; ok?: boolean; error?: string; mode?: string }[]) || [])
            .map((r) => `${r.device}: ${r.mode || (r.ok ? "ok" : r.error || "error")}`)
            .join(" · ");
          setMsg(lines || `${label} listo`);
          if (form.codigo) await loadDetail(form.codigo);
          await loadList();
        },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : `No se pudo ${label}`);
    } finally {
      setBusy("");
    }
  };

  const syncClocks = async () => {
    if (!form.codigo) return setErr("Indica un código");
    await authFetch("/api/records/collaborator-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => undefined);
    await runZk("sincronizar", "/api/records/collab-push", {
      codigo: form.codigo,
      dispositivos: form.dispositivos,
    });
  };

  const cloneClocks = async () => {
    if (!form.codigo || !form.reloj_oficina) {
      setErr("Elige reloj origen y un destino distinto");
      return;
    }
    const dest = (form.dispositivos || []).filter((n) => n && n !== form.reloj_oficina);
    if (!dest.length) {
      setErr("Marca al menos un ponchador distinto al origen");
      return;
    }
    await runZk("copiar huellas", "/api/records/collab-clone", {
      codigo: form.codigo,
      from_device: form.reloj_oficina,
      to_devices: dest,
    });
  };

  const removeUser = async () => {
    if (!form.codigo) return;
    await runZk("eliminar", "/api/records/collab-delete-clocks", {
      codigo: form.codigo,
      dispositivos: form.dispositivos,
      remove_profile: true,
    });
  };

  const confirmLive = async () => {
    if (!confirm) return;
    const job = confirm.run;
    setConfirm(null);
    setBusy("live");
    try {
      await job();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Operación live falló");
    } finally {
      setBusy("");
    }
  };

  const onlineDevices = useMemo(() => devices.filter((d) => d.ip), [devices]);

  return (
    <div className="page-enter space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#c8102e] font-semibold">Personas</p>
          <h2 className="text-2xl font-bold tracking-tight">Colaboradores</h2>
          <p className="text-sm text-zinc-500">Ficha, huellas y presencia en relojes · dry-run antes de escribir</p>
        </div>
        <Btn tone="ghost" onClick={reset}>
          <UserPlus size={16} /> Nuevo
        </Btn>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <aside className="lg:col-span-2 space-y-3">
          <form onSubmit={onSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Código o nombre"
                className="w-full text-sm border border-zinc-200 rounded-xl pl-9 pr-3 py-2.5 bg-white/90 focus:outline-none focus:ring-2 focus:ring-[#c8102e]/30"
              />
            </div>
            <Btn type="submit" tone="primary">
              Buscar
            </Btn>
          </form>

          <div className="glass-card rounded-2xl overflow-hidden max-h-[640px] overflow-y-auto">
            {list.length === 0 ? (
              <p className="p-6 text-sm text-zinc-400">Sin resultados</p>
            ) : (
              list.map((e, i) => {
                const active = String(e.codigo) === selected;
                return (
                  <button
                    key={e.codigo}
                    type="button"
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    onClick={() => selectRow(e)}
                    className={`row-pop w-full text-left px-4 py-3 border-b border-zinc-100 transition-all duration-200 ${
                      active ? "bg-[#c8102e]/8 border-l-2 border-l-[#c8102e]" : "hover:bg-zinc-50 hover:translate-x-0.5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-9 rounded-full bg-zinc-900 text-white text-xs font-bold grid place-items-center">
                        {(e.nombre || e.codigo).slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{e.nombre || "Sin nombre"}</span>
                        <span className="block text-[11px] text-zinc-500 truncate">
                          {e.codigo} · {e.reloj || e.ultimo_dispositivo || "sin reloj"}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <form onSubmit={save} className="lg:col-span-3 glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">{form.nombre || "Ficha del usuario"}</h3>
              <p className="text-xs text-zinc-500">{form.codigo || "Nuevo registro"}</p>
            </div>
            <span
              className={`toggle-pill text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                form.activo ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {form.activo ? "Activo" : "Inactivo"}
            </span>
          </div>

          {msg && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 flex gap-2">
              <CheckCircle2 size={14} /> {msg}
            </p>
          )}
          {err && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 flex gap-2">
              <AlertTriangle size={14} /> {err}
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-2.5">
            <input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Código" className="text-sm border rounded-xl px-3 py-2.5" />
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre completo" className="text-sm border rounded-xl px-3 py-2.5" />
            <input value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} placeholder="Departamento" className="text-sm border rounded-xl px-3 py-2.5" />
            <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Cargo" className="text-sm border rounded-xl px-3 py-2.5" />
            <input value={form.card_no} onChange={(e) => setForm({ ...form, card_no: e.target.value, rfid: e.target.value })} placeholder="RFID / Nº tarjeta" className="text-sm border rounded-xl px-3 py-2.5" />
            <input value={form.password_device} onChange={(e) => setForm({ ...form, password_device: e.target.value })} placeholder="Contraseña en reloj" className="text-sm border rounded-xl px-3 py-2.5" />
            <select value={form.privilege} onChange={(e) => setForm({ ...form, privilege: Number(e.target.value) })} className="text-sm border rounded-xl px-3 py-2.5">
              <option value={0}>Usuario estándar en el reloj</option>
              <option value={14}>Administrador del reloj</option>
            </select>
            <select value={form.reloj_oficina} onChange={(e) => setForm({ ...form, reloj_oficina: e.target.value })} className="text-sm border rounded-xl px-3 py-2.5">
              <option value="">Reloj origen (huellas)</option>
              {onlineDevices.map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>
            <select value={form.schedule_id} onChange={(e) => setForm({ ...form, schedule_id: e.target.value })} className="text-sm border rounded-xl px-3 py-2.5 sm:col-span-2">
              <option value="">Sin horario asignado</option>
              {schedules.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>{s.name || s.nombre || s.id}</option>
              ))}
            </select>
          </div>

          <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas internas" className="w-full text-sm border rounded-xl px-3 py-2.5 min-h-[72px]" />

          <div className="flex flex-wrap gap-3 text-sm">
            {[
              ["activo", form.activo, (v: boolean) => setForm({ ...form, activo: v }), "Activo"],
              ["fp", form.has_fingerprint, (v: boolean) => setForm({ ...form, has_fingerprint: v }), "Huella"],
              ["face", form.has_face || form.face_registered, (v: boolean) => setForm({ ...form, has_face: v, face_registered: v }), "Rostro"],
            ].map(([key, on, set, label]) => (
              <label key={String(key)} className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={Boolean(on)} onChange={(e) => (set as (v: boolean) => void)(e.target.checked)} className="accent-[#c8102e]" />
                {String(label)}
              </label>
            ))}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-zinc-400 font-semibold mb-2">Ponchadores asignados</p>
            <div className="flex flex-wrap gap-2">
              {onlineDevices.map((d) => {
                const on = form.dispositivos.includes(d.name);
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        dispositivos: on
                          ? form.dispositivos.filter((n) => n !== d.name)
                          : [...form.dispositivos, d.name],
                      })
                    }
                    className={`btn-modern text-xs rounded-full px-3 py-1.5 border ${
                      on ? "bg-[#c8102e] text-white border-[#c8102e]" : "bg-white text-zinc-600 border-zinc-200 hover:border-[#c8102e]/40"
                    }`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Btn type="submit" tone="primary" disabled={saving}>
              <Save size={16} /> {saving ? "Guardando…" : "Guardar ficha"}
            </Btn>
            <Btn tone="neutral" onClick={syncClocks} disabled={!!busy}>
              <RefreshCw size={16} className={busy === "sincronizar" ? "animate-spin" : ""} /> Sincronizar
            </Btn>
            <Btn tone="ghost" onClick={cloneClocks} disabled={!!busy}>
              <Copy size={16} /> Copiar huellas
            </Btn>
            <Btn tone="danger" onClick={removeUser} disabled={!!busy}>
              <Trash2 size={16} /> Eliminar
            </Btn>
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            {clocks.map((c) => {
              const live = c.mode === "live" && c.found;
              return (
                <div key={c.device} className="rounded-xl border border-zinc-100 p-3 bg-white/70">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {live ? <Fingerprint size={16} className="text-emerald-600" /> : c.mode === "live" ? <Watch size={16} /> : <WifiOff size={16} className="text-zinc-400" />}
                    <span className="truncate">{c.device}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    {live
                      ? `En reloj · tarjeta ${c.card || "—"} · ${c.finger_count || 0} huellas`
                      : c.message || c.mode || "Sin dato"}
                  </p>
                </div>
              );
            })}
          </div>
        </form>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 backdrop-blur-[2px]">
          <div className="w-[min(92vw,420px)] rounded-2xl bg-white p-5 shadow-2xl page-enter">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 font-bold">
                <Shield size={18} className="text-[#c8102e]" />
                {confirm.title}
              </div>
              <button type="button" onClick={() => setConfirm(null)} className="text-zinc-400 hover:text-zinc-700">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-3 break-all">{confirm.detail}</p>
            <p className="text-xs text-zinc-600 mt-2">Esto escribirá en el reloj. El preview ya se hizo sin cambios.</p>
            <div className="flex justify-end gap-2 mt-4">
              <Btn tone="ghost" onClick={() => setConfirm(null)}>Cancelar</Btn>
              <Btn tone="primary" onClick={confirmLive}>Confirmar live</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}