import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

type SyncRow = {
  id?: number;
  fecha?: string;
  evento?: string;
  detalle?: string;
  registros?: number;
  estado?: string;
  [key: string]: unknown;
};

export default function SyncHistory() {
  const [rows, setRows] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/records/sync-history?limit=150");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          typeof d.detail === "string" ? d.detail : "Error al cargar historial"
        );
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

  const syncNow = async () => {
    setSyncing(true);
    setError("");
    try {
      const res = await authFetch("/api/records/sync-now", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          typeof d.detail === "string" ? d.detail : "Error al sincronizar"
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Historial Sync</h2>
          <p className="text-sm text-zinc-500">
            Registro de lecturas a BioTimeDB · log de la aplicación
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading || syncing}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700"
          >
            Actualizar
          </button>
          <button
            onClick={syncNow}
            disabled={loading || syncing}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-zinc-300 text-white"
          >
            {syncing ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
        </div>
      </div>

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
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Evento</th>
                <th className="px-4 py-3 font-semibold">Detalle</th>
                <th className="px-4 py-3 font-semibold">Registros</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                    Sin sincronizaciones aún. Usa &quot;Sincronizar ahora&quot;.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.id ?? i} className="hover:bg-zinc-50/80">
                  <td className="px-4 py-2.5 whitespace-nowrap text-zinc-700">
                    {fmt(row.fecha)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-zinc-900">
                    {fmt(row.evento)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600 max-w-[280px] truncate">
                    {fmt(row.detalle)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{fmt(row.registros)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        String(row.estado).toLowerCase() === "ok"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {fmt(row.estado)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-zinc-100 text-[11px] text-zinc-400">
          {rows.length} registro(s)
        </div>
      </div>
    </div>
  );
}