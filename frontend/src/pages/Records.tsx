import { useEffect, useState } from "react";
// frontend/src/pages/Records.tsx
import { authFetch } from "../lib/api";

type PunchRow = {
  id: number;
  codigo: string;
  nombre: string | null;
  departamento: string | null;
  fecha: string;
  entrada: string | null;
  salida: string | null;
  dispositivo_origen: string | null;
};

type DeviceRow = {
  dispositivo: string;
};

export default function Records() {
  const [rows, setRows] = useState<PunchRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [fecha, setFecha] = useState("");
  const [dispositivo, setDispositivo] = useState("todos");
  const [limit, setLimit] = useState(100);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (q.trim()) params.set("q", q.trim());
      if (fecha) params.set("fecha", fecha);
      if (dispositivo && dispositivo !== "todos") params.set("dispositivo", dispositivo);

      const res = await authFetch(`/api/records/search?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Error al cargar ponches");
      }
      const data = await res.json();
      setRows(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/records/devices");
        if (res.ok) {
          const data = await res.json();
          setDevices(data.items || []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, dispositivo, limit]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const formatTime = (t: string | null) => (t ? String(t).slice(0, 8) : "—");
  const formatDate = (d: string) => (d ? String(d).slice(0, 10) : "—");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-zinc-900">Ponches</h2>
        <p className="text-sm text-zinc-500">
          Filtros por fecha, reloj y empleado · BioTimeDB · solo lectura
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      >
        <div className="md:col-span-2">
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase mb-1">
            Código / nombre
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej: 62627"
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase mb-1">
            Fecha
          </label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase mb-1">
            Reloj
          </label>
          <select
            value={dispositivo}
            onChange={(e) => setDispositivo(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="todos">Todos</option>
            {devices.map((d) => (
              <option key={d.dispositivo} value={d.dispositivo}>
                {d.dispositivo}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-sm border border-zinc-200 rounded-lg px-2 py-2 bg-white"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
          <button
            type="submit"
            className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white"
          >
            Filtrar
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Depto</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Entrada</th>
                <th className="px-4 py-3 font-semibold">Salida</th>
                <th className="px-4 py-3 font-semibold">Dispositivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                    Sin resultados
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/80">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.codigo}</td>
                  <td className="px-4 py-2.5 font-medium">{r.nombre || "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.departamento || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {formatTime(r.entrada)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full">
                      {formatTime(r.salida)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-[180px] truncate">
                    {r.dispositivo_origen || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-zinc-100 text-[11px] text-zinc-400">
          {rows.length} registro(s) · {loading ? "actualizando..." : "listo"}
        </div>
      </div>
    </div>
  );
}