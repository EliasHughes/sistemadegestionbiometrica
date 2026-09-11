import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

export default function SqlHistory() {
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
  authFetch("/api/schema/tables")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.tables || d.items || []).map((t: any) =>
          typeof t === "string" ? t : t.TABLE_NAME || t.name
        );
        setTables(list);
      })
      .catch(() => setError("No se pudieron listar tablas"));
  }, []);

  const load = async (name: string) => {
    setTable(name);
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/schema/preview?table=${encodeURIComponent(name)}&limit=80`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Error al leer tabla");
      }
      const data = await res.json();
      setColumns(data.columns || []);
      setRows(data.items || data.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Historial SQL</h2>
        <p className="text-sm text-zinc-500">Solo lectura · BioTimeDB</p>
      </div>
      <select
        value={table}
        onChange={(e) => load(e.target.value)}
        className="text-sm border border-zinc-200 rounded-lg px-3 py-2 max-w-md"
      >
        <option value="">Selecciona una tabla</option>
        {tables.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-[11px] uppercase text-zinc-500">
              {columns.slice(0, 8).map((c) => (
                <th key={c} className="px-3 py-2 text-left">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading && (
              <tr>
                <td className="px-3 py-6 text-zinc-400" colSpan={8}>
                  Cargando...
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.slice(0, 8).map((c) => (
                  <td key={c} className="px-3 py-2 max-w-[180px] truncate">
                    {r[c] == null ? "—" : String(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}