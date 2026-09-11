import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

type Dev = {
  name: string;
  ip: string;
  port: number;
  model: string;
  location: string;
  active: boolean;
  notes: string;
};

const empty: Dev = {
  name: "",
  ip: "",
  port: 4370,
  model: "",
  location: "",
  active: true,
  notes: "",
};

export default function Inventory() {
  const [items, setItems] = useState<Dev[]>([]);
  const [form, setForm] = useState<Dev>(empty);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setErr("");
    try {
      const res = await authFetch("/api/records/inventory-devices");
      if (!res.ok) throw new Error("No se pudo cargar inventario");
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErr("");
    try {
    const res = await authFetch("/api/records/inventory-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Error al guardar");
      }
      setMsg("Reloj guardado");
      setForm(empty);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(`¿Eliminar ${name}?`)) return;
    await authFetch(`/api/records/inventory-devices/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    await load();
  };

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Inventario biométrico</h2>
          <p className="text-sm text-zinc-500">Alta, edición y baja de relojes (IP / puerto)</p>
        </div>
        {err && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            {err}
          </div>
        )}
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-[11px] uppercase text-zinc-500 text-left">
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Puerto</th>
                <th className="px-3 py-2">Ubicación</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-400">
                    Sin relojes. Agrega el primero a la derecha.
                  </td>
                </tr>
              )}
              {items.map((d) => (
                <tr key={d.name} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.ip || "—"}</td>
                  <td className="px-3 py-2">{d.port}</td>
                  <td className="px-3 py-2">{d.location || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        d.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {d.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs font-bold text-red-600"
                      onClick={() => setForm(d)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-xs text-zinc-500"
                      onClick={() => remove(d.name)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={save} className="lg:col-span-2 bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-sm">Agregar / editar reloj</h3>
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre"
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        <input
          value={form.ip}
          onChange={(e) => setForm({ ...form, ip: e.target.value })}
          placeholder="IP (ej: 192.168.1.50)"
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        <input
          type="number"
          value={form.port}
          onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        <input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          placeholder="Modelo"
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        <input
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          placeholder="Ubicación"
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Activo
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Notas"
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2.5 rounded-xl"
        >
          {loading ? "Guardando..." : "Guardar reloj"}
        </button>
        <button
          type="button"
          onClick={() => setForm(empty)}
          className="w-full text-xs text-zinc-500"
        >
          Limpiar formulario
        </button>
      </form>
    </div>
  );
}