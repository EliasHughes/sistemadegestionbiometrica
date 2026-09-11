import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

type EmployeeRow = {
  codigo: string;
  nombre: string | null;
  departamento: string | null;
  total_registros: number;
  ultima_fecha: string | null;
  ultimo_dispositivo: string | null;
};

export default function Employees() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (term = search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (term.trim()) params.set("q", term.trim());
      const res = await authFetch(`/api/records/employees?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Error al cargar empleados");
      }
      const data = await res.json();
      setRows(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(q);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Empleados</h2>
          <p className="text-sm text-zinc-500">
            Códigos detectados en BioTimeDB (desde registros de ponches)
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código o nombre..."
            className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
          <button
            type="submit"
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white"
          >
            Buscar
          </button>
        </form>
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
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Depto</th>
                <th className="px-4 py-3 font-semibold">Registros</th>
                <th className="px-4 py-3 font-semibold">Última fecha</th>
                <th className="px-4 py-3 font-semibold">Último dispositivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    Sin resultados
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.codigo} className="hover:bg-zinc-50/80">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-700">{r.codigo}</td>
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{r.nombre || "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.departamento || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-800">
                    {r.total_registros.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {r.ultima_fecha ? String(r.ultima_fecha).slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500 max-w-[200px] truncate">
                    {r.ultimo_dispositivo || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-zinc-100 text-[11px] text-zinc-400">
          {rows.length} empleado(s) · solo lectura
        </div>
      </div>
    </div>
  );
}