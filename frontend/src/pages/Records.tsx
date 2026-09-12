import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { authFetch } from "../lib/api";
import { Btn, PageHeader, Panel } from "../ui/kit";

type PunchRow = {
  id: number;
  codigo: string;
  nombre?: string | null;
  departamento?: string | null;
  fecha?: string | null;
  entrada?: string | null;
  salida?: string | null;
  dispositivo_origen?: string | null;
};
type DeviceRow = { dispositivo: string };

function formatTime(v?: string | null) {
  if (!v) return "—";
  return String(v).slice(0, 8);
}
function formatDate(v?: string | null) {
  if (!v) return "—";
  return String(v).slice(0, 10);
}

export default function Records() {
  const [rows, setRows] = useState<PunchRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [fecha, setFecha] = useState("");
  const [dispositivo, setDispositivo] = useState("todos");
  const [limit, setLimit] = useState(100);

  const loadDevices = async () => {
    try {
      const res = await authFetch("/api/records/devices");
      const data = await res.json();
      setDevices(data.items || data.devices || []);
    } catch {
      setDevices([]);
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (q.trim()) params.set("q", q.trim());
      if (fecha) params.set("fecha", fecha);
      if (dispositivo && dispositivo !== "todos") params.set("dispositivo", dispositivo);
      const res = await authFetch(`/api/records/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      setRows(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los ponches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    load();
  }, []);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    load();
  };

  const conSalida = rows.filter((r) => r.salida).length;
  const abiertos = rows.length - conSalida;

  return (
    <div className="space-y-5 page-enter">
      <PageHeader
        kicker="Asistencia"
        title="Ponches"
        subtitle="BioTimeDB · solo lectura · filtros en vivo"
        actions={
          <Btn tone="primary" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
          </Btn>
        }
      />

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="kpi-tile kpi-violet"><span className="shine" /><p className="text-xs text-white/80">Registros</p><p className="text-3xl font-black">{rows.length}</p></div>
        <div className="kpi-tile kpi-emerald"><span className="shine" /><p className="text-xs text-white/80">Con salida</p><p className="text-3xl font-black">{conSalida}</p></div>
        <div className="kpi-tile kpi-amber"><span className="shine" /><p className="text-xs text-white/80">Sin salida</p><p className="text-3xl font-black">{abiertos}</p></div>
      </div>

      {error ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{error}</p> : null}

      <Panel>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4">
          <label className="md:col-span-2 text-[11px] font-semibold text-zinc-500 uppercase">
            Código / nombre
            <span className="relative block mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full text-sm border rounded-xl pl-8 pr-3 py-2.5" placeholder="62627" />
            </span>
          </label>
          <label className="text-[11px] font-semibold text-zinc-500 uppercase">
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full text-sm border rounded-xl px-3 py-2.5" />
          </label>
          <label className="text-[11px] font-semibold text-zinc-500 uppercase">
            Reloj
            <select value={dispositivo} onChange={(e) => setDispositivo(e.target.value)} className="mt-1 w-full text-sm border rounded-xl px-3 py-2.5 bg-white">
              <option value="todos">Todos</option>
              {devices.map((d) => (
                <option key={d.dispositivo} value={d.dispositivo}>{d.dispositivo}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="text-sm border rounded-xl px-2 py-2.5 bg-white">
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
            <Btn type="submit" tone="primary">Filtrar</Btn>
          </div>
        </form>

        <div className="overflow-auto max-h-[560px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-zinc-500 text-left">
                <th className="py-2">Código</th>
                <th>Nombre</th>
                <th>Depto</th>
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Reloj</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-zinc-400">Cargando…</td></tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-zinc-400">Sin resultados</td></tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="font-medium">{r.nombre || "—"}</td>
                  <td className="text-zinc-500">{r.departamento || "—"}</td>
                  <td>{formatDate(r.fecha)}</td>
                  <td><span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{formatTime(r.entrada)}</span></td>
                  <td><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.salida ? "text-sky-700 bg-sky-50" : "text-amber-700 bg-amber-50"}`}>{formatTime(r.salida)}</span></td>
                  <td className="text-xs text-zinc-500 max-w-[180px] truncate">{r.dispositivo_origen || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}