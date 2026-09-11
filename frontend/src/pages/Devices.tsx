import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

type Device = {
  name: string;
  punches?: number;
  ip?: string;
  port?: number;
  model?: string;
  location?: string;
  notes?: string;
  active?: boolean;
  online?: boolean;
  latency_ms?: number | null;
};

const emptyForm = {
  name: "",
  ip: "",
  port: 4370,
  model: "",
  location: "",
  notes: "",
  active: true,
};

export default function Devices() {
  const [items, setItems] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const res = await authFetch("/api/records/managed-devices");
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      setItems(data.items || []);
      setError("");
    } catch {
      setError("No se pudieron cargar los dispositivos");
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const openNew = () => {
    setForm(emptyForm);
    setShowForm(true);
    setMsg("");
  };

  const openEdit = (d: Device) => {
    setForm({
      name: d.name,
      ip: d.ip || "",
      port: d.port || 4370,
      model: d.model || "",
      location: d.location || "",
      notes: d.notes || "",
      active: d.active !== false,
    });
    setShowForm(true);
    setMsg("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch("/api/records/managed-devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError("No se pudo guardar");
      return;
    }
    setMsg("Reloj guardado");
    setShowForm(false);
    setForm(emptyForm);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Dispositivos</h2>
          <p className="text-sm text-zinc-500">Ping cada 30 s. Verde = responde · Rojo = no responde</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          Agregar nuevo reloj
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{error}</div>
      )}
      {msg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">{msg}</div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
               {items.map((d) => (
          <div
            key={d.name}
            className={`relative rounded-xl border px-3 py-2.5 ${
              d.online ? "bg-emerald-50/80 border-emerald-200" : "bg-rose-50/80 border-rose-200"
            }`}
          >
            <button
              type="button"
              title="Editar"
              onClick={() => openEdit(d)}
              className="absolute top-2 right-2 w-7 h-7 rounded-md border bg-white text-zinc-500 text-xs"
            >
              ✎
            </button>
            <div className="flex items-center gap-2 pr-8">
              <span className={`w-2 h-2 rounded-full shrink-0 ${d.online ? "bg-emerald-500" : "bg-red-500"}`} />
              <p className="font-semibold text-sm text-zinc-900 truncate">{d.name}</p>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {d.ip || "Sin IP"}
              {d.location ? ` · ${d.location}` : ""}
            </p>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
              <span>{d.punches || 0} ponches</span>
              <span className={d.online ? "text-emerald-700 font-medium" : "text-rose-600"}>
                {d.online ? `${d.latency_ms ?? "—"} ms` : "offline"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={save} className="bg-white border border-zinc-200 rounded-2xl p-4 grid md:grid-cols-2 gap-3">
          <h3 className="md:col-span-2 text-sm font-bold">{form.name ? "Editar reloj" : "Registrar nuevo reloj"}</h3>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre"
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <input
            value={form.ip}
            onChange={(e) => setForm({ ...form, ip: e.target.value })}
            placeholder="IP (necesaria para el ping)"
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <input
            type="number"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            placeholder="Puerto"
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Ubicación"
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="Modelo"
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notas"
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <div className="md:col-span-2 flex gap-2">
            <button type="submit" className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
              }}
              className="text-sm text-zinc-500 px-3"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}