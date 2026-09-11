// frontend/src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

type Settings = {
  night_start: string;
  scheduled_hours: number;
  rate_extra: number;
  rate_night: number;
  rate_sunday: number;
  rate_saturday_after4: number;
  rate_holiday: number;
  saturday_free_hours: number;
  sync_on_search: boolean;
  remote_punch_enabled: boolean;
  company_name: string;
  production_host: string;
};

function fromApi(raw: any): Settings {
  return {
    company_name: raw.company_name || "",
    production_host: raw.prod_host || raw.production_host || "",
    night_start: raw.night_start || "22:00",
    scheduled_hours: Number(raw.jornada_hours ?? raw.scheduled_hours ?? 8),
    rate_extra: Number(raw.extra_factor ?? raw.rate_extra ?? 0.45),
    rate_night: Number(raw.night_factor ?? raw.rate_night ?? 0.15),
    rate_sunday: Number(raw.sunday_factor ?? raw.rate_sunday ?? 1),
    rate_saturday_after4: Number(
      raw.saturday_premium_factor ?? raw.rate_saturday_after4 ?? 0
    ),
    rate_holiday: Number(raw.holiday_factor ?? raw.rate_holiday ?? 1),
    saturday_free_hours: Number(
      raw.saturday_base_hours ?? raw.saturday_free_hours ?? 0
    ),
    sync_on_search: Boolean(raw.log_sync_on_filter ?? raw.sync_on_search),
    remote_punch_enabled: Boolean(raw.remote_punch_enabled),
  };
}

function toApi(form: Settings) {
  return {
    company_name: form.company_name,
    prod_host: form.production_host,
    night_start: form.night_start,
    jornada_hours: form.scheduled_hours,
    extra_factor: form.rate_extra,
    night_factor: form.rate_night,
    sunday_factor: form.rate_sunday,
    saturday_premium_factor: form.rate_saturday_after4,
    holiday_factor: form.rate_holiday,
    saturday_base_hours: form.saturday_free_hours,
    log_sync_on_filter: form.sync_on_search,
    remote_punch_enabled: form.remote_punch_enabled,
  };
}

export default function Settings() {
  const [form, setForm] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authFetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(
            typeof d.detail === "string" ? d.detail : "No se pudo cargar configuración"
          );
        }
        return r.json();
      })
      .then((raw) => setForm(fromApi(raw)))
      .catch((e) =>
        setErr(e instanceof Error ? e.message : "No se pudo cargar configuración")
      );
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const res = await authFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApi(form)),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          typeof d.detail === "string" ? d.detail : "Error al guardar"
        );
      }
      const data = await res.json();
      setForm(fromApi(data.settings || data));
      setMsg("Configuración guardada");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-zinc-900">Configuración</h2>
        {err ? (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            {err}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Cargando configuración...</p>
        )}
      </div>
    );
  }

  const num = (key: keyof Settings, label: string, step = 0.01) => (
    <div>
      <label className="text-[11px] font-semibold text-zinc-500 uppercase">{label}</label>
      <input
        type="number"
        step={step}
        value={Number(form[key])}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
        className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 mt-1"
      />
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-zinc-900">Configuración</h2>
        <p className="text-sm text-zinc-500">
          Parámetros de la consola (admin). No altera el esquema de BioTimeDB.
        </p>
      </div>

      {msg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {err}
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold">Empresa / entorno</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 uppercase">Nombre</label>
            <input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 uppercase">
              Host producción
            </label>
            <input
              value={form.production_host}
              onChange={(e) => setForm({ ...form, production_host: e.target.value })}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 mt-1"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold">Horas extras / nocturnas</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 uppercase">
              Inicio nocturna
            </label>
            <input
              type="time"
              value={form.night_start}
              onChange={(e) => setForm({ ...form, night_start: e.target.value })}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 mt-1"
            />
          </div>
          {num("scheduled_hours", "Jornada (h)", 0.5)}
          {num("rate_extra", "Extra (factor, 0.45 = +45%)")}
          {num("rate_night", "Nocturna (factor)")}
          {num("rate_sunday", "Domingo (factor)")}
          {num("rate_saturday_after4", "Sábado premium (factor)")}
          {num("rate_holiday", "Feriado (factor)")}
          {num("saturday_free_hours", "Sábado horas base", 0.5)}
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold">Sincronización / módulos</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.sync_on_search}
            onChange={(e) => setForm({ ...form, sync_on_search: e.target.checked })}
          />
          Registrar sync al filtrar ponches
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.remote_punch_enabled}
            onChange={(e) => setForm({ ...form, remote_punch_enabled: e.target.checked })}
          />
          Habilitar ponche remoto (global)
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-red-600 hover:bg-red-500 disabled:bg-zinc-300 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
      >
        {saving ? "Guardando..." : "Guardar configuración"}
      </button>
    </form>
  );
}